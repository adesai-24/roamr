import "server-only";

import type { CityRow } from "@/lib/cities/types";
import { createClient } from "@/lib/supabase/server";
import { signCollectionCovers, signMomentPhotos } from "./photo-url";
import type { MomentDetail, MomentRow, PlaceDetail, PlaceSummary, UserCityRow } from "./types";

/** Reads for the collection views. */

const MOMENT_COLUMNS =
  "id, userId:user_id, userCityId:user_city_id, photoPath:photo_path, width, height, caption, takenAt:taken_at, pinLat:pin_lat, pinLng:pin_lng, visibility, createdAt:created_at, updatedAt:updated_at";

const COLLECTION_COLUMNS =
  "id, userId:user_id, cityId:city_id, momentCount:moment_count, firstMomentAt:first_moment_at, lastMomentAt:last_moment_at, coverPhotoPath:cover_photo_path";

/** Embedded through the single-column `user_cities.city_id` foreign key. */
const CITY_COLUMNS =
  "id, provider, provider_place_id, name, admin1, country_code, display_name, lat, lng, created_at";

interface CollectionWithCity extends UserCityRow {
  city: CityRow | null;
}

/** A person's cities, most recently visited first. */
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
  const covers = await signCollectionCovers(rows);

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

/** One city's collection, oldest photo first. */
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
    .order("created_at", { ascending: true });

  if (momentError) {
    throw new Error(`Could not load that place's moments: ${momentError.message}`);
  }

  const moments = (momentData ?? []) as unknown as MomentRow[];
  const photos = await signMomentPhotos(moments);

  return {
    city: collection.city,
    collection,
    moments: moments.map((moment) => ({ ...moment, photoUrl: photos.get(moment.id) ?? null })),
  };
}

/** One moment, plus whether the caller owns it. */
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

  const photos = await signMomentPhotos([moment]);

  return {
    moment: { ...moment, photoUrl: photos.get(moment.id) ?? null },
    city,
    isOwner: moment.userId === userId,
  };
}
