import { createBrowserClient } from "@supabase/ssr";
import { clientEnv } from "@/lib/env";

/** Supabase client for client components. */
export function createClient() {
  const env = clientEnv();
  return createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
