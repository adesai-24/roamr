import { getGeocodingProvider } from "@/lib/geocoding";
import type { GeocodeResult } from "@/lib/geocoding/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CityRow } from "./types";

/**
 * Turning a geocoder result into a canonical city row.
 *
 * This is the only place in the app that writes `cities`; CLAUDE.md points any
 * city write here so the dedupe cannot be worked around by accident.
 */

/** `geom` is generated and never selected -- see the note on CityRow. */
const CITY_COLUMNS =
  "id, provider, provider_place_id, name, admin1, country_code, display_name, lat, lng, created_at";

/**
 * Upserts onto the unique constraint on (provider, provider_place_id), which is
 * what makes every user's "Chicago" one row. Two people adding Chicago at the
 * same instant both land on that constraint and both come back with the same
 * id, where a read-then-insert would race and fork the city in two.
 *
 * The admin client is correct here rather than a shortcut past RLS. Cities are
 * canonical reference data that no individual user owns: the table has a read
 * policy for everyone and deliberately no write policy, so the service role is
 * the only writer by design. Letting users write directly would mean one person
 * could rename or relocate a place for everybody else.
 */
export async function resolveCity(
  result: GeocodeResult,
  provider: string = getGeocodingProvider().name,
): Promise<CityRow> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("cities")
    .upsert(
      {
        provider,
        provider_place_id: result.providerPlaceId,
        name: result.name,
        admin1: result.admin1,
        country_code: result.countryCode,
        display_name: result.displayName,
        lat: result.lat,
        lng: result.lng,
      },
      { onConflict: "provider,provider_place_id" },
    )
    .select(CITY_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Could not resolve city "${result.displayName}": ${error.message}`);
  }

  return data as CityRow;
}

/**
 * Looks up a city that has already been resolved, by the geocoder's place id.
 *
 * Uses the request-scoped client on purpose: the select policy already allows
 * this, and reaching for the admin client on a read that RLS permits is how a
 * codebase stops being able to tell which queries genuinely need to bypass
 * policies.
 */
export async function findCityByProviderPlaceId(
  providerPlaceId: string,
  provider: string = getGeocodingProvider().name,
): Promise<CityRow | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("cities")
    .select(CITY_COLUMNS)
    .eq("provider", provider)
    .eq("provider_place_id", providerPlaceId)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not look up city "${providerPlaceId}": ${error.message}`);
  }

  return (data as CityRow | null) ?? null;
}
