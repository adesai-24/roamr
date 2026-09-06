/**
 * The seam between roamr and whichever geocoder is behind it.
 *
 * Two things depend on this being an interface rather than direct Mapbox calls:
 * swapping providers later stays a one-file change, and tests get a
 * fixture-backed implementation instead of a network mock, which is what makes
 * "tests never hit the network" structural rather than a rule to remember.
 */

/** One place, already normalised out of whatever shape the provider returned. */
export interface GeocodeResult {
  /** Stable id in the provider's namespace. Half of the cities dedupe key. */
  providerPlaceId: string;
  /** Short name, e.g. "Chicago". */
  name: string;
  /** First-level administrative area, e.g. "Illinois". Null where none exists. */
  admin1: string | null;
  /** ISO 3166-1 alpha-2, e.g. "US". Null when the provider omits it. */
  countryCode: string | null;
  /** What a human reads in the picker, e.g. "Chicago, Illinois". */
  displayName: string;
  lat: number;
  lng: number;
}

export interface GeocodingProvider {
  /** Identifies the id namespace, stored as `cities.provider`. */
  readonly name: string;
  searchCities(
    query: string,
    opts?: { limit?: number; proximity?: { lat: number; lng: number } },
  ): Promise<GeocodeResult[]>;
  reverseCity(lat: number, lng: number): Promise<GeocodeResult | null>;
}

/** Anything the provider could not do. Callers surface this, never the raw cause. */
export class GeocodingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GeocodingError";
  }
}
