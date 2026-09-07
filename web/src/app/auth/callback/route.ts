import { NextResponse, type NextRequest } from "next/server";
import { LOGIN_PATH, safeRedirectPath } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

// Nothing about this route is cacheable.
export const dynamic = "force-dynamic";

/** The landing point for a magic link. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;

  // Every exit from here goes through safeRedirectPath.
  const next = safeRedirectPath(searchParams.get("next"), origin);

  // Supabase reports its own failures (expired link.
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

  // The session cookies were written through the server client's cookie adapter.
  return NextResponse.redirect(new URL(next, origin));
}

function redirectToLogin(origin: string, reason: string): NextResponse {
  const url = new URL(LOGIN_PATH, origin);
  url.searchParams.set("error", reason);
  return NextResponse.redirect(url);
}
