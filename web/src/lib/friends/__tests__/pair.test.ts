import { describe, expect, it } from "vitest";
import { orderPair, partnerId } from "../pair";

/** A deterministic uuid generator. */
function makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function randomUuid(rng: () => number): string {
  const hex = "0123456789abcdef";
  let out = "";
  for (const length of [8, 4, 4, 4, 12]) {
    if (out.length > 0) out += "-";
    for (let i = 0; i < length; i += 1) {
      out += hex[Math.floor(rng() * 16)];
    }
  }
  return out;
}

const ALICE = "1a2b3c4d-0000-4000-8000-000000000001";
const BOB = "9f8e7d6c-0000-4000-8000-000000000002";

describe("orderPair", () => {
  it("leaves an already-ordered pair alone", () => {
    expect(orderPair(ALICE, BOB)).toEqual({ userA: ALICE, userB: BOB });
  });

  it("swaps a reversed pair", () => {
    expect(orderPair(BOB, ALICE)).toEqual({ userA: ALICE, userB: BOB });
  });

  it("gives the same answer whichever way round it is asked", () => {
    const rng = makeRng(20260105);
    for (let i = 0; i < 500; i += 1) {
      const a = randomUuid(rng);
      const b = randomUuid(rng);
      expect(orderPair(a, b)).toEqual(orderPair(b, a));
    }
  });

  it("always returns a pair the user_a < user_b constraint would accept", () => {
    const rng = makeRng(4242);
    for (let i = 0; i < 500; i += 1) {
      const { userA, userB } = orderPair(randomUuid(rng), randomUuid(rng));
      expect(userA < userB).toBe(true);
    }
  });

  it("returns both of the ids it was given and invents neither", () => {
    const rng = makeRng(7);
    for (let i = 0; i < 200; i += 1) {
      const a = randomUuid(rng);
      const b = randomUuid(rng);
      const { userA, userB } = orderPair(a, b);
      expect([userA, userB].sort()).toEqual([a, b].sort());
    }
  });

  /** The cases that a numeric or locale-aware comparison would get wrong. */
  it.each([
    [
      "digits sort before letters",
      "9fffffff-0000-4000-8000-000000000000",
      "a0000000-0000-4000-8000-000000000000",
    ],
    [
      "a leading zero is earlier, not smaller",
      "0fffffff-0000-4000-8000-000000000000",
      "10000000-0000-4000-8000-000000000000",
    ],
    [
      "ties break on the first differing character",
      "aaaaaaa0-0000-4000-8000-000000000000",
      "aaaaaaa1-0000-4000-8000-000000000000",
    ],
    [
      "a difference in the last group still counts",
      "aaaaaaaa-0000-4000-8000-00000000000a",
      "aaaaaaaa-0000-4000-8000-00000000000b",
    ],
    [
      "hyphens compare too",
      "aaaaaaaa-0000-4000-8000-000000000000",
      "aaaaaaaa0000-4000-8000-000000000000",
    ],
  ])("%s", (_name, smaller, larger) => {
    expect(orderPair(smaller, larger)).toEqual({ userA: smaller, userB: larger });
    expect(orderPair(larger, smaller)).toEqual({ userA: smaller, userB: larger });
  });

  it("is byte-wise rather than case-insensitive", () => {
    // Uuids reach this function lowercased.
    const upper = "AAAAAAAA-0000-4000-8000-000000000000";
    const lower = "aaaaaaaa-0000-4000-8000-000000000000";
    expect(orderPair(lower, upper)).toEqual({ userA: upper, userB: lower });
  });

  it("throws rather than build a self-friendship", () => {
    expect(() => orderPair(ALICE, ALICE)).toThrow(/one person twice/);
  });

  it("names the id in the error, so the caller bug is findable", () => {
    expect(() => orderPair(ALICE, ALICE)).toThrow(ALICE);
  });
});

describe("partnerId", () => {
  it("returns the other id from either side", () => {
    expect(partnerId(ALICE, BOB, ALICE)).toBe(BOB);
    expect(partnerId(ALICE, BOB, BOB)).toBe(ALICE);
  });

  it("agrees with orderPair for random pairs", () => {
    const rng = makeRng(99);
    for (let i = 0; i < 200; i += 1) {
      const a = randomUuid(rng);
      const b = randomUuid(rng);
      const { userA, userB } = orderPair(a, b);
      expect(partnerId(userA, userB, a)).toBe(b);
      expect(partnerId(userA, userB, b)).toBe(a);
    }
  });

  it("throws when the caller is not in the pair", () => {
    const stranger = "cccccccc-0000-4000-8000-000000000003";
    expect(() => partnerId(ALICE, BOB, stranger)).toThrow(/not part of the friendship/);
  });
});
