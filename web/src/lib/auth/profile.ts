import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The shape of a `public.profiles` row as this feature reads it.
 *
 * Hand-written rather than generated: `supabase gen types` writes one file for
 * the whole schema, and several feature branches are open at once, so a
 * generated file is a guaranteed merge conflict. Declaring the columns a
 * feature actually uses also documents what it touches.
 */
export interface Profile {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarPath: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CurrentUser {
  id: string;
  email: string | null;
  profile: Profile | null;
}

/**
 * PostgREST aliases keep the snake_case database contract and the camelCase
 * TypeScript convention from having to meet in a hand-written mapper.
 */
const PROFILE_COLUMNS =
  "id, username, displayName:display_name, avatarPath:avatar_path, isPublic:is_public, createdAt:created_at, updatedAt:updated_at";

/**
 * The signed-in person and their profile, or null when there is no session.
 *
 * `cache` dedupes this within a single render pass, so a layout and the page
 * inside it can both ask without paying for it twice.
 *
 * Uses `getUser()` rather than `getSession()` deliberately: getSession trusts
 * whatever is in the cookie, and this value decides what gets rendered.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .eq("id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? null,
    profile: (data as Profile | null) ?? null,
  };
});

/** True once onboarding is done, which is the only thing "username" gates. */
export function hasClaimedUsername(profile: Profile | null): boolean {
  return typeof profile?.username === "string" && profile.username.length > 0;
}
