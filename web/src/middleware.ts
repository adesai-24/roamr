import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  APP_HOME_PATH,
  LOGIN_PATH,
  ONBOARDING_PATH,
  loginPathFor,
  requiresSession,
} from "@/lib/auth/routes";
import { clientEnv } from "@/lib/env";

/**
 * Session refresh plus the routing rules that depend on who you are.
 *
 * Middleware exists here for one non-negotiable reason: Supabase access tokens
 * are short-lived, and a server component cannot write the refreshed cookie
 * back. Without this, a signed-in person silently becomes signed-out an hour
 * later. The route gating rides along because middleware is the only place that
 * knows the pathname *and* can set cookies.
 *
 * Gating here is a redirect, not an authorisation decision -- `(app)` pages and
 * every server action check the session again, and RLS checks it a third time.
 */
export async function middleware(request: NextRequest) {
  // Middleware is bundled for the edge runtime, where only statically
  // referenced NEXT_PUBLIC_* values are inlined at build time. clientEnv() reads
  // exactly those, and the anon key is all this needs -- the service role key
  // would be both unavailable and wrong here.
  const env = clientEnv();

  // The response object is reassigned by setAll and must be the one returned:
  // returning a fresh NextResponse instead drops the refreshed cookies, and the
  // failure mode is a session that expires an hour after sign-in rather than
  // anything that shows up in a test.
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // getUser, not getSession: this call is what actually refreshes the token, and
  // it validates the JWT with the auth server instead of trusting the cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname, search } = request.nextUrl;
  const protectedRoute = requiresSession(pathname);
  const onLogin = pathname === LOGIN_PATH;

  if (!user) {
    if (protectedRoute) {
      return redirectPreservingCookies(request, response, loginPathFor(pathname, search));
    }
    return response;
  }

  // The profile lookup is the one extra round trip in this function, so it only
  // happens where the answer changes the destination. "/" and the auth callback
  // resolve themselves.
  if (!protectedRoute && !onLogin) {
    return response;
  }

  const { data } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();
  const username = (data as { username: string | null } | null)?.username ?? null;
  const onboarded = typeof username === "string" && username.length > 0;

  if (!onboarded) {
    if (pathname === ONBOARDING_PATH) return response;
    return redirectPreservingCookies(request, response, ONBOARDING_PATH);
  }

  if (onLogin || pathname === ONBOARDING_PATH) {
    return redirectPreservingCookies(request, response, APP_HOME_PATH);
  }

  return response;
}

/**
 * Redirect without losing the cookies Supabase just set. A redirect response
 * created from scratch carries none of them, so the next request arrives with
 * the stale token and bounces again -- a redirect loop that only reproduces
 * around the token expiry boundary.
 */
function redirectPreservingCookies(
  request: NextRequest,
  source: NextResponse,
  path: string,
): NextResponse {
  const redirect = NextResponse.redirect(new URL(path, request.nextUrl.origin));
  source.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  return redirect;
}

export const config = {
  // Static assets and the health probes are excluded: they need no session, and
  // a liveness probe that depends on the auth service is not a liveness probe.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|healthz|readyz|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest)$).*)",
  ],
};
