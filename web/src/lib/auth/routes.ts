/** Where the auth flow can send someone, and which paths need a session. */

export const LOGIN_PATH = "/login";
export const ONBOARDING_PATH = "/onboarding";
export const AUTH_CALLBACK_PATH = "/auth/callback";

/** Where a fully set-up person lands after signing in. */
export const APP_HOME_PATH = "/feed";

/** Everything not listed here needs a session. */
const PUBLIC_EXACT_PATHS: ReadonlySet<string> = new Set(["/", LOGIN_PATH, "/healthz", "/readyz"]);

/** The auth callback runs *before* a session exists, so it cannot require one. */
const PUBLIC_PATH_PREFIXES: readonly string[] = ["/auth/"];

export function isPublicPath(pathname: string): boolean {
  const normalized = stripTrailingSlash(pathname);
  if (PUBLIC_EXACT_PATHS.has(normalized)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function requiresSession(pathname: string): boolean {
  return !isPublicPath(pathname);
}

/** `/login`, carrying where the person was actually trying to go. */
export function loginPathFor(pathname: string, search = ""): string {
  if (isPublicPath(pathname)) return LOGIN_PATH;
  return `${LOGIN_PATH}?next=${encodeURIComponent(`${pathname}${search}`)}`;
}

export function safeRedirectPath(
  candidate: string | null | undefined,
  origin?: string | null,
  fallback: string = APP_HOME_PATH,
): string {
  if (!candidate) return fallback;

  // Control characters can terminate the path early or smuggle a second header.
  if (hasControlCharacter(candidate)) return fallback;

  let path: string;

  if (candidate.startsWith("/")) {
    // "//evil.com" and "/\evil.com" are both read as protocol-relative URLs by browsers.
    if (candidate.startsWith("//") || candidate.startsWith("/\\")) return fallback;
    path = candidate;
  } else if (origin) {
    // An absolute URL is acceptable only when it names our own origin.
    let parsed: URL;
    try {
      parsed = new URL(candidate);
    } catch {
      return fallback;
    }
    if (parsed.origin !== origin) return fallback;
    path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } else {
    return fallback;
  }

  const pathnameOnly = splitPathname(path);
  if (isPublicPath(pathnameOnly) && pathnameOnly !== "/") return fallback;

  return path;
}

function splitPathname(path: string): string {
  const queryIndex = path.search(/[?#]/);
  return queryIndex === -1 ? path : path.slice(0, queryIndex);
}

function hasControlCharacter(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

function stripTrailingSlash(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}
