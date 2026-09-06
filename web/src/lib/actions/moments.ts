"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createSignedMomentPhotoUrl, momentPhotoPath, MOMENT_PHOTOS_BUCKET } from "@/lib/photos";
import { resolveCity } from "@/lib/actions/cities";
import type { ActionResult } from "@/lib/actions/auth";
import type { CatalogCity } from "@/lib/cities-catalog";

export interface MomentCardData {
  id: string;
  caption: string | null;
  createdAt: string;
  pinLat: number | null;
  pinLng: number | null;
  photoUrl: string | null;
  author: { id: string; username: string };
  city: { id: string; name: string; region: string | null; country: string };
  trip: { id: string; name: string } | null;
  participants: { id: string; username: string }[];
}

const MOMENT_SELECT = `
  id, caption, created_at, pin_lat, pin_lng, photo_path, user_id,
  author:user_id (id, username),
  user_city:user_city_id ( city:city_id ( id, name, region, country ) ),
  trip:trip_id ( id, name ),
  moment_participants ( profile:user_id ( id, username ) )
`;

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

/**
 * Turns a raw `moments` row into card data, minting a signed photo URL.
 *
 * The `moments` select this feeds from is already RLS-scoped to "mine or a
 * friend's" (layer 1). Before minting the signed URL -- which uses the admin
 * client and so bypasses RLS entirely -- this does an explicit second check
 * via the same public.are_friends() the RLS policy uses (layer 2), rather
 * than trusting that layer 1 ran (CLAUDE.md non-negotiables #2 and #3).
 */
interface RawMomentRow {
  id: string;
  caption: string | null;
  created_at: string;
  pin_lat: number | null;
  pin_lng: number | null;
  photo_path: string;
  user_id: string;
  author: { id: string; username: string };
  user_city: { city: { id: string; name: string; region: string | null; country: string } };
  trip: { id: string; name: string } | null;
  moment_participants: { profile: { id: string; username: string } }[];
}

async function toCardData(
  row: RawMomentRow,
  currentUserId: string,
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<MomentCardData | null> {
  let visible = row.user_id === currentUserId;
  if (!visible) {
    const { data } = await supabase.rpc("are_friends", { a: currentUserId, b: row.user_id });
    visible = data === true;
  }
  if (!visible) return null;

  const photoUrl = await createSignedMomentPhotoUrl(row.photo_path);
  return {
    id: row.id,
    caption: row.caption,
    createdAt: row.created_at,
    pinLat: row.pin_lat,
    pinLng: row.pin_lng,
    photoUrl,
    author: row.author,
    city: row.user_city.city,
    trip: row.trip,
    participants: (row.moment_participants ?? []).map((p) => p.profile),
  };
}

/** Friends-only reverse-chronological feed: yourself + accepted friends. Nothing else -- no ranking, ever. */
export async function listFeed(): Promise<MomentCardData[]> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_SELECT)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as RawMomentRow[];
  const cards = await Promise.all(rows.map((row) => toCardData(row, userId, supabase)));
  return cards.filter((c): c is MomentCardData => c !== null);
}

export interface MyCityRow {
  cityId: string;
  name: string;
  region: string | null;
  country: string;
  momentCount: number;
}

/** The signed-in user's own running collection, grouped by city. */
export async function listMyCities(): Promise<MyCityRow[]> {
  const { supabase, userId } = await requireUser();
  const { data, error } = await supabase
    .from("user_cities")
    .select("city:city_id (id, name, region, country), moments(count)")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);

  interface RawUserCityRow {
    city: { id: string; name: string; region: string | null; country: string };
    moments: { count: number }[];
  }

  return ((data ?? []) as unknown as RawUserCityRow[]).map((row) => ({
    cityId: row.city.id,
    name: row.city.name,
    region: row.city.region,
    country: row.city.country,
    momentCount: row.moments?.[0]?.count ?? 0,
  }));
}

