/**
 * Row shape for `public.cities`, declared by hand rather than imported from a
 * generated Supabase types file.
 *
 * The generated file is regenerated from a running local database, so several
 * branches each regenerating it collide on every merge. Declaring the contract
 * this feature actually depends on keeps that out of the way, at the cost of
 * having to stay in step with 20260103000000_cities.sql by hand.
 *
 * `geom` is intentionally absent: it is a generated column the application
 * never reads or writes, and selecting a geography would only hand TypeScript
 * a hex string it has no use for.
 */
export interface CityRow {
  id: string;
  provider: string;
  provider_place_id: string;
  name: string;
  admin1: string | null;
  country_code: string | null;
  display_name: string;
  lat: number;
  lng: number;
  created_at: string;
}

/**
 * What every city server action returns.
 *
 * A discriminated union rather than a thrown error: an action's rejection
 * reaches the browser as an opaque "an error occurred", which is useless for
 * telling a user that their search came back empty versus that geocoding is
 * down.
 */
export type CityActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
