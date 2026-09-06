import "server-only";

import { signMomentPhotos } from "@/lib/moments/photo-url";
import type { MomentWithPhoto } from "@/lib/moments/types";
import { createClient } from "@/lib/supabase/server";
import type { AssignableMoment, TripCityGroup, TripDetail, TripSummary } from "./types";

/**
 * Reads go through the request-scoped client, so the trips select policy is
 * what decides what comes back. Nothing here filters by owner in TypeScript:
 * the policy already does it, and a redundant filter would quietly become the
 * only protection the day someone edits the policy.
 */

const TRIP_COLUMNS = "id, name, startsOn:starts_on, endsOn:ends_on, createdAt:created_at";

/** Shape PostgREST returns for a moment joined to its collection and city. */
interface MomentJoinRow {
  id: string;
  userId: string;
  tripId: string | null;
  userCityId: string;
  photoPath: string;
  width: number;
  height: number;
  caption: string | null;
  takenAt: string;
  pinLat: number | null;
  pinLng: number | null;
  visibility: "friends" | "public";
  createdAt: string;
  updatedAt: string;
  user_cities: { city_id: string; cities: { id: string; display_name: string } | null } | null;
}

// Selects every column MomentWithPhoto declares, so the rows can be handed to
// the same components the places views use without a mapping layer in between.
const MOMENT_JOIN_COLUMNS =
  "id, userId:user_id, tripId:trip_id, userCityId:user_city_id, photoPath:photo_path, " +
  "width, height, caption, takenAt:taken_at, pinLat:pin_lat, pinLng:pin_lng, visibility, " +
  "createdAt:created_at, updatedAt:updated_at, " +
  "user_cities!inner(city_id, cities!inner(id, display_name))";

function cityOf(row: MomentJoinRow): { id: string; name: string } {
  const city = row.user_cities?.cities;
  return { id: city?.id ?? "unknown", name: city?.display_name ?? "Unknown place" };
}

/**
 * The trips index.
 *
 * Two round trips rather than one: the trips, then every moment belonging to
 * them. Aggregating city names and a cover per trip in SQL would need a view or
 * an RPC, and at the scale of one person's trips the join is not the cost --
 * the photo signing below is.
 */
export async function listTrips(): Promise<TripSummary[]> {
  const supabase = await createClient();

  const { data: tripRows, error } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load trips: ${error.message}`);
  const trips = (tripRows ?? []) as TripSummary[];
  if (trips.length === 0) return [];

  const { data: momentRows } = await supabase
    .from("moments")
    .select(MOMENT_JOIN_COLUMNS)
    .in(
      "trip_id",
      trips.map((t) => t.id),
    )
    .order("taken_at", { ascending: true });

  const moments = (momentRows ?? []) as unknown as MomentJoinRow[];

  // One photo per trip is signed, not all of them: signing is a network call
  // per object, and the index only ever shows a cover.
  const coverByTrip = new Map<string, MomentJoinRow>();
  const citiesByTrip = new Map<string, string[]>();
  const countByTrip = new Map<string, number>();

  for (const moment of moments) {
    if (!moment.tripId) continue;
    if (!coverByTrip.has(moment.tripId)) coverByTrip.set(moment.tripId, moment);
    countByTrip.set(moment.tripId, (countByTrip.get(moment.tripId) ?? 0) + 1);

    const names = citiesByTrip.get(moment.tripId) ?? [];
    const name = cityOf(moment).name;
    if (!names.includes(name)) names.push(name);
    citiesByTrip.set(moment.tripId, names);
  }

  const signed = await signMomentPhotos([...coverByTrip.values()].map((m) => m.id));

  return trips.map((trip) => ({
    ...trip,
    momentCount: countByTrip.get(trip.id) ?? 0,
    cityNames: citiesByTrip.get(trip.id) ?? [],
    coverPhotoUrl: signed.get(coverByTrip.get(trip.id)?.id ?? "") ?? null,
  }));
}

/**
 * One trip, its moments grouped by city.
 *
 * Returns null rather than throwing when the trip is not visible, so a page can
 * answer 404 without distinguishing "does not exist" from "not yours" -- which
 * would otherwise let someone probe for trip ids.
 */
export async function getTrip(tripId: string): Promise<TripDetail | null> {
  const supabase = await createClient();

  const { data: tripRow } = await supabase
    .from("trips")
    .select(TRIP_COLUMNS)
    .eq("id", tripId)
    .maybeSingle();

  if (!tripRow) return null;

  const { data: momentRows } = await supabase
    .from("moments")
    .select(MOMENT_JOIN_COLUMNS)
    .eq("trip_id", tripId)
    .order("taken_at", { ascending: true });

  const moments = (momentRows ?? []) as unknown as MomentJoinRow[];
  const signed = await signMomentPhotos(moments.map((m) => m.id));

  // Insertion-ordered: the moments arrive by time, so cities appear in the
  // order the trip actually visited them.
  const groups = new Map<string, TripCityGroup>();
  for (const row of moments) {
    const city = cityOf(row);
    const group = groups.get(city.id) ?? { cityId: city.id, cityName: city.name, moments: [] };
    const { user_cities: _joined, ...moment } = row;
    group.moments.push({ ...moment, photoUrl: signed.get(row.id) ?? null } as MomentWithPhoto);
    groups.set(city.id, group);
  }

  return {
    trip: tripRow as TripDetail["trip"],
    groups: [...groups.values()],
    momentCount: moments.length,
  };
}

/**
 * The moments a person can put into a trip: their own, most recent first.
 *
 * Capped rather than paginated. Assigning happens right after a trip is made,
 * when the moments in question are recent by definition, and an unbounded list
 * would sign a signed URL per photo for an entire history.
 */
export async function listAssignableMoments(
  userId: string,
  limit = 60,
): Promise<AssignableMoment[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("moments")
    .select(MOMENT_JOIN_COLUMNS)
    .eq("user_id", userId)
    .order("taken_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Could not load your moments: ${error.message}`);

  const moments = (data ?? []) as unknown as MomentJoinRow[];
  const signed = await signMomentPhotos(moments.map((m) => m.id));

  return moments.map((row) => ({
    id: row.id,
    caption: row.caption,
    takenAt: row.takenAt,
    cityName: cityOf(row).name,
    photoUrl: signed.get(row.id) ?? null,
    tripId: row.tripId,
  }));
}
