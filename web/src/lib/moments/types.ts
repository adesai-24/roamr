import type { CityRow } from "@/lib/cities/types";

/**
 * Row shapes for `public.user_cities` and `public.moments`, hand-declared for
 * the same reason `@/lib/cities/types` is: `supabase gen types` writes one file
 * for the whole schema, several feature branches are open at once, and that
 * file is a guaranteed conflict on every merge. The cost is keeping these in
 * step with 20260107000000_moments.sql by hand.
 *
 * `pin_geom` is intentionally absent -- it is generated from the lat/lng pair
 * and selecting a geography would hand TypeScript a hex string it has no use
 * for.
 */

export type MomentVisibility = "friends" | "public";

/** Camel-cased by PostgREST aliases at the query, not by a hand-written mapper. */
export interface MomentRow {
  id: string;
  userId: string;
  userCityId: string;
  photoPath: string;
  width: number;
  height: number;
  caption: string | null;
  takenAt: string;
  pinLat: number | null;
  pinLng: number | null;
  visibility: MomentVisibility;
  createdAt: string;
  updatedAt: string;
}

export interface UserCityRow {
  id: string;
  userId: string;
  cityId: string;
  momentCount: number;
  firstMomentAt: string | null;
  lastMomentAt: string | null;
  coverPhotoPath: string | null;
}

/** One card on /places: the collection, the city it is for, and a cover image. */
export interface PlaceSummary {
  cityId: string;
  cityName: string;
  cityDisplayName: string;
  momentCount: number;
  firstMomentAt: string | null;
  lastMomentAt: string | null;
  /** A signed URL, already minted. Null when the cover photo could not be signed. */
  coverPhotoUrl: string | null;
}

/** A moment plus the signed URL its photo is readable through, for this render only. */
export interface MomentWithPhoto extends MomentRow {
  photoUrl: string | null;
}

export interface PlaceDetail {
  city: CityRow;
  collection: UserCityRow;
  moments: MomentWithPhoto[];
}

export interface MomentDetail {
  moment: MomentWithPhoto;
  city: CityRow;
  /** False when viewing a friend's moment, which is read-only. */
  isOwner: boolean;
}

/**
 * What every moments server action returns.
 *
 * A discriminated union rather than a thrown error, matching the city actions:
 * a rejected action reaches the browser as an opaque "an error occurred", which
 * cannot tell a user that their upload expired from a user that their caption
 * was too long.
 */
export type MomentActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

/** Where the browser puts the photo, and the token that lets it. */
export interface MomentUploadTarget {
  bucket: string;
  path: string;
  token: string;
}

export interface CreateMomentInput {
  photoPath: string;
  width: number;
  height: number;
  caption: string | null;
  /** ISO 8601. Null when the file carried no capture time; the server uses now(). */
  takenAt: string | null;
  pinLat: number | null;
  pinLng: number | null;
  /** A picker result to resolve, or the place id of a city already resolved. */
  city: string | CitySelection;
}

export interface UpdateMomentInput {
  momentId: string;
  caption: string | null;
  pinLat: number | null;
  pinLng: number | null;
  city: string | CitySelection;
}

/** The subset of a geocoder result the create form hands back. */
export interface CitySelection {
  providerPlaceId: string;
  name: string;
  admin1: string | null;
  countryCode: string | null;
  displayName: string;
  lat: number;
  lng: number;
}
