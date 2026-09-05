"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { APP_HOME_PATH, LOGIN_PATH } from "@/lib/auth/routes";
import { createClient } from "@/lib/supabase/server";
import { normalizeUsername, validateUsername } from "@/lib/username";

export interface ClaimUsernameState {
  errors?: {
    username?: string;
    displayName?: string;
    form?: string;
  };
  /** Echoed back so a failed submit does not wipe what was typed. */
  values?: {
    username?: string;
    displayName?: string;
  };
}

/** Postgres unique violation. The only error here that is a normal outcome. */
const UNIQUE_VIOLATION = "23505";
/** Postgres check violation -- the database rejecting a username we let through. */
const CHECK_VIOLATION = "23514";

const DISPLAY_NAME_MAX = 60;

const claimSchema = z.object({
  username: z
    .string()
    .max(200, "That is too long to be a username.")
    .transform(normalizeUsername)
    .superRefine((value, ctx) => {
      const result = validateUsername(value);
      if (!result.ok) {
        ctx.addIssue({ code: "custom", message: result.message });
      }
    }),
  displayName: z
    .string()
    .trim()
    .max(DISPLAY_NAME_MAX, `Keep it under ${DISPLAY_NAME_MAX} characters.`),
});

/**
 * Claim a username and finish onboarding.
 *
 * There is deliberately no "is this taken?" query before the update. Any such
 * check is a time-of-check/time-of-use race -- two people can pass it a
 * millisecond apart -- so the unique index is the only answer that means
 * anything, and the code is written to treat its rejection as an ordinary
 * outcome rather than as a 500.
 */
export async function claimUsername(
  _previous: ClaimUsernameState,
  formData: FormData,
): Promise<ClaimUsernameState> {
  const rawUsername = readString(formData, "username");
  const rawDisplayName = readString(formData, "displayName");
  const values = { username: rawUsername, displayName: rawDisplayName };

  const parsed = claimSchema.safeParse({ username: rawUsername, displayName: rawDisplayName });
  if (!parsed.success) {
    const errors: ClaimUsernameState["errors"] = {};
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0] ?? "form");
      if (field === "username" && !errors.username) errors.username = issue.message;
      else if (field === "displayName" && !errors.displayName) errors.displayName = issue.message;
      else if (!errors.form) errors.form = issue.message;
    }
    return { errors, values };
  }

  const { username, displayName } = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Authorize in the action as well as in RLS: a missing check in either layer
  // must not be enough on its own.
  if (!user) redirect(LOGIN_PATH);

  const { error } = await supabase
    .from("profiles")
    .update({
      username,
      display_name: displayName.length > 0 ? displayName : null,
    })
    .eq("id", user.id);

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return { errors: { username: "That username is taken. Try another one." }, values };
    }
    if (error.code === CHECK_VIOLATION) {
      return {
        errors: { username: "That username is not allowed. Use lowercase letters, numbers and _." },
        values,
      };
    }
    return { errors: { form: "Could not save that. Try again in a moment." }, values };
  }

  redirect(APP_HOME_PATH);
}

function readString(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}
