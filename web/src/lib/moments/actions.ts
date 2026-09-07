"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { findCityByProviderPlaceId, resolveCity } from "@/lib/cities/resolve";
import type { CityRow } from "@/lib/cities/types";
import { getGeocodingProvider } from "@/lib/geocoding";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildMomentPhotoPath,
  isMomentPhotoPathOwnedBy,
  MOMENT_PHOTO_BUCKET,
  newPhotoObjectId,
} from "./photo-path";
import { deletePhotoObjects } from "./photo-url";
import type {
  CitySelection,
  CreateMomentInput,
  MomentActionResult,
  MomentUploadTarget,
  UpdateMomentInput,
} from "./types";

/** Every mutation in the core loop. */

/** Matches the CHECK constraint on `moments.caption`. */
const MAX_CAPTION_LENGTH = 500;

const captionSchema = z
  .string()
  .trim()
  .max(MAX_CAPTION_LENGTH, "That caption is too long.")
  .nullable()
  // An empty textarea means "no caption", not a caption that is the empty string.
  .transform((value) => (value && value.length > 0 ? value : null));

const citySelectionSchema = z.object({
  providerPlaceId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  admin1: z.string().trim().max(200).nullable(),
  countryCode: z.string().trim().min(2).max(8).nullable(),
  displayName: z.string().trim().min(1).max(400),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const citySchema = z.union([z.string().trim().min(1).max(200), citySelectionSchema]);

/** Both or neither, mirroring the moments_pin_paired constraint. */
const pinSchema = z
  .object({
    pinLat: z.number().min(-90).max(90).nullable(),
    pinLng: z.number().min(-180).max(180).nullable(),
  })
  .refine((pin) => (pin.pinLat === null) === (pin.pinLng === null), {
    message: "A pin needs both a latitude and a longitude.",
  });

const takenAtSchema = z
  .string()
  .nullable()
  .refine((value) => value === null || !Number.isNaN(Date.parse(value)), {
    message: "That capture time is not a date.",
  });

const uuidSchema = z.string().uuid();

const createMomentSchema = z
  .object({
    photoPath: z.string().min(1).max(300),
    width: z.number().int().positive().max(10000),
    height: z.number().int().positive().max(10000),
    caption: captionSchema,
    takenAt: takenAtSchema,
    city: citySchema,
  })
  .and(pinSchema);

const updateMomentSchema = z
  .object({
    momentId: uuidSchema,
    caption: captionSchema,
    city: citySchema,
  })
  .and(pinSchema);

async function requireUserId(): Promise<MomentActionResult<string>> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, error: "Sign in to add moments." };
  }
  return { ok: true, data: user.id };
}

function firstIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? "That does not look right.";
}

/** One city write path, reused rather than reimplemented, see CLAUDE.md. */
async function resolveSelection(city: string | CitySelection): Promise<CityRow | null> {
  if (typeof city === "string") {
    return findCityByProviderPlaceId(city);
  }
  return resolveCity(city);
}

