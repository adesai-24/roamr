import { getGeocodingProvider } from "@/lib/geocoding";
import type { GeocodeResult } from "@/lib/geocoding/types";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { CityRow } from "./types";

/** Turning a geocoder result into a canonical city row. */

/** `geom` is generated and never selected, see the note on CityRow. */
const CITY_COLUMNS =
  "id, provider, provider_place_id, name, admin1, country_code, display_name, lat, lng, created_at";

/** Insert-if-absent onto the unique constraint on (provider, provider_place_id). */
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
      // ON CONFLICT DO NOTHING.
      { onConflict: "provider,provider_place_id", ignoreDuplicates: true },
    )
    .select(CITY_COLUMNS)
    .maybeSingle();

  if (error) {
    throw new Error(`Could not resolve city "${result.displayName}": ${error.message}`);
  }

  if (data) return data as CityRow;

  // Conflict: the row already exists and whatever it holds is authoritative.
  const existing = await findCityByProviderPlaceId(result.providerPlaceId, provider);
  if (!existing) {
    // Only reachable if the row was deleted between the insert and this read.
    throw new Error(
      `Could not resolve city "${result.displayName}": conflicting row disappeared before it could be read.`,
    );
  }
  return existing;
}

/** Looks up a city that has already been resolved, by the geocoder's place id. */
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

/**
 * A selection posted back by the browser is only a claim about a place. Storing it as-is lets any
 * signed-in user write a wrong name or coordinates onto a shared row that every friend then reads,
 * so an id we have never seen is re-confirmed with the geocoder and the geocoder's copy is stored.
 */
export async function resolveVerifiedCity(selection: GeocodeResult): Promise<CityRow | null> {
  const existing = await findCityByProviderPlaceId(selection.providerPlaceId);
  if (existing) return existing;

  const candidates = await getGeocodingProvider().searchCities(selection.displayName, {
    limit: 10,
    proximity: { lat: selection.lat, lng: selection.lng },
  });
  const genuine = candidates.find((c) => c.providerPlaceId === selection.providerPlaceId);
  return genuine ? resolveCity(genuine) : null;
}
