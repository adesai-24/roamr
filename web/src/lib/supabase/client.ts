import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";

/**
 * Supabase client for client components.
 *
 * Carries the anon key and the signed-in user's session, so every query it
 * makes is subject to row level security. That is the intended path for reads:
 * policies decide what comes back, not the calling code.
 */
export function createClient() {
  const env = clientEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
