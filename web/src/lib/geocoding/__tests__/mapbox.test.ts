import { describe, expect, it } from "vitest";
import chicago from "../__fixtures__/mapbox-chicago.json";
import empty from "../__fixtures__/mapbox-empty.json";
import noContext from "../__fixtures__/mapbox-no-context.json";
import paris from "../__fixtures__/mapbox-paris.json";
import singapore from "../__fixtures__/mapbox-singapore.json";
import tokyo from "../__fixtures__/mapbox-tokyo.json";
import {
  buildDisplayName,
  buildReverseUrl,
  buildSearchUrl,
  parseMapboxFeature,
  parseMapboxResponse,
} from "../mapbox";

const TOKEN = "pk.test-token";

describe("parseMapboxResponse", () => {
  it("parses a fully populated place", () => {
    expect(parseMapboxResponse(chicago)).toEqual([
      {
        providerPlaceId: "place.9757815470331290",
        name: "Chicago",
        admin1: "Illinois",
        countryCode: "US",
        displayName: "Chicago, Illinois",
        lat: 41.8756,
        lng: -87.6244,
      },
    ]);
  });

  it("returns null admin1 for a place with no region, such as a city state", () => {
    const [result] = parseMapboxResponse(singapore);
    expect(result?.admin1).toBeNull();
    expect(result?.countryCode).toBe("SG");
    expect(result?.displayName).toBe("Singapore");
  });

  it("survives a feature with no context array at all", () => {
    const [result] = parseMapboxResponse(noContext);
    expect(result).toMatchObject({
      name: "Grytviken",
      admin1: null,
      countryCode: null,
      displayName: "Grytviken",
    });
  });

  it("treats no matches as an empty list rather than an error", () => {
    expect(parseMapboxResponse(empty)).toEqual([]);
  });

  it("returns an empty list for a body that is not a FeatureCollection", () => {
    expect(parseMapboxResponse(null)).toEqual([]);
    expect(parseMapboxResponse({ message: "Not Authorized - Invalid Token" })).toEqual([]);
    expect(parseMapboxResponse("nope")).toEqual([]);
  });

  it("skips malformed features instead of dropping the whole response", () => {
    const mixed = {
      type: "FeatureCollection",
      features: [{ id: "place.1", text: "No coordinates" }, chicago.features[0]],
    };
    expect(parseMapboxResponse(mixed)).toHaveLength(1);
  });
});

/** Mapbox speaks GeoJSON. */
describe("coordinate order", () => {
  it("reads center as [lng, lat], not [lat, lng]", () => {
    const [result] = parseMapboxResponse(chicago);
    // Chicago is north of the equator and west of Greenwich.
    expect(result?.lat).toBe(41.8756);
    expect(result?.lng).toBe(-87.6244);
    expect(result?.lat).toBeGreaterThan(0);
    expect(result?.lng).toBeLessThan(0);
  });

  it("keeps a positive-longitude place the right way round too", () => {
    // Tokyo would still be a plausible-looking point if swapped (35/139 both positive).
    const [result] = parseMapboxResponse(tokyo);
    expect(result?.lat).toBe(35.6895);
    expect(result?.lng).toBe(139.6917);
  });

  it("rejects a swap that lands outside the valid latitude range", () => {
    const swapped = {
      ...tokyo.features[0],
      center: [35.6895, 139.6917],
      geometry: { type: "Point", coordinates: [35.6895, 139.6917] },
    };
    // 139.69 is not a latitude, so the range guard catches this one.
    expect(parseMapboxFeature(swapped)).toBeNull();
  });

  /** The range guard is a backstop, not the defence. */
  it("cannot catch a swap that stays in range, which is why exact values are asserted", () => {
    const swapped = {
      ...chicago.features[0],
      center: [41.8756, -87.6244],
      geometry: { type: "Point", coordinates: [41.8756, -87.6244] },
    };
    const parsed = parseMapboxFeature(swapped);
    expect(parsed).not.toBeNull();
    expect(parsed?.lat).toBe(-87.6244);
  });

  it("sends proximity to Mapbox as lng,lat", () => {
    const url = buildSearchUrl("chicago", TOKEN, {
      proximity: { lat: 41.8756, lng: -87.6244 },
    });
    expect(url.searchParams.get("proximity")).toBe("-87.6244,41.8756");
  });

  it("puts lng before lat in a reverse lookup path", () => {
    const url = buildReverseUrl(37.74, -119.6, TOKEN);
    expect(url.pathname).toContain("-119.6,37.74");
  });
});

describe("buildSearchUrl", () => {
  it("restricts results to place level so addresses never reach the picker", () => {
    expect(buildSearchUrl("chicago", TOKEN).searchParams.get("types")).toBe("place");
  });

  it("escapes a query that would otherwise change the path", () => {
    const url = buildSearchUrl("a/b?c", TOKEN);
    expect(url.pathname.endsWith("/a%2Fb%3Fc.json")).toBe(true);
    expect(url.searchParams.get("access_token")).toBe(TOKEN);
  });

  it("clamps limit into the range Mapbox accepts", () => {
    expect(buildSearchUrl("x", TOKEN, { limit: 99 }).searchParams.get("limit")).toBe("10");
    expect(buildSearchUrl("x", TOKEN, { limit: 0 }).searchParams.get("limit")).toBe("1");
    expect(buildSearchUrl("x", TOKEN).searchParams.get("limit")).toBe("5");
  });
});

describe("buildDisplayName", () => {
  it("uses the region when it adds information", () => {
    expect(buildDisplayName("Chicago", "Illinois", "United States")).toBe("Chicago, Illinois");
  });

  it("falls back to the country when the region just repeats the name", () => {
    // Mapbox reports Tokyo's region as "Tokyo".
    expect(parseMapboxResponse(tokyo)[0]?.displayName).toBe("Tokyo, Japan");
  });

  it("keeps a non-ASCII region intact", () => {
    expect(parseMapboxResponse(paris)[0]?.displayName).toBe("Paris, Île-de-France");
  });

  it("returns the bare name when there is nothing to qualify it with", () => {
    expect(buildDisplayName("Grytviken", null, null)).toBe("Grytviken");
  });
});
