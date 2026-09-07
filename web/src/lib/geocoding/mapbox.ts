import { serverEnv } from "@/lib/env";
import { GeocodingError, type GeocodeResult, type GeocodingProvider } from "./types";

/** Mapbox Geocoding v5, restricted to place-level results. */

const GEOCODING_ENDPOINT = "https://api.mapbox.com/geocoding/v5/mapbox.places";

/** Mapbox caps `limit` at 10; anything larger is a 422. */
const MAX_LIMIT = 10;
const DEFAULT_LIMIT = 5;

/** A city picker that hangs is worse than one that says it failed. */
const REQUEST_TIMEOUT_MS = 5000;

// Parsing

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function findContext(context: unknown, prefix: string): Record<string, unknown> | null {
  if (!Array.isArray(context)) return null;
  const match = context.find(
    (entry) => isRecord(entry) && typeof entry.id === "string" && entry.id.startsWith(prefix),
  );
  return isRecord(match) ? match : null;
}

/** Two parts, not three. */
export function buildDisplayName(
  name: string,
  admin1: string | null,
  countryName: string | null,
): string {
  const qualifier = admin1 && admin1 !== name ? admin1 : countryName;
  return qualifier && qualifier !== name ? `${name}, ${qualifier}` : name;
}

/** Mapbox returns coordinates as `[longitude. */
function readCoordinates(feature: Record<string, unknown>): { lat: number; lng: number } | null {
  const geometry = isRecord(feature.geometry) ? feature.geometry.coordinates : undefined;
  const source = Array.isArray(feature.center) ? feature.center : geometry;
  if (!Array.isArray(source) || source.length < 2) return null;

  const [lng, lat] = source;
  if (typeof lng !== "number" || typeof lat !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  // Same bounds the cities CHECK constraints enforce.
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;

  return { lat, lng };
}

/** Returns null for any feature too malformed to trust, rather than throwing. */
export function parseMapboxFeature(raw: unknown): GeocodeResult | null {
  if (!isRecord(raw)) return null;

  const providerPlaceId = nonEmptyString(raw.id);
  const name = nonEmptyString(raw.text);
  if (!providerPlaceId || !name) return null;

  const coordinates = readCoordinates(raw);
  if (!coordinates) return null;

  const region = findContext(raw.context, "region.");
  const country = findContext(raw.context, "country.");

  const admin1 = region ? nonEmptyString(region.text) : null;
  const countryName = country ? nonEmptyString(country.text) : null;
  const shortCode = country ? nonEmptyString(country.short_code) : null;

  return {
    providerPlaceId,
    name,
    admin1,
    countryCode: shortCode ? shortCode.toUpperCase() : null,
    displayName: buildDisplayName(name, admin1, countryName),
    lat: coordinates.lat,
    lng: coordinates.lng,
  };
}

/** Parses a Geocoding FeatureCollection, skipping features it cannot trust. */
export function parseMapboxResponse(raw: unknown): GeocodeResult[] {
  if (!isRecord(raw) || !Array.isArray(raw.features)) return [];
  const results: GeocodeResult[] = [];
  for (const feature of raw.features) {
    const parsed = parseMapboxFeature(feature);
    if (parsed) results.push(parsed);
  }
  return results;
}

// Request building

function clampLimit(limit: number | undefined): number {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_LIMIT);
}

export function buildSearchUrl(
  query: string,
  accessToken: string,
  opts?: { limit?: number; proximity?: { lat: number; lng: number } },
): URL {
  // Mapbox puts the search term in the path.
  const url = new URL(`${GEOCODING_ENDPOINT}/${encodeURIComponent(query)}.json`);
  url.searchParams.set("access_token", accessToken);
  // Cities only.
  url.searchParams.set("types", "place");
  url.searchParams.set("limit", String(clampLimit(opts?.limit)));
  if (opts?.proximity) {
    // lng,lat again, same order trap as the response.
    url.searchParams.set("proximity", `${opts.proximity.lng},${opts.proximity.lat}`);
  }
  return url;
}

export function buildReverseUrl(lat: number, lng: number, accessToken: string): URL {
  const url = new URL(`${GEOCODING_ENDPOINT}/${lng},${lat}.json`);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("types", "place");
  url.searchParams.set("limit", "1");
  return url;
}

// Provider

function requireAccessToken(): string {
  const token = serverEnv().MAPBOX_ACCESS_TOKEN;
  if (!token) {
    throw new GeocodingError(
      "MAPBOX_ACCESS_TOKEN is not configured; city search is unavailable. See .env.example.",
    );
  }
  return token;
}

async function fetchGeocoding(url: URL): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (cause) {
    const timedOut = cause instanceof Error && cause.name === "TimeoutError";
    throw new GeocodingError(
      timedOut
        ? `Mapbox did not respond within ${REQUEST_TIMEOUT_MS}ms`
        : "Could not reach the Mapbox geocoding API",
      { cause },
    );
  }

  if (!response.ok) {
    // The URL carries the access token, so it never goes in the message.
    throw new GeocodingError(`Mapbox geocoding returned ${response.status}`);
  }

  try {
    return await response.json();
  } catch (cause) {
    throw new GeocodingError("Mapbox geocoding returned a body that was not JSON", { cause });
  }
}

export const mapboxGeocodingProvider: GeocodingProvider = {
  name: "mapbox",

  async searchCities(query, opts) {
    const trimmed = query.trim();
    // Never spend a paid request on an empty box.
    if (trimmed.length === 0) return [];
    const url = buildSearchUrl(trimmed, requireAccessToken(), opts);
    return parseMapboxResponse(await fetchGeocoding(url));
  },

  async reverseCity(lat, lng) {
    const url = buildReverseUrl(lat, lng, requireAccessToken());
    // No enclosing place is a normal answer out at sea or deep in a park.
    return parseMapboxResponse(await fetchGeocoding(url))[0] ?? null;
  },
};
