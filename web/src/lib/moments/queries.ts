import "server-only";

import type { CityRow } from "@/lib/cities/types";
import { createClient } from "@/lib/supabase/server";
import { signCollectionCovers, signMomentPhotos } from "./photo-url";
import type { MomentDetail, MomentRow, PlaceDetail, PlaceSummary, UserCityRow } from "./types";

/**
 * Reads for the collection views.
 *
 * All of these run through the request-scoped client, so row level security is
 * doing the filtering. Where a query also names `user_id`, that is the second
 * of CLAUDE.md's two checks rather than the only one -- a policy that got
 * loosened by mistake would still not widen these results.
 */

const MOMENT_COLUMNS =
  "id, userId:user_id, userCityId:user_city_id, photoPath:photo_path, width, height, caption, takenAt:taken_at, pinLat:pin_lat, pinLng:pin_lng, visibility, createdAt:created_at, updatedAt:updated_at";

const COLLECTION_COLUMNS =
  "id, userId:user_id, cityId:city_id, momentCount:moment_count, firstMomentAt:first_moment_at, lastMomentAt:last_moment_at, coverPhotoPath:cover_photo_path";

/**
 * Embedded through the single-column `user_cities.city_id` foreign key. The
 * moments table deliberately is not embedded anywhere: it reaches `user_cities`
 * through a two-column key, and a relationship that has to be inferred is a
 * runtime failure rather than a compile-time one.
 */
const CITY_COLUMNS =
  "id, provider, provider_place_id, name, admin1, country_code, display_name, lat, lng, created_at";

interface CollectionWithCity extends UserCityRow {
  city: CityRow | null;
}

/**
 * A person's cities, most recently visited first.
 *
 * Collections whose count has fallen to zero are hidden rather than deleted.
 * The row is worth keeping -- it is the identity the next photo from that city
 * attaches to, and deleting collections is what would strand photo objects in
 * the bucket -- but a card reading "0 moments" with no cover is not a place
 * anybody has been.
 */
export async function listPlaces(userId: string): Promise<PlaceSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_cities")
    .select(`${COLLECTION_COLUMNS}, city:cities(${CITY_COLUMNS})`)
    .eq("user_id", userId)
    .gt("moment_count", 0)
    .order("last_moment_at", { ascending: false, nullsFirst: false });

  if (error) {
    throw new Error(`Could not load your places: ${error.message}`);
  }

  const rows = (data ?? []) as unknown as CollectionWithCity[];
  const covers = await signCollectionCovers(rows.map((row) => row.id));

  return rows
    .filter((row): row is CollectionWithCity & { city: CityRow } => row.city !== null)
    .map((row) => ({
      cityId: row.city.id,
      cityName: row.city.name,
      cityDisplayName: row.city.display_name,
      momentCount: row.momentCount,
      firstMomentAt: row.firstMomentAt,
      lastMomentAt: row.lastMomentAt,
      coverPhotoUrl: covers.get(row.id) ?? null,
    }));
}

/**
 * One city's collection, oldest photo first.
 *
 * Chronological rather than reverse-chronological, unlike everything else in
 * the app. The feed is a stream and reads newest-first; this page is the
 * README's "everywhere I've been to Chicago", which is a history -- and a
 * history told backwards is a strange thing to scroll.
 *
 * Null when the person has no moments there.
 */
export async function getPlace(userId: string, cityId: string): Promise<PlaceDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("user_cities")
    .select(`${COLLECTION_COLUMNS}, city:cities(${CITY_COLUMNS})`)
    .eq("user_id", userId)
    .eq("city_id", cityId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load that place: ${error.message}`);
  }

  const collection = data as unknown as CollectionWithCity | null;
  if (!collection?.city) return null;

  const { data: momentData, error: momentError } = await supabase
    .from("moments")
    .select(MOMENT_COLUMNS)
    .eq("user_city_id", collection.id)
    .order("taken_at", { ascending: true })
    // Two photos from the same minute need a stable tiebreak, or the grid
    // reshuffles between renders.
    .order("created_at", { ascending: true });

  if (momentError) {
    throw new Error(`Could not load that place's moments: ${momentError.message}`);
  }

  const moments = (momentData ?? []) as unknown as MomentRow[];
  const photos = await signMomentPhotos(moments.map((moment) => moment.id));

  return {
    city: collection.city,
    collection,
    moments: moments.map((moment) => ({ ...moment, photoUrl: photos.get(moment.id) ?? null })),
  };
}

/**
 * One moment, plus whether the caller owns it.
 *
 * The select is not filtered to the caller: a friend's moment is readable by
 * policy, and this is the page that renders it. Ownership only decides whether
 * the edit controls appear -- and the actions behind those controls check it
 * again, because a hidden button is a UI decision, not a permission.
 */
export async function getMoment(userId: string, momentId: string): Promise<MomentDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_COLUMNS)
    .eq("id", momentId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not load that moment: ${error.message}`);
  }

  const moment = data as unknown as MomentRow | null;
  if (!moment) return null;

  const { data: collectionData, error: collectionError } = await supabase
    .from("user_cities")
    .select(`id, city:cities(${CITY_COLUMNS})`)
    .eq("id", moment.userCityId)
    .maybeSingle();

  if (collectionError) {
    throw new Error(`Could not load that moment's city: ${collectionError.message}`);
  }

  const city = (collectionData as unknown as { city: CityRow | null } | null)?.city ?? null;
  if (!city) return null;

  const photos = await signMomentPhotos([moment.id]);

  return {
    moment: { ...moment, photoUrl: photos.get(moment.id) ?? null },
    city,
    isOwner: moment.userId === userId,
  };
}
