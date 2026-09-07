import chicago from "./__fixtures__/mapbox-chicago.json";
import mariposa from "./__fixtures__/mapbox-mariposa.json";
import newYork from "./__fixtures__/mapbox-new-york.json";
import paris from "./__fixtures__/mapbox-paris.json";
import sanFrancisco from "./__fixtures__/mapbox-san-francisco.json";
import tokyo from "./__fixtures__/mapbox-tokyo.json";
import { parseMapboxResponse } from "./mapbox";
import type { GeocodeResult, GeocodingProvider } from "./types";

/** The provider tests and local development run against. */

/** Reverse lookups beyond this fall outside any town and return null. */
const MAX_REVERSE_DISTANCE_KM = 120;

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

function first(fixture: unknown): GeocodeResult {
  const [result] = parseMapboxResponse(fixture);
  if (!result) {
    // A fixture that stops parsing is a broken test harness.
    throw new Error("Geocoding fixture produced no result; the fixture or parser is broken.");
  }
  return result;
}

interface CatalogEntry {
  result: GeocodeResult;
  /** Lower-cased prefixes a user might type. */
  aliases: string[];
}

/** Mariposa is here for a reason beyond rounding out the list. */
const CATALOG: CatalogEntry[] = [
  { result: first(chicago), aliases: ["chicago", "chi"] },
  { result: first(mariposa), aliases: ["mariposa", "yosemite"] },
  { result: first(newYork), aliases: ["new york", "nyc", "ny"] },
  { result: first(paris), aliases: ["paris"] },
  { result: first(sanFrancisco), aliases: ["san francisco", "sf"] },
  { result: first(tokyo), aliases: ["tokyo"] },
];

function normalise(value: string): string {
  return value.trim().toLowerCase();
}

function matches(entry: CatalogEntry, query: string): boolean {
  if (entry.aliases.some((alias) => alias.startsWith(query) || query.startsWith(alias)))
    return true;
  return normalise(entry.result.displayName).includes(query);
}

export const fakeGeocodingProvider: GeocodingProvider = {
  // Not "mapbox".
  name: "fake",

  async searchCities(query, opts) {
    const normalised = normalise(query);
    if (normalised.length === 0) return [];

    const found = CATALOG.filter((entry) => matches(entry, normalised)).map(
      (entry) => entry.result,
    );

    const proximity = opts?.proximity;
    const ordered = proximity
      ? [...found].sort((a, b) => distanceKm(proximity, a) - distanceKm(proximity, b))
      : // CATALOG is ordered by name, so the default order is already stable --
        // a fake whose results reshuffle makes tests flake for no reason.
        found;

    return ordered.slice(0, opts?.limit ?? ordered.length);
  },

  async reverseCity(lat, lng) {
    let nearest: { result: GeocodeResult; km: number } | null = null;
    for (const entry of CATALOG) {
      const km = distanceKm({ lat, lng }, entry.result);
      if (!nearest || km < nearest.km) nearest = { result: entry.result, km };
    }
    if (!nearest || nearest.km > MAX_REVERSE_DISTANCE_KM) return null;
    return nearest.result;
  },
};
