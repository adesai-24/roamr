/** The seam between roamr and whichever geocoder is behind it. */

/** One place, already normalised out of whatever shape the provider returned. */
export interface GeocodeResult {
  /** Stable id in the provider's namespace. */
  providerPlaceId: string;
  /** Short name, e.g. */
  name: string;
  /** First-level administrative area, e.g. */
  admin1: string | null;
  /** ISO 3166-1 alpha-2, e.g. */
  countryCode: string | null;
  /** What a human reads in the picker, e.g. */
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

/** Anything the provider could not do. */
export class GeocodingError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "GeocodingError";
  }
}
