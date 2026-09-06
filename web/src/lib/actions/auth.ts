"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface ActionResult {
  error?: string;
}

/**
 * Email/password signup, then create the matching `profiles` row in the same
 * request. Local dev has `auth.email.enable_confirmations = false`
 * (supabase/config.toml), so signUp returns an active session immediately --
 * production would need a confirm-email step before this profile insert
 * could run, but that's out of scope for the demo.
 */
export async function signUp(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const username = String(formData.get("username") ?? "").trim();

  if (!email || !password || !username) {
    return { error: "Email, password, and username are all required." };
  }
  if (!/^[a-zA-Z0-9_]{3,24}$/.test(username)) {
    return { error: "Username must be 3-24 characters: letters, numbers, underscore." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) return { error: error.message };
  if (!data.user) return { error: "Sign up did not return a user. Try logging in instead." };

  // RLS's own insert policy (id = auth.uid()) is the second authorization
  // check here -- this action only decides *when* to insert, not whether it's
  // allowed to.
  const { error: profileError } = await supabase
    .from("profiles")
    .insert({ id: data.user.id, username });
  if (profileError) {
    if (profileError.code === "23505") {
      return { error: "That username is taken." };
    }
    return { error: profileError.message };
  }

  redirect("/feed");
}

export async function logIn(formData: FormData): Promise<ActionResult> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  if (!email || !password) return { error: "Email and password are required." };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) return { error: error.message };

  redirect("/feed");
}

export async function logOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** The signed-in user's own profile row, or null if not signed in. */
export async function getCurrentProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, username")
    .eq("id", user.id)
    .single();
  return profile ?? null;
}
