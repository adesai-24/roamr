import { serverEnv, type ServerEnv } from "@/lib/env";
import { fakeGeocodingProvider } from "./fake";
import { mapboxGeocodingProvider } from "./mapbox";
import type { GeocodingProvider } from "./types";

export { GeocodingError } from "./types";
export type { GeocodeResult, GeocodingProvider } from "./types";
export { fakeGeocodingProvider } from "./fake";
export { mapboxGeocodingProvider } from "./mapbox";

/**
 * `serverEnv()` throws when the environment is incomplete, which is precisely
 * the situation during a unit test run: nothing is configured, and nothing
 * should be reaching the network anyway. Treating that as "unconfigured" keeps
 * every test from having to stand up a full environment just to import this.
 */
function readServerEnv(): ServerEnv | null {
  try {
    return serverEnv();
  } catch {
    return null;
  }
}

/**
 * The single place that decides which geocoder is live.
 *
 * Under test, or with no Mapbox token configured, this returns the
 * fixture-backed fake. That is what makes CLAUDE.md's "tests never hit the
 * network" a property of the wiring rather than a convention someone has to
 * remember -- a test would have to go out of its way to import the Mapbox
 * provider directly to make a request. It also means a contributor can run the
 * app without a Mapbox account and still add a city.
 */
export function getGeocodingProvider(): GeocodingProvider {
  const env = readServerEnv();
  if (!env || env.NODE_ENV === "test" || !env.MAPBOX_ACCESS_TOKEN) {
    return fakeGeocodingProvider;
  }
  return mapboxGeocodingProvider;
}
