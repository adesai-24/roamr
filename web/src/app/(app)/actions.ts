"use server";

import { redirect } from "next/navigation";
import { LOGIN_PATH } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";

/**
 * Sign out.
 *
 * A server action rather than a client-side `supabase.auth.signOut()` so the
 * auth cookies are cleared by the server that set them. Clearing them in the
 * browser leaves the httpOnly refresh cookie behind, and the next request walks
 * straight back into a session.
 */
export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(LOGIN_PATH);
}
