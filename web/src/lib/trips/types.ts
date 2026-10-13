import type { MomentWithPhoto } from "@/lib/moments/types";

/** A `public.trips` row as this feature reads it. */
export interface TripRow {
  id: string;
  name: string;
  startsOn: string | null;
  endsOn: string | null;
  createdAt: string;
}

/** A trip in the index, with just enough to render a card. */
export interface TripSummary extends TripRow {
  momentCount: number;
  /** Distinct city names in the trip, ordered as the detail page groups them. */
  cityNames: string[];
  /** A signed URL for one photo from the trip, or null when it has none yet. */
  coverPhotoUrl: string | null;
}

/** The detail view groups by city. */
export interface TripCityGroup {
  cityId: string;
  cityName: string;
  moments: MomentWithPhoto[];
}

export interface TripDetail {
  trip: TripRow;
  groups: TripCityGroup[];
  momentCount: number;
}

/** A moment as the assign-to-trip picker lists it. */
export interface AssignableMoment {
  id: string;
  caption: string | null;
  takenAt: string;
  cityName: string;
  photoUrl: string | null;
  /** The trip it is already in, if any, so the picker can show what moves. */
  tripId: string | null;
}

export type TripActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
