import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { serverEnv } from "@/lib/env";

/**
 * Service-role client. Bypasses row level security entirely.
 *
 * The `server-only` import above makes importing this from a client component a
 * build error rather than a credential leak.
 *
 * Justified for exactly two things so far: writing canonical `cities` rows,
 * which are shared global data no individual user owns, and minting signed URLs
 * for photos after the caller's permission has already been checked. Anything
 * else should use the request-scoped client in ./server.ts and let policies do
 * the work -- if a query "needs" this client, that usually means a policy is
 * missing.
 */
export function createAdminClient() {
  const env = serverEnv();
  return createSupabaseClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
