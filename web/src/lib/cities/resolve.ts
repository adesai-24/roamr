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
 * Insert-if-absent onto the unique constraint on (provider, provider_place_id).
 * First writer establishes the canonical row; every later caller reads it back
 * unchanged.
 *
 * The constraint therefore guarantees more than "one Chicago" -- it guarantees
 * one *immutable* Chicago. That second half matters because `cities` is the
 * only global table in the app: a row here is shared by everyone, so unlike a
 * per-user mistake that RLS contains, one bad write lands on the whole system.
 * `ON CONFLICT DO UPDATE` would have let any signed-in user post Chicago's real
 * place id with a junk coordinate and relocate Chicago for every account. The
 * damage would also be near-undiagnosable downstream: challenge matching falls
 * back to the city centroid when a Moment has no pin, so a corrupted centroid
 * silently mis-credits parks and states and reads as a bug in the matcher
 * rather than as poisoned reference data.
 *
 * Staying on the constraint rather than reading first is what keeps this
 * race-safe: two people adding Chicago at the same instant both resolve to one
 * row, where a read-then-insert would fork the city in two. The conflict path
 * costs a second query, which the overwhelmingly common case (a city somebody
 * already added) pays and the first-ever write does not.
 *
 * A row that is genuinely wrong gets corrected by an operator re-fetching it
 * from the provider, not by a user request -- there is deliberately no code
 * path from user input to mutating an existing city.
 *
 * The admin client is correct here rather than a shortcut past RLS. Cities are
 * canonical reference data that no individual user owns: the table has a read
 * policy for everyone and deliberately no write policy, so the service role is
 * the only writer by design.
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
      // ON CONFLICT DO NOTHING. maybeSingle, not single: a conflict returns zero
      // rows, which `single()` would report as an error.
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
