"use server";

import { z } from "zod";
import { AUTH_CALLBACK_PATH, safeRedirectPath } from "@/lib/auth/routes";
import { serverEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export type LoginState =
  { status: "idle" } | { status: "sent"; email: string } | { status: "error"; message: string };

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  next: z.string().optional(),
});

/**
 * Send a magic link.
 *
 * A server action rather than a client-side `signInWithOtp` call so the PKCE
 * code verifier is written as an httpOnly cookie: the browser client would keep
 * it somewhere JavaScript can read, and that value is what turns the emailed
 * code into a session.
 *
 * Magic links double as sign-up (`shouldCreateUser` defaults to true), which is
 * the whole point of a friends-first app -- an invite link should not dead-end
 * on "no account found".
 */
export async function requestMagicLink(
  _previous: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: readString(formData, "email"),
    next: readString(formData, "next") || undefined,
  });

  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "Enter a valid email address.",
    };
  }

  const { email } = parsed.data;
  const env = serverEnv();

  // Built from configured site URL rather than the request host: this string is
  // an allow-listed redirect on the Supabase project, and it has to match what
  // is configured there exactly.
  const emailRedirectTo = new URL(AUTH_CALLBACK_PATH, env.NEXT_PUBLIC_SITE_URL);
  emailRedirectTo.searchParams.set("next", safeRedirectPath(parsed.data.next));

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: emailRedirectTo.toString() },
  });

  if (error) {
    return { status: "error", message: describeAuthError(error) };
  }

  return { status: "sent", email };
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

/**
 * Supabase auth errors are written for developers. Rate limiting is the one a
 * person actually hits, so it gets a real explanation; everything else stays
 * generic rather than reflecting provider internals back into the page.
 */
function describeAuthError(error: { status?: number; message: string }): string {
  if (error.status === 429) {
    return "Too many sign-in emails just went out. Wait a minute, then try again.";
  }
  if (error.status === 422) {
    return "That email address was rejected. Check it for typos.";
  }
  return "Could not send the sign-in link. Try again in a moment.";
}
