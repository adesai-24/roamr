"use server";

import { z } from "zod";
import { getGeocodingProvider } from "@/lib/geocoding";
import type { GeocodeResult } from "@/lib/geocoding/types";
import { createClient } from "@/lib/supabase/server";
import { findCityByProviderPlaceId, resolveCity } from "./resolve";
import type { CityActionResult, CityRow } from "./types";

/** How many suggestions the picker shows. */
const SEARCH_LIMIT = 6;

const searchQuerySchema = z
  .string()
  .trim()
  .min(2, "Type at least two characters.")
  // Mapbox rejects long queries anyway.
  .max(120, "That search is too long.");

/** The picker hands back the result it was given. */
const geocodeResultSchema = z.object({
  providerPlaceId: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  admin1: z.string().trim().max(200).nullable(),
  countryCode: z.string().trim().min(2).max(8).nullable(),
  displayName: z.string().trim().min(1).max(400),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const resolveInputSchema = z.union([z.string().trim().min(1).max(200), geocodeResultSchema]);

/** Geocoding is metered and billed per request. */
async function requireUserId(): Promise<CityActionResult<string>> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, error: "Sign in to search for cities." };
  }
  return { ok: true, data: user.id };
}

/** Typeahead for the city picker. */
export async function searchCitiesAction(
  query: string,
): Promise<CityActionResult<GeocodeResult[]>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const parsed = searchQuerySchema.safeParse(query);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That search is not valid." };
  }

  try {
    const results = await getGeocodingProvider().searchCities(parsed.data, { limit: SEARCH_LIMIT });
    return { ok: true, data: results };
  } catch (cause) {
    // The cause can carry the request URL.
    console.error("City search failed", cause);
    return { ok: false, error: "City search is unavailable right now. Try again in a moment." };
  }
}

/** Pins a search result to a canonical city row and returns it. */
export async function resolveCityAction(
  input: string | GeocodeResult,
): Promise<CityActionResult<CityRow>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const parsed = resolveInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "That city is not valid." };
  }

  try {
    if (typeof parsed.data === "string") {
      const existing = await findCityByProviderPlaceId(parsed.data);
      if (!existing) {
        return { ok: false, error: "That city has not been added yet. Search for it again." };
      }
      return { ok: true, data: existing };
    }

    return { ok: true, data: await resolveCity(parsed.data) };
  } catch (cause) {
    console.error("City resolution failed", cause);
    return { ok: false, error: "Could not save that city. Try again in a moment." };
  }
}
