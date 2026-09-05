import { describe, expect, it } from "vitest";
import {
  RESERVED_USERNAMES,
  USERNAME_MAX_LENGTH,
  USERNAME_MIN_LENGTH,
  isReservedUsername,
  isValidUsername,
  normalizeUsername,
  validateUsername,
} from "@/lib/username";

describe("validateUsername", () => {
  it("accepts a plain lowercase name", () => {
    expect(validateUsername("mann")).toEqual({ ok: true, username: "mann" });
  });

  it.each(["abc", "a_b", "a1b", "grass_toucher", "___", "000", "u".repeat(USERNAME_MAX_LENGTH)])(
    "accepts %j",
    (input) => {
      expect(isValidUsername(input)).toBe(true);
    },
  );

  it("rejects the empty string as missing rather than as too short", () => {
    expect(validateUsername("")).toMatchObject({ ok: false, problem: "required" });
  });

  it.each(["a", "ab"])("rejects %j as too short", (input) => {
    expect(validateUsername(input)).toMatchObject({ ok: false, problem: "too_short" });
  });

  it("rejects one character over the maximum", () => {
    const tooLong = "u".repeat(USERNAME_MAX_LENGTH + 1);
    expect(validateUsername(tooLong)).toMatchObject({ ok: false, problem: "too_long" });
  });

  it("accepts exactly the minimum and the maximum length", () => {
    expect(isValidUsername("u".repeat(USERNAME_MIN_LENGTH))).toBe(true);
    expect(isValidUsername("u".repeat(USERNAME_MAX_LENGTH))).toBe(true);
  });

  it.each([
    ["uppercase", "Mann"],
    ["all caps", "MANN"],
    ["a single capital", "manN"],
    ["a hyphen", "mann-talati"],
    ["a dot", "mann.talati"],
    ["an inner space", "mann talati"],
    ["a leading space", " mann"],
    ["a trailing space", "mann "],
    ["a tab", "mann\ttalati"],
    ["a newline", "mann\nmann"],
    ["an at sign", "@mann"],
    ["a slash", "mann/talati"],
    ["a percent escape", "mann%20talati"],
    ["an accented letter", "café"],
    ["cyrillic that reads as latin", "роамр"],
    ["an emoji", "mann\u{1f60e}"],
    ["a zero-width joiner", "ma\u200dnn"],
    ["a right-to-left override", "mann\u202e"],
    ["a null byte", "mann\u0000"],
  ])("rejects %s (%j)", (_label, input) => {
    expect(validateUsername(input)).toMatchObject({ ok: false, problem: "invalid_characters" });
  });

  it("rejects every reserved word", () => {
    for (const reserved of RESERVED_USERNAMES) {
      expect(isValidUsername(reserved), `expected ${reserved} to be rejected`).toBe(false);
    }
  });

  it("reports reserved words of a legal length as reserved, not as malformed", () => {
    const longEnough = RESERVED_USERNAMES.filter((word) => word.length >= USERNAME_MIN_LENGTH);
    expect(longEnough.length).toBeGreaterThan(0);
    for (const reserved of longEnough) {
      expect(validateUsername(reserved)).toMatchObject({ ok: false, problem: "reserved" });
    }
  });

  it("keeps every route the app actually serves in the blocklist", () => {
    // Someone owning one of these turns a real page into their profile.
    for (const route of ["login", "auth", "feed", "onboarding", "settings", "api", "admin"]) {
      expect(isReservedUsername(route)).toBe(true);
    }
  });

  it("does not reject a name merely for containing a reserved word", () => {
    expect(isValidUsername("admin_ish")).toBe(true);
    expect(isValidUsername("not_the_admin")).toBe(true);
  });

  it("carries a non-empty message on every rejection", () => {
    for (const input of ["", "ab", "u".repeat(99), "Mann", "admin"]) {
      const result = validateUsername(input);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.message.length).toBeGreaterThan(0);
    }
  });

  it("does not normalise its input", () => {
    // Lowercasing inside the validator would make "Mann" quietly legal, and the
    // check constraint on the column would then reject it at insert time
    // instead -- which is a 500, not a form error.
    expect(validateUsername("Mann").ok).toBe(false);
  });
});

describe("normalizeUsername", () => {
  it.each([
    ["Mann", "mann"],
    ["  mann  ", "mann"],
    ["\tMANN\n", "mann"],
    ["Grass_Toucher", "grass_toucher"],
    ["", ""],
    ["   ", ""],
  ])("normalises %j to %j", (input, expected) => {
    expect(normalizeUsername(input)).toBe(expected);
  });

  it("hands a normalised value straight through validation", () => {
    expect(isValidUsername(normalizeUsername("  Mann_Talati "))).toBe(true);
  });

  it("cannot rescue a name that is malformed for a reason other than case", () => {
    expect(isValidUsername(normalizeUsername("Mann Talati"))).toBe(false);
  });

  it("normalises a reserved word into a reserved word", () => {
    expect(validateUsername(normalizeUsername("Admin"))).toMatchObject({
      ok: false,
      problem: "reserved",
    });
  });
});
