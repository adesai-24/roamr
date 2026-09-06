"use server";

import { z } from "zod";
import { getGeocodingProvider } from "@/lib/geocoding";
import type { GeocodeResult } from "@/lib/geocoding/types";
import { createClient } from "@/lib/supabase/server";
import { findCityByProviderPlaceId, resolveCity } from "./resolve";
import type { CityActionResult, CityRow } from "./types";

/** How many suggestions the picker shows. Small: this is a phone-sized list. */
const SEARCH_LIMIT = 6;

const searchQuerySchema = z
  .string()
  .trim()
  .min(2, "Type at least two characters.")
  // Mapbox rejects long queries anyway, and an unbounded string reaching a
  // third-party URL is not something to find out about later.
  .max(120, "That search is too long.");

/**
 * The picker hands back the result it was given, so this crosses the trust
 * boundary and gets validated like any other user input -- the ranges match the
 * CHECK constraints on `cities` so a bad payload is rejected before it reaches
 * Postgres rather than by it.
 *
 * This is the first gate, not the only one. Validation cannot tell a truthful
 * payload from a well-formed lie -- the right place id with a junk coordinate
 * passes every check here. What stops that from mattering is resolveCity()
 * writing insert-if-absent, so a payload can only ever establish a city nobody
 * has added yet and can never move one that already exists.
 */
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

/**
 * Geocoding is metered and billed per request. An action that proxies it
 * without a session is an open endpoint someone can run up a bill on, so the
 * session check comes before the provider call, not after.
 */
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

/** Typeahead for the city picker. Never writes -- resolution is a separate step. */
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
    // The cause can carry the request URL, and that URL carries the access
    // token, so it is logged server-side and never returned to the browser.
    console.error("City search failed", cause);
    return { ok: false, error: "City search is unavailable right now. Try again in a moment." };
  }
}

/**
 * Pins a search result to a canonical city row and returns it.
 *
 * Accepts either a full result from the picker or the bare place id of a city
 * somebody has already added. The bare-id form deliberately does not fall back
 * to geocoding: a place id on its own carries no coordinates to write, and
 * quietly spending a paid lookup to invent them would hide a caller that has
 * lost track of its search results.
 */
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
