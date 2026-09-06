/**
 * Username rules, as a pure module.
 *
 * These rules are enforced in three places -- this module (message quality),
 * zod in the server action (input shape), and check constraints on
 * public.profiles (the only one an attacker cannot skip). Keeping the rules
 * themselves here, with no imports, is what makes them cheap to test
 * exhaustively and impossible to drift between the client and the action.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;

/**
 * Lowercase letters, digits and underscore. Deliberately narrower than what the
 * database would accept: no hyphens (they read as ranges in URLs and get
 * mangled by autocorrect), no dots (they look like file extensions), no
 * unicode (homoglyphs make impersonation trivial in a product whose whole
 * premise is that you know the person).
 */
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

/**
 * Names that must never belong to a person, because a URL like /settings has
 * to keep meaning what it says. Routes that do not exist yet are included on
 * purpose -- reserving a word costs nothing today and is unrecoverable once
 * somebody owns it.
 */
export const RESERVED_USERNAMES: readonly string[] = [
  // Reserved because a top-level route already uses them, or will.
  "about",
  "account",
  "accounts",
  "admin",
  "api",
  "auth",
  "challenge",
  "challenges",
  "cities",
  "city",
  "contact",
  "dashboard",
  "explore",
  "feed",
  "friend",
  "friends",
  "healthz",
  "help",
  "home",
  "invite",
  "invites",
  "legal",
  "login",
  "logout",
  "me",
  "moment",
  "moments",
  "new",
  "notifications",
  "onboarding",
  "place",
  "places",
  "privacy",
  "profile",
  "profiles",
  "readyz",
  "register",
  "search",
  "settings",
  "signin",
  "signout",
  "signup",
  "terms",
  "trip",
  "trips",
  "user",
  "users",
  // Reserved because they let someone pass themselves off as the product or
  // as everyone, which is the cheapest impersonation there is.
  "everyone",
  "moderator",
  "official",
  "roamr",
  "root",
  "staff",
  "support",
  "system",
  "team",
  // Reserved because infrastructure conventions expect them.
  "assets",
  "mail",
  "static",
  "status",
  "www",
];

const RESERVED_LOOKUP = new Set(RESERVED_USERNAMES);

export type UsernameProblem =
  "required" | "too_short" | "too_long" | "invalid_characters" | "reserved";

export const USERNAME_MESSAGES: Record<UsernameProblem, string> = {
  required: "Pick a username.",
  too_short: `Usernames need at least ${USERNAME_MIN_LENGTH} characters.`,
  too_long: `Usernames can be at most ${USERNAME_MAX_LENGTH} characters.`,
  invalid_characters: "Use lowercase letters, numbers and underscores only.",
  reserved: "That username is reserved. Try another one.",
};

export type UsernameCheck =
  | { readonly ok: true; readonly username: string }
  | { readonly ok: false; readonly problem: UsernameProblem; readonly message: string };

/**
 * Trim and lowercase, nothing else.
 *
 * Split out from validation so that typing "Mann " into the form is forgiven
 * while `validateUsername` stays strict about what is allowed to reach the
 * database. Normalising inside the validator would make it impossible to test
 * that uppercase is rejected, and the check constraint rejects it regardless.
 */
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

/** Validate an already-normalised username. Does not mutate its input. */
export function validateUsername(input: string): UsernameCheck {
  if (input.length === 0) {
    return fail("required");
  }
  if (input.length < USERNAME_MIN_LENGTH) {
    return fail("too_short");
  }
  if (input.length > USERNAME_MAX_LENGTH) {
    return fail("too_long");
  }
  if (!USERNAME_PATTERN.test(input)) {
    return fail("invalid_characters");
  }
  if (RESERVED_LOOKUP.has(input)) {
    return fail("reserved");
  }
  return { ok: true, username: input };
}

export function isValidUsername(input: string): boolean {
  return validateUsername(input).ok;
}

export function isReservedUsername(input: string): boolean {
  return RESERVED_LOOKUP.has(input);
}

function fail(problem: UsernameProblem): UsernameCheck {
  return { ok: false, problem, message: USERNAME_MESSAGES[problem] };
}
