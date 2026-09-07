import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../cursor";
import type { FeedItem } from "../types";

const item = (createdAt: string, id: string) => ({ createdAt, id }) as FeedItem;

describe("feed cursor", () => {
  it("round-trips", () => {
    const encoded = encodeCursor(item("2026-09-07T12:00:00.000Z", "abc-123"));
    expect(decodeCursor(encoded)).toEqual({
      createdAt: "2026-09-07T12:00:00.000Z",
      id: "abc-123",
    });
  });

  it("returns null for a missing or malformed cursor", () => {
    for (const bad of [null, undefined, "", "nopipe", "|only-id"]) {
      expect(decodeCursor(bad)).toBeNull();
    }
  });

  // Timestamps contain colons but no pipes; splitting on the last one keeps an
  // id intact even if the format ever gains a separator earlier in the string.
  it("splits on the last separator, not the first", () => {
    expect(decodeCursor("2026-09-07T12:00:00.000Z|abc-123")?.id).toBe("abc-123");
  });

  it("pairs the timestamp with an id so same-millisecond rows stay reachable", () => {
    const a = encodeCursor(item("2026-09-07T12:00:00.000Z", "aaa"));
    const b = encodeCursor(item("2026-09-07T12:00:00.000Z", "bbb"));
    expect(a).not.toBe(b);
  });
});
