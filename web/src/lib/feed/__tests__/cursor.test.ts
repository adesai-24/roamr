import { describe, expect, it } from "vitest";
import { decodeCursor, encodeCursor } from "../cursor";
import type { FeedItem } from "../types";

const item = (createdAt: string, id: string) => ({ createdAt, id }) as FeedItem;

describe("feed cursor", () => {
  it("round-trips", () => {
    const encoded = encodeCursor(
      item("2026-09-07T12:00:00.000Z", "11111111-1111-4111-8111-111111111111"),
    );
    expect(decodeCursor(encoded)).toEqual({
      createdAt: "2026-09-07T12:00:00.000Z",
      id: "11111111-1111-4111-8111-111111111111",
    });
  });

  it("returns null for a missing or malformed cursor", () => {
    for (const bad of [null, undefined, "", "nopipe", "|only-id"]) {
      expect(decodeCursor(bad)).toBeNull();
    }
  });

  it("rejects anything that could rewrite the PostgREST filter it is spliced into", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    for (const bad of [
      `2026-01-01T00:00:00Z),user_id.not.is.null,and(id.eq.x|${id}`,
      "2026-01-01T00:00:00Z|x),id.neq.0",
      "yesterday|" + id,
    ]) {
      expect(decodeCursor(bad)).toBeNull();
    }
  });

  it("accepts the timestamp shape PostgREST returns", () => {
    expect(
      decodeCursor(`2026-09-07T12:00:00.123456+00:00|${"11111111-1111-4111-8111-111111111111"}`),
    ).not.toBeNull();
  });

  // Timestamps contain colons but no pipes; splitting on the last one keeps an
  // id intact even if the format ever gains a separator earlier in the string.
  it("splits on the last separator, not the first", () => {
    expect(decodeCursor("2026-09-07T12:00:00.000Z|11111111-1111-4111-8111-111111111111")?.id).toBe(
      "11111111-1111-4111-8111-111111111111",
    );
  });

  it("pairs the timestamp with an id so same-millisecond rows stay reachable", () => {
    const a = encodeCursor(
      item("2026-09-07T12:00:00.000Z", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"),
    );
    const b = encodeCursor(
      item("2026-09-07T12:00:00.000Z", "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"),
    );
    expect(a).not.toBe(b);
  });
});
