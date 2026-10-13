"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import type { TripActionResult } from "./types";

/** Every write goes through the request-scoped client. */

async function requireUserId(): Promise<TripActionResult<string>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to manage trips." };
  return { ok: true, data: user.id };
}

const nameSchema = z
  .string()
  .trim()
  .min(1, "Give the trip a name.")
  .max(100, "Keep the name to 100 characters or fewer.");

/** Dates arrive from `<input type="date">` as "" when left blank. */
const optionalDate = z
  .string()
  .trim()
  .transform((value) => (value === "" ? null : value))
  .refine((value) => value === null || /^\d{4}-\d{2}-\d{2}$/.test(value), "That date is not valid.")
  .nullable();

const tripSchema = z
  .object({ name: nameSchema, startsOn: optionalDate, endsOn: optionalDate })
  .refine(
    (t) => !t.startsOn || !t.endsOn || t.startsOn <= t.endsOn,
    // Mirrors the trips_dates_ordered check constraint.
    { message: "The end date is before the start date.", path: ["endsOn"] },
  );

function readForm(formData: FormData) {
  return {
    name: String(formData.get("name") ?? ""),
    startsOn: String(formData.get("startsOn") ?? ""),
    endsOn: String(formData.get("endsOn") ?? ""),
  };
}

export async function createTrip(formData: FormData): Promise<TripActionResult<{ id: string }>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const parsed = tripSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That trip is not valid." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trips")
    .insert({
      owner_id: auth.data,
      name: parsed.data.name,
      starts_on: parsed.data.startsOn,
      ends_on: parsed.data.endsOn,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("Could not create trip", error);
    return { ok: false, error: "Could not create that trip. Try again in a moment." };
  }

  revalidatePath("/trips");
  return { ok: true, data: { id: data.id as string } };
}

export async function renameTrip(
  tripId: string,
  formData: FormData,
): Promise<TripActionResult<null>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const parsed = tripSchema.safeParse(readForm(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That trip is not valid." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("trips")
    .update({
      name: parsed.data.name,
      starts_on: parsed.data.startsOn,
      ends_on: parsed.data.endsOn,
    })
    .eq("id", tripId);

  if (error) {
    console.error("Could not update trip", error);
    return { ok: false, error: "Could not save those changes. Try again in a moment." };
  }

  revalidatePath("/trips");
  revalidatePath(`/trips/${tripId}`);
  return { ok: true, data: null };
}

/** Deleting a trip ungroups its moments; it never deletes photos. */
export async function deleteTrip(tripId: string): Promise<TripActionResult<null>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const supabase = await createClient();
  const { error } = await supabase.from("trips").delete().eq("id", tripId);

  if (error) {
    console.error("Could not delete trip", error);
    return { ok: false, error: "Could not delete that trip. Try again in a moment." };
  }

  revalidatePath("/trips");
  revalidatePath("/places");
  return { ok: true, data: null };
}

const assignmentSchema = z.object({
  momentId: z.string().uuid(),
  // Null means "take it out of whatever trip it is in".
  tripId: z.string().uuid().nullable(),
});

export async function setMomentTrip(
  momentId: string,
  tripId: string | null,
): Promise<TripActionResult<null>> {
  const auth = await requireUserId();
  if (!auth.ok) return auth;

  const parsed = assignmentSchema.safeParse({ momentId, tripId });
  if (!parsed.success) return { ok: false, error: "That assignment is not valid." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("moments")
    .update({ trip_id: parsed.data.tripId })
    .eq("id", parsed.data.momentId);

  if (error) {
    // 23514 is the moments_trip_must_be_owned trigger: the trip belongs to somebody else.
    if (error.code === "23514") {
      return { ok: false, error: "That trip could not be found." };
    }
    console.error("Could not assign moment to trip", error);
    return { ok: false, error: "Could not move that moment. Try again in a moment." };
  }

  revalidatePath("/trips");
  if (parsed.data.tripId) revalidatePath(`/trips/${parsed.data.tripId}`);
  revalidatePath(`/moments/${parsed.data.momentId}`);
  return { ok: true, data: null };
}
