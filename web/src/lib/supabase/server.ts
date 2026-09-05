import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { serverEnv } from "@/lib/env";

/**
 * Supabase client for server components, server actions, and route handlers.
 *
 * Acts as the signed-in user, so row level security still applies -- this is
 * the default choice on the server. Reach for the admin client only when an
 * operation genuinely must bypass policies.
 */
export async function createClient() {
  const env = serverEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server components cannot set cookies. Session refresh happens in
          // middleware instead, so this is safe to swallow here.
        }
      },
    },
  });
}