/** The collection a moment lands in, created on first use. */
async function ensureCollection(userId: string, cityId: string): Promise<string> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_cities")
    .upsert(
      { user_id: userId, city_id: cityId },
      { onConflict: "user_id,city_id", ignoreDuplicates: true },
    )
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Could not open your collection for that city: ${error.message}`);
  }
  if (data) return (data as { id: string }).id;

  const { data: existing, error: readError } = await supabase
    .from("user_cities")
    .select("id")
    .eq("user_id", userId)
    .eq("city_id", cityId)
    .maybeSingle();

  if (readError || !existing) {
    throw new Error("Could not open your collection for that city.");
  }
  return (existing as { id: string }).id;
}

/** A place to put the bytes. */
export async function createPhotoUploadTargetAction(): Promise<
  MomentActionResult<MomentUploadTarget>
> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const path = buildMomentPhotoPath(auth.data, newPhotoObjectId());

  const { data, error } = await createAdminClient()
    .storage.from(MOMENT_PHOTO_BUCKET)
    .createSignedUploadUrl(path);

  if (error || !data) {
    console.error("Could not create a photo upload target", error);
    return { ok: false, error: "Could not start that upload. Try again in a moment." };
  }

  return { ok: true, data: { bucket: MOMENT_PHOTO_BUCKET, path: data.path, token: data.token } };
}

/** The city a photo's own GPS points at. */
export async function suggestCityAction(
  lat: number,
  lng: number,
): Promise<MomentActionResult<CityRow | null>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const parsed = pinSchema.safeParse({ pinLat: lat, pinLng: lng });
  if (!parsed.success) {
    return { ok: false, error: "That location is not valid." };
  }

  try {
    const found = await getGeocodingProvider().reverseCity(lat, lng);
    if (!found) return { ok: true, data: null };
    return { ok: true, data: await resolveCity(found) };
  } catch (cause) {
    // The cause can carry the request URL, and that URL carries the token.
    console.error("Reverse geocoding failed", cause);
    return { ok: false, error: "Could not work out where that photo was taken." };
  }
}

export async function createMomentAction(
  input: CreateMomentInput,
): Promise<MomentActionResult<{ momentId: string; cityId: string }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const userId = auth.data;

  const parsed = createMomentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  const value = parsed.data;

  // The database says the same thing in a CHECK constraint.
  if (!isMomentPhotoPathOwnedBy(value.photoPath, userId)) {
    return { ok: false, error: "That photo does not belong to this upload." };
  }

  try {
    const city = await resolveSelection(value.city);
    if (!city) {
      return { ok: false, error: "That city has not been added yet. Search for it again." };
    }

    const collectionId = await ensureCollection(userId, city.id);
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("moments")
      .insert({
        user_id: userId,
        user_city_id: collectionId,
        photo_path: value.photoPath,
        width: value.width,
        height: value.height,
        caption: value.caption,
        // Null lets the column default to now().
        taken_at: value.takenAt ?? undefined,
        pin_lat: value.pinLat,
        pin_lng: value.pinLng,
      })
      .select("id")
      .single();

    if (error || !data) {
      // The bytes are already in the bucket and now have no row pointing at them.
      await deletePhotoObjects([value.photoPath]);
      console.error("Could not create moment", error);
      return { ok: false, error: "Could not save that moment. Try again in a moment." };
    }

    revalidatePath("/places");
    revalidatePath(`/places/${city.id}`);

    return { ok: true, data: { momentId: (data as { id: string }).id, cityId: city.id } };
  } catch (cause) {
    console.error("Could not create moment", cause);
    return { ok: false, error: "Could not save that moment. Try again in a moment." };
  }
}

export async function updateMomentAction(
  input: UpdateMomentInput,
): Promise<MomentActionResult<{ momentId: string; cityId: string }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const userId = auth.data;

  const parsed = updateMomentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: firstIssue(parsed.error) };
  }
  const value = parsed.data;

  try {
    const supabase = await createClient();

    // Read first, filtered to the owner.
    const { data: existing, error: readError } = await supabase
      .from("moments")
      .select("id, user_city_id")
      .eq("id", value.momentId)
      .eq("user_id", userId)
      .maybeSingle();

    if (readError || !existing) {
      return { ok: false, error: "That moment is not yours to edit." };
    }

    const city = await resolveSelection(value.city);
    if (!city) {
      return { ok: false, error: "That city has not been added yet. Search for it again." };
    }

    const collectionId = await ensureCollection(userId, city.id);

    const { error } = await supabase
      .from("moments")
      .update({
        user_city_id: collectionId,
        caption: value.caption,
        pin_lat: value.pinLat,
        pin_lng: value.pinLng,
      })
      .eq("id", value.momentId)
      .eq("user_id", userId);

    if (error) {
      console.error("Could not update moment", error);
      return { ok: false, error: "Could not save those changes. Try again in a moment." };
    }

    revalidatePath("/places");
    revalidatePath(`/places/${city.id}`);
    revalidatePath(`/moments/${value.momentId}`);

    return { ok: true, data: { momentId: value.momentId, cityId: city.id } };
  } catch (cause) {
    console.error("Could not update moment", cause);
    return { ok: false, error: "Could not save those changes. Try again in a moment." };
  }
}

export async function deleteMomentAction(
  momentId: string,
): Promise<MomentActionResult<{ cityId: string | null }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;
  const userId = auth.data;

  const parsed = uuidSchema.safeParse(momentId);
  if (!parsed.success) {
    return { ok: false, error: "That moment does not exist." };
  }

  try {
    const supabase = await createClient();

    const { data: existing, error: readError } = await supabase
      .from("moments")
      .select("id, photo_path, user_city_id")
      .eq("id", parsed.data)
      .eq("user_id", userId)
      .maybeSingle();

    if (readError || !existing) {
      return { ok: false, error: "That moment is not yours to delete." };
    }
    const moment = existing as { photo_path: string; user_city_id: string };

    const { data: collection } = await supabase
      .from("user_cities")
      .select("city_id")
      .eq("id", moment.user_city_id)
      .maybeSingle();

    const { error } = await supabase
      .from("moments")
      .delete()
      .eq("id", parsed.data)
      .eq("user_id", userId);

    if (error) {
      console.error("Could not delete moment", error);
      return { ok: false, error: "Could not delete that moment. Try again in a moment." };
    }

    // Row first, then bytes.
    await deletePhotoObjects([moment.photo_path]);

    const cityId = (collection as { city_id: string } | null)?.city_id ?? null;
    revalidatePath("/places");
    if (cityId) revalidatePath(`/places/${cityId}`);

    return { ok: true, data: { cityId } };
  } catch (cause) {
    console.error("Could not delete moment", cause);
    return { ok: false, error: "Could not delete that moment. Try again in a moment." };
  }
}
