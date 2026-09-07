import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/** The shape of a `public.profiles` row as this feature reads it. */
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

const PROFILE_COLUMNS =
  "id, username, displayName:display_name, avatarPath:avatar_path, isPublic:is_public, createdAt:created_at, updatedAt:updated_at";

/** The signed-in person and their profile, or null when there is no session. */
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
