"use server";

import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";

export interface TripRow {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
}

/** The signed-in user's own trips, for the "attach to a trip" dropdown when adding a moment. */
export async function listMyTrips(): Promise<TripRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from("trips")
    .select("id, name, start_date, end_date")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createTrip(formData: FormData): Promise<ActionResult & { id?: string }> {
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Trip name is required." };
  const startDate = String(formData.get("startDate") ?? "").trim() || null;
  const endDate = String(formData.get("endDate") ?? "").trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data, error } = await supabase
    .from("trips")
    .insert({ user_id: user.id, name, start_date: startDate, end_date: endDate })
    .select("id")
    .single();
  if (error) return { error: error.message };
  return { id: data.id };
}
