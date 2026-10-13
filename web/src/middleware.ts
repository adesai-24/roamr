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

// Set once the profile has a username so later navigations skip the lookup. Onboarding is a UX
// flow, not authorization: RLS and every server action ignore usernames, so someone who forges
// this cookie only skips their own redirect. It names the user it is for so it cannot carry over.
const ONBOARDED_COOKIE = "roamr_onboarded";

/** Session refresh plus the routing rules that depend on who you are. */
export async function middleware(request: NextRequest) {
  // Middleware is bundled for the edge runtime.
  const env = clientEnv();

  // The response object is reassigned by setAll and must be the one returned.
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

  // getClaims checks the JWT signature locally and refreshes it when expired. getUser is a
  // network round trip to Auth on every request and every prefetch.
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims.sub ?? null;

  const { pathname, search } = request.nextUrl;
  const protectedRoute = requiresSession(pathname);
  const onLogin = pathname === LOGIN_PATH;

  if (!userId) {
    if (protectedRoute) {
      return redirectPreservingCookies(request, response, loginPathFor(pathname, search));
    }
    return response;
  }

  if (!protectedRoute && !onLogin) {
    return response;
  }

  let onboarded = request.cookies.get(ONBOARDED_COOKIE)?.value === userId;
  if (!onboarded) {
    const { data } = await supabase
      .from("profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    const username = (data as { username: string | null } | null)?.username ?? null;
    onboarded = typeof username === "string" && username.length > 0;
    if (onboarded) {
      response.cookies.set(ONBOARDED_COOKIE, userId, {
        httpOnly: true,
        sameSite: "lax",
        secure: request.nextUrl.protocol === "https:",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
  }

  if (!onboarded) {
    if (pathname === ONBOARDING_PATH) return response;
    return redirectPreservingCookies(request, response, ONBOARDING_PATH);
  }

  if (onLogin || pathname === ONBOARDING_PATH) {
    return redirectPreservingCookies(request, response, APP_HOME_PATH);
  }

  return response;
}

/** Redirect without losing the cookies Supabase just set. */
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
  // Static assets and the health probes are excluded.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|healthz|readyz|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|ico|txt|xml|webmanifest)$).*)",
  ],
};
