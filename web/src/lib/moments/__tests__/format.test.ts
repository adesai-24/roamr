import { describe, expect, it } from "vitest";
import { formatCollectionSpan, formatMomentCount, formatMomentDate } from "../format";

describe("formatMomentDate", () => {
  it("renders a stored timestamp as a date", () => {
    expect(formatMomentDate("2024-07-04T18:30:15.000Z")).toMatch(/2024/);
  });

  it("returns nothing for a missing or unparseable value rather than 'Invalid Date'", () => {
    expect(formatMomentDate(null)).toBeNull();
    expect(formatMomentDate("not a date")).toBeNull();
  });
});

describe("formatCollectionSpan", () => {
  it("collapses a single day into one date instead of a range to itself", () => {
    const span = formatCollectionSpan("2024-07-04T09:00:00.000Z", "2024-07-04T21:00:00.000Z");
    expect(span).not.toContain("–");
  });

  it("says the year once when both ends share it", () => {
    const span = formatCollectionSpan("2024-03-01T00:00:00.000Z", "2024-09-01T00:00:00.000Z");
    expect(span).toContain("–");
    expect(span?.match(/2024/g)).toHaveLength(1);
  });

  it("spans years when the collection does", () => {
    const span = formatCollectionSpan("2019-03-01T00:00:00.000Z", "2024-09-01T00:00:00.000Z");
    expect(span).toContain("2019");
    expect(span).toContain("2024");
  });

  it("returns nothing for a collection with no moments in it yet", () => {
    expect(formatCollectionSpan(null, null)).toBeNull();
    expect(formatCollectionSpan("2024-01-01T00:00:00.000Z", null)).toBeNull();
  });
});

describe("formatMomentCount", () => {
  it("does not say '1 moments'", () => {
    expect(formatMomentCount(1)).toBe("1 moment");
    expect(formatMomentCount(0)).toBe("0 moments");
    expect(formatMomentCount(12)).toBe("12 moments");
  });
});