/** The signed-in user's own moments within one city, newest first. */
export async function listMyCityMoments(cityId: string): Promise<MomentCardData[]> {
  const { supabase, userId } = await requireUser();

  const { data: userCity, error: userCityError } = await supabase
    .from("user_cities")
    .select("id")
    .eq("user_id", userId)
    .eq("city_id", cityId)
    .maybeSingle();
  if (userCityError) throw new Error(userCityError.message);
  if (!userCity) return [];

  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_SELECT)
    .eq("user_city_id", userCity.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const cityRows = (data ?? []) as unknown as RawMomentRow[];
  const cards = await Promise.all(cityRows.map((row) => toCardData(row, userId, supabase)));
  return cards.filter((c): c is MomentCardData => c !== null);
}

export async function createMoment(formData: FormData): Promise<ActionResult> {
  const { supabase, userId } = await requireUser();

  const cityRaw = String(formData.get("city") ?? "");
  const caption = String(formData.get("caption") ?? "").trim() || null;
  const pinLatRaw = String(formData.get("pinLat") ?? "").trim();
  const pinLngRaw = String(formData.get("pinLng") ?? "").trim();
  const tripId = String(formData.get("tripId") ?? "").trim() || null;
  const participantIds = formData.getAll("participantIds").map(String).filter(Boolean);
  const photo = formData.get("photo");

  let city: CatalogCity;
  try {
    city = JSON.parse(cityRaw);
  } catch {
    return { error: "Pick a city from the list." };
  }
  if (!city?.name || !city?.country) return { error: "Pick a city from the list." };
  if (!(photo instanceof File) || photo.size === 0) return { error: "A photo is required." };

  let cityRow;
  try {
    cityRow = await resolveCity(city);
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Could not resolve city." };
  }

  // Find-or-create this user's collection for the city (first Moment there
  // creates the UserCity row, per README).
  const { data: existingUserCity } = await supabase
    .from("user_cities")
    .select("id")
    .eq("user_id", userId)
    .eq("city_id", cityRow.id)
    .maybeSingle();

  let userCityId = existingUserCity?.id as string | undefined;
  if (!userCityId) {
    const { data: createdUserCity, error: userCityError } = await supabase
      .from("user_cities")
      .insert({ user_id: userId, city_id: cityRow.id })
      .select("id")
      .single();
    if (userCityError) return { error: userCityError.message };
    userCityId = createdUserCity.id;
  }

  const momentId = randomUUID();
  const photoPath = momentPhotoPath(userId, momentId, photo.name || "photo");

  // Uploaded with the RLS-scoped client (not the admin client): storage's own
  // RLS policy -- insert only into "<auth.uid()>/..." -- is the independent
  // enforcement layer here, on top of this action already knowing whose
  // moment this is.
  const { error: uploadError } = await supabase.storage
    .from(MOMENT_PHOTOS_BUCKET)
    .upload(photoPath, photo, {
      contentType: photo.type || "application/octet-stream",
    });
  if (uploadError) return { error: uploadError.message };

  const { error: momentError } = await supabase.from("moments").insert({
    id: momentId,
    user_city_id: userCityId,
    user_id: userId,
    trip_id: tripId,
    photo_path: photoPath,
    caption,
    pin_lat: pinLatRaw ? Number(pinLatRaw) : null,
    pin_lng: pinLngRaw ? Number(pinLngRaw) : null,
  });
  if (momentError) return { error: momentError.message };

  if (participantIds.length > 0) {
    const rows = participantIds.map((participantUserId) => ({
      moment_id: momentId,
      user_id: participantUserId,
    }));
    // Best-effort: a bad participant (not actually a friend) is rejected by
    // RLS per-row and simply doesn't get tagged, without failing the moment.
    await supabase.from("moment_participants").insert(rows);
  }

  revalidatePath("/feed");
  revalidatePath("/cities");
  return {};
}
