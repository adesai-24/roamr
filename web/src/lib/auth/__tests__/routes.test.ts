import { describe, expect, it } from "vitest";
import {
  APP_HOME_PATH,
  LOGIN_PATH,
  ONBOARDING_PATH,
  isPublicPath,
  loginPathFor,
  requiresSession,
  safeRedirectPath,
} from "@/lib/auth/routes";

const ORIGIN = "https://roamr.example";

describe("isPublicPath", () => {
  it.each(["/", "/login", "/healthz", "/readyz", "/auth/callback", "/auth/anything"])(
    "treats %j as public",
    (path) => {
      expect(isPublicPath(path)).toBe(true);
      expect(requiresSession(path)).toBe(false);
    },
  );

  it.each(["/feed", "/onboarding", "/places", "/trips", "/profile", "/settings", "/anything-new"])(
    "requires a session for %j",
    (path) => {
      expect(requiresSession(path)).toBe(true);
    },
  );

  it("protects a route nobody has written yet", () => {
    // Deny by default is the whole point.
    expect(requiresSession("/moments/2026/some-photo")).toBe(true);
  });

  it("ignores a trailing slash", () => {
    expect(isPublicPath("/login/")).toBe(true);
    expect(isPublicPath("/")).toBe(true);
  });

  it("does not treat a path that merely starts with a public name as public", () => {
    expect(requiresSession("/logins")).toBe(true);
    expect(requiresSession("/authored")).toBe(true);
  });
});

describe("loginPathFor", () => {
  it("carries the attempted path so sign-in can return there", () => {
    expect(loginPathFor("/feed")).toBe(`${LOGIN_PATH}?next=%2Ffeed`);
  });

  it("keeps the query string of the attempted path", () => {
    expect(loginPathFor("/places", "?city=chicago")).toBe(
      `${LOGIN_PATH}?next=%2Fplaces%3Fcity%3Dchicago`,
    );
  });

  it("does not add a next for public paths", () => {
    expect(loginPathFor("/")).toBe(LOGIN_PATH);
    expect(loginPathFor(LOGIN_PATH)).toBe(LOGIN_PATH);
  });
});

describe("safeRedirectPath", () => {
  it.each([null, undefined, ""])("falls back when given %j", (input) => {
    expect(safeRedirectPath(input)).toBe(APP_HOME_PATH);
  });

  it.each(["/feed", "/places", ONBOARDING_PATH, "/trips/summer?sort=new", "/profile#moments"])(
    "passes through the same-origin path %j",
    (input) => {
      expect(safeRedirectPath(input)).toBe(input);
    },
  );

  it.each([
    ["an absolute http URL", "http://evil.example/steal"],
    ["an absolute https URL", "https://evil.example/steal"],
    ["a protocol-relative URL", "//evil.example/steal"],
    ["a backslash protocol-relative URL", "/\\evil.example/steal"],
    ["a javascript URL", "javascript:alert(1)"],
    ["a data URL", "data:text/html,<script>alert(1)</script>"],
    ["a bare host", "evil.example"],
    ["a relative path with no leading slash", "feed"],
  ])("refuses %s", (_label, input) => {
    expect(safeRedirectPath(input, ORIGIN)).toBe(APP_HOME_PATH);
  });

  it.each([
    ["a newline", "/feed\nLocation: https://evil.example"],
    ["a carriage return", "/feed\r\nSet-Cookie: a=b"],
    ["a tab", "/feed\ttrailing"],
    ["a null byte", "/feed\u0000"],
  ])("refuses a path containing %s", (_label, input) => {
    expect(safeRedirectPath(input)).toBe(APP_HOME_PATH);
  });

  it("accepts an absolute URL on our own origin, reduced to its path", () => {
    expect(safeRedirectPath(`${ORIGIN}/trips?sort=new`, ORIGIN)).toBe("/trips?sort=new");
  });

  it("refuses an absolute URL on a look-alike origin", () => {
    expect(safeRedirectPath("https://roamr.example.evil.test/feed", ORIGIN)).toBe(APP_HOME_PATH);
    expect(safeRedirectPath("https://roamr.example:8443/feed", ORIGIN)).toBe(APP_HOME_PATH);
  });

  it("refuses an absolute URL when no origin was supplied to compare against", () => {
    expect(safeRedirectPath(`${ORIGIN}/feed`)).toBe(APP_HOME_PATH);
  });

  it.each([LOGIN_PATH, "/login?next=%2Ffeed", "/auth/callback", "/healthz"])(
    "refuses %j, which would only loop",
    (input) => {
      expect(safeRedirectPath(input)).toBe(APP_HOME_PATH);
    },
  );

  it("allows the root, which routes onward by itself", () => {
    expect(safeRedirectPath("/")).toBe("/");
  });

  it("honours a caller-supplied fallback", () => {
    expect(safeRedirectPath("https://evil.example", ORIGIN, ONBOARDING_PATH)).toBe(ONBOARDING_PATH);
  });
});
