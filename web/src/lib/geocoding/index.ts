import { serverEnv, type ServerEnv } from "@/lib/env";
import { fakeGeocodingProvider } from "./fake";
import { mapboxGeocodingProvider } from "./mapbox";
import type { GeocodingProvider } from "./types";

export { GeocodingError } from "./types";
export type { GeocodeResult, GeocodingProvider } from "./types";
export { fakeGeocodingProvider } from "./fake";
export { mapboxGeocodingProvider } from "./mapbox";

/** `serverEnv()` throws when the environment is incomplete. */
function readServerEnv(): ServerEnv | null {
  try {
    return serverEnv();
  } catch {
    return null;
  }
}

/** The single place that decides which geocoder is live. */
export function getGeocodingProvider(): GeocodingProvider {
  const env = readServerEnv();
  if (!env || env.NODE_ENV === "test" || !env.MAPBOX_ACCESS_TOKEN) {
    return fakeGeocodingProvider;
  }
  return mapboxGeocodingProvider;
}
