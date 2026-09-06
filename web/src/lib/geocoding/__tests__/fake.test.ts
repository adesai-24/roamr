import { describe, expect, it } from "vitest";
import { fakeGeocodingProvider } from "../fake";
import { getGeocodingProvider } from "../index";
import type { GeocodingProvider } from "../types";

/**
 * The fake is what every other test in the repo geocodes against, so its own
 * contract has to hold: same interface as Mapbox, same result shape, and the
 * same answer every run.
 */
describe("fakeGeocodingProvider", () => {
  it("satisfies the GeocodingProvider interface", () => {
    const provider: GeocodingProvider = fakeGeocodingProvider;
    expect(provider.name).toBe("fake");
    expect(typeof provider.searchCities).toBe("function");
    expect(typeof provider.reverseCity).toBe("function");
  });

  it("returns results in the same normalised shape Mapbox parsing produces", async () => {
    const [chicago] = await fakeGeocodingProvider.searchCities("chicago");
    expect(chicago).toEqual({
      providerPlaceId: "place.9757815470331290",
      name: "Chicago",
      admin1: "Illinois",
      countryCode: "US",
      displayName: "Chicago, Illinois",
      lat: 41.8756,
      lng: -87.6244,
    });
  });

  it("gives the same answer every call", async () => {
    const first = await fakeGeocodingProvider.searchCities("san");
    const second = await fakeGeocodingProvider.searchCities("san");
    expect(first).toEqual(second);
  });

  it("covers the cities the rest of the suite leans on", async () => {
    for (const query of ["chicago", "tokyo", "paris", "san francisco", "new york"]) {
      const results = await fakeGeocodingProvider.searchCities(query);
      expect(results.length).toBeGreaterThan(0);
    }
  });

  it("matches on a short prefix, the way a typeahead is actually used", async () => {
    const results = await fakeGeocodingProvider.searchCities("chi");
    expect(results.map((r) => r.name)).toContain("Chicago");
  });

  it("returns nothing for an empty or unknown query", async () => {
    expect(await fakeGeocodingProvider.searchCities("   ")).toEqual([]);
    expect(await fakeGeocodingProvider.searchCities("zzzzzzzz")).toEqual([]);
  });

  it("honours the limit", async () => {
    const results = await fakeGeocodingProvider.searchCities("a", { limit: 1 });
    expect(results).toHaveLength(1);
  });

  it("orders by proximity when a bias point is supplied", async () => {
    // "a" matches several catalog entries; biased toward Japan, Tokyo leads.
    const results = await fakeGeocodingProvider.searchCities("a", {
      proximity: { lat: 35.6895, lng: 139.6917 },
    });
    expect(results[0]?.name).toBe("Tokyo");
  });

  /**
   * A later PR matches challenge targets against exactly this lookup: standing
   * in Yosemite Valley resolves to the nearest town rather than to nothing.
   */
  it("reverse geocodes a point inside Yosemite to the nearest town", async () => {
    const result = await fakeGeocodingProvider.reverseCity(37.74, -119.6);
    expect(result).toMatchObject({
      name: "Mariposa",
      admin1: "California",
      countryCode: "US",
      displayName: "Mariposa, California",
    });
  });

  it("returns null well away from any known town", async () => {
    // Middle of the South Pacific.
    expect(await fakeGeocodingProvider.reverseCity(-40, -140)).toBeNull();
  });
});

describe("getGeocodingProvider", () => {
  it("hands back the fake under test, so no test can reach the network by accident", () => {
    expect(getGeocodingProvider()).toBe(fakeGeocodingProvider);
    expect(getGeocodingProvider().name).toBe("fake");
  });
});
