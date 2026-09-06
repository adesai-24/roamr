"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { validateDisplayName } from "./display-name";

export type ProfileActionState =
  { status: "idle" } | { status: "saved"; message: string } | { status: "error"; message: string };

/**
 * Profile writes go through the request-scoped client, never the admin one.
 * The `update only your own profile` policy is then the thing enforcing
 * ownership, so a bug in this file cannot let someone edit another account --
 * which is the whole reason the policy exists rather than an `eq("id", …)`
 * filter being considered sufficient.
 */

const displayNameSchema = z.object({
  displayName: z.string().max(200, "That name is too long."),
});

export async function updateDisplayName(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in to edit your profile." };

  const parsed = displayNameSchema.safeParse({
    displayName: String(formData.get("displayName") ?? ""),
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: parsed.error.issues[0]?.message ?? "That name is not valid.",
    };
  }

  // The shared validator rather than an inline check, so the rules stay the
  // same wherever a display name is set -- onboarding included.
  const result = validateDisplayName(parsed.data.displayName);
  if (!result.ok) {
    return { status: "error", message: result.message ?? "That name is not valid." };
  }

  // Store the normalised value the validator returned, not the raw input.
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: result.value })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update display name", error);
    return { status: "error", message: "Could not save that. Try again in a moment." };
  }

  revalidatePath("/profile");
  return { status: "saved", message: "Saved." };
}

const visibilitySchema = z.object({ isPublic: z.boolean() });

/**
 * The opt-in public account switch from the README's privacy bullet.
 *
 * Turning this on does not retroactively expose anything: moments carry their
 * own `visibility` column and stay friends-only until individually changed.
 * This flag only governs whether the profile itself is reachable by someone
 * who is not a friend.
 */
export async function updateAccountVisibility(
  _previous: ProfileActionState,
  formData: FormData,
): Promise<ProfileActionState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "error", message: "Sign in to change your settings." };

  const parsed = visibilitySchema.safeParse({
    isPublic: formData.get("isPublic") === "on" || formData.get("isPublic") === "true",
  });
  if (!parsed.success) {
    return { status: "error", message: "That setting is not valid." };
  }

  const { error } = await supabase
    .from("profiles")
    .update({ is_public: parsed.data.isPublic })
    .eq("id", user.id);

  if (error) {
    console.error("Failed to update account visibility", error);
    return { status: "error", message: "Could not save that. Try again in a moment." };
  }

  revalidatePath("/profile");
  return {
    status: "saved",
    message: parsed.data.isPublic ? "Your profile is now public." : "Your profile is friends-only.",
  };
}
