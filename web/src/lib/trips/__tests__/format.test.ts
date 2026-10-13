import { describe, expect, it } from "vitest";
import { formatTripCities, formatTripDates } from "../format";

describe("formatTripDates", () => {
  it("returns null when there is nothing to show", () => {
    expect(formatTripDates(null, null)).toBeNull();
  });

  it("handles a start with no end", () => {
    expect(formatTripDates("2026-07-04", null)).toMatch(/^From /);
  });

  it("handles an end with no start", () => {
    expect(formatTripDates(null, "2026-07-08")).toMatch(/^Until /);
  });

  it("collapses a single-day trip to one date", () => {
    const result = formatTripDates("2026-07-04", "2026-07-04");
    expect(result).not.toContain("–");
    expect(result).toContain("2026");
  });

  it("states the year once for a range inside one year", () => {
    const result = formatTripDates("2026-07-04", "2026-07-08") ?? "";
    expect(result).toContain("–");
    // "Jul 4 – Jul 8, 2026", not "Jul 4, 2026 – Jul 8, 2026".
    expect(result.match(/2026/g)).toHaveLength(1);
  });

  it("states the year on both ends when the trip crosses new year", () => {
    const result = formatTripDates("2026-12-29", "2027-01-02") ?? "";
    expect(result).toContain("2026");
    expect(result).toContain("2027");
  });

  /** The bug this guards against is invisible in most timezones and wrong in half of them. */
  it("does not shift the day backwards in western timezones", () => {
    const result = formatTripDates("2026-07-04", "2026-07-04") ?? "";
    expect(result).toContain("4");
    expect(result).not.toContain("3");
  });

  it("returns null rather than Invalid Date for a malformed value", () => {
    expect(formatTripDates("not-a-date", null)).toBeNull();
    expect(formatTripDates("2026-07", null)).toBeNull();
  });
});

describe("formatTripCities", () => {
  it("returns null for a trip with no moments yet", () => {
    expect(formatTripCities([])).toBeNull();
  });

  it("names one city plainly", () => {
    expect(formatTripCities(["Chicago"])).toBe("Chicago");
  });

  it("joins two with 'and', not a comma", () => {
    expect(formatTripCities(["Chicago", "Milwaukee"])).toBe("Chicago and Milwaukee");
  });

  it("summarises the tail once there are more than it will show", () => {
    expect(formatTripCities(["Chicago", "Milwaukee", "Madison", "Duluth"])).toBe(
      "Chicago, Milwaukee and 2 more",
    );
  });

  it("uses 'and' rather than 'and 0 more' when the list exactly fits", () => {
    expect(formatTripCities(["Chicago", "Milwaukee", "Madison"], 3)).toBe(
      "Chicago, Milwaukee and Madison",
    );
  });
});
