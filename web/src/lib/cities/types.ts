/** Row shape for `public.cities`. */
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

/** What every city server action returns. */
export type CityActionResult<T> = { ok: true; data: T } | { ok: false; error: string };
