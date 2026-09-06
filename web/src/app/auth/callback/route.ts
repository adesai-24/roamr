import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, safeRedirectPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

// Nothing about this route is cacheable, and prerendering it at build time
// would evaluate the Supabase config before the container has any.
export const dynamic = "force-dynamic";

/**
 * The landing point for a magic link.
 *
 * This is one of the two things CLAUDE.md keeps as a route handler rather than
 * a server action: the person arrives here by following a link in their email
 * client, which is a GET navigation, not a form post.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  // Every exit from here goes through safeRedirectPath, and the result is
  // resolved against *this* request's origin. `next` arrives inside a URL that
  // travelled through an email, so it is attacker-controllable in any scenario
  // where someone can get a link in front of the person signing in.
  const next = safeRedirectPath(searchParams.get("next"), origin);

  // Supabase reports its own failures (expired link, already-used code) as
  // query parameters on the redirect rather than as an error status.
  const providerError = searchParams.get("error");
  if (providerError) {
    const expired = searchParams.get("error_code") === "otp_expired";
    return redirectToLogin(origin, expired ? "link_expired" : "link_invalid");
  }

  const code = searchParams.get("code");
  if (!code) {
    return redirectToLogin(origin, "link_missing_code");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return redirectToLogin(origin, "exchange_failed");
  }

  // The session cookies were written through the server client's cookie
  // adapter, so they are already on the outgoing response this redirect
  // inherits from the request scope.
  return NextResponse.redirect(new URL(next, origin));
}

function redirectToLogin(origin: string, reason: string): NextResponse {
  const url = new URL(LOGIN_PATH, origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}
