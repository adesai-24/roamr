"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { normalizeUsername, validateUsername } from "@/lib/username";
import { orderPair } from "./pair";
import type { FriendActionResult, FriendshipRow } from "./types";

/** Mutations on the friend graph. */

/** The screen these actions render on; revalidated after every successful write. */
const FRIENDS_PATH = "/friends";

/** Postgres unique violation: the pair already has a row. */
const UNIQUE_VIOLATION = "23505";

const usernameSchema = z
  .string()
  .max(200, "That is too long to be a username.")
  .transform(normalizeUsername)
  .superRefine((value, ctx) => {
    if (value.length === 0) {
      ctx.addIssue({ code: "custom", message: "Type a username to send a request." });
      return;
    }
    const result = validateUsername(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: result.message });
    }
  });

const userIdSchema = z.uuid("That is not somebody roamr knows about.");

/** Send a friend request to an exact username. */
export async function sendFriendRequest(rawUsername: string): Promise<FriendActionResult> {
  const parsed = usernameSchema.safeParse(rawUsername);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "That is not a username." };
  }
  const username = parsed.data;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to add friends." };

  const { data: target, error: lookupError } = await supabase
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();

  if (lookupError) {
    console.error("Friend username lookup failed", lookupError);
    return { ok: false, error: "Could not look that up right now. Try again in a moment." };
  }

  if (!target) return { ok: false, error: `No one here goes by @${username}.` };

  const targetId = (target as { id: string }).id;

  // Caught before orderPair.
  if (targetId === user.id) {
    return { ok: false, error: "That is your own username." };
  }

  const { userA, userB } = orderPair(user.id, targetId);

  const existing = await readFriendship(supabase, userA, userB);
  if (existing) {
    return { ok: false, error: describeExisting(existing, user.id, username) };
  }

  const { error } = await supabase.from("friendships").insert({
    user_a: userA,
    user_b: userB,
    requested_by: user.id,
    status: "pending",
  });

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      // Both people pressed the button at once.
      const raced = await readFriendship(supabase, userA, userB);
      return {
        ok: false,
        error: raced
          ? describeExisting(raced, user.id, username)
          : `There is already a request between you and @${username}.`,
      };
    }
    console.error("Friend request insert failed", error);
    return { ok: false, error: "Could not send that request. Try again in a moment." };
  }

  revalidatePath(FRIENDS_PATH);
  return { ok: true, message: `Request sent to @${username}.` };
}

/** Accept a request somebody sent you. */
export async function acceptFriendRequest(otherUserId: string): Promise<FriendActionResult> {
  const target = await requirePair(otherUserId);
  if ("error" in target) return { ok: false, error: target.error };
  const { supabase, selfId, userA, userB } = target;

  const { data, error } = await supabase
    .from("friendships")
    .update({
      status: "accepted",
      responded_at: new Date().toISOString(),
    })
    .eq("user_a", userA)
    .eq("user_b", userB)
    // Both filters restate the update policy in the statement itself.
    .eq("status", "pending")
    .neq("requested_by", selfId)
    .select("user_a");

  if (error) {
    console.error("Friend request accept failed", error);
    return { ok: false, error: "Could not accept that request. Try again in a moment." };
  }

  if ((data ?? []).length === 0) {
    // Either it was withdrawn, or it is the caller's own request.
    revalidatePath(FRIENDS_PATH);
    return { ok: false, error: "That request is not waiting any more." };
  }

  revalidatePath(FRIENDS_PATH);
  return { ok: true, message: "You are friends now." };
}

/** Remove a friendship row: declining, cancelling and unfriending, all three. */
export async function removeFriendship(otherUserId: string): Promise<FriendActionResult> {
  const target = await requirePair(otherUserId);
  if ("error" in target) return { ok: false, error: target.error };
  const { supabase, userA, userB } = target;

  const { error } = await supabase
    .from("friendships")
    .delete()
    .eq("user_a", userA)
    .eq("user_b", userB);

  if (error) {
    console.error("Friendship delete failed", error);
    return { ok: false, error: "Could not do that right now. Try again in a moment." };
  }

  // No "nothing was deleted" branch on purpose.
  revalidatePath(FRIENDS_PATH);
  return { ok: true, message: "Done." };
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

interface PairTarget {
  supabase: SupabaseLike;
  selfId: string;
  userA: string;
  userB: string;
}

/** Session check plus canonical ordering, which every row-addressed action needs. */
async function requirePair(otherUserId: string): Promise<PairTarget | { error: string }> {
  const parsed = userIdSchema.safeParse(otherUserId);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "That is not somebody roamr knows about." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Sign in to manage your friends." };

  if (parsed.data === user.id) {
    return { error: "You cannot do that to yourself." };
  }

  const { userA, userB } = orderPair(user.id, parsed.data);
  return { supabase, selfId: user.id, userA, userB };
}

async function readFriendship(
  supabase: SupabaseLike,
  userA: string,
  userB: string,
): Promise<FriendshipRow | null> {
  const { data } = await supabase
    .from("friendships")
    .select("user_a, user_b, requested_by, status, created_at, responded_at")
    .eq("user_a", userA)
    .eq("user_b", userB)
    .maybeSingle();

  return (data as FriendshipRow | null) ?? null;
}

/** Say which of the three "already exists" cases this is, rather than just failing. */
function describeExisting(row: FriendshipRow, selfId: string, username: string): string {
  if (row.status === "accepted") return `You and @${username} are already friends.`;
  if (row.requested_by === selfId) return `You already asked @${username}. Give them a moment.`;
  return `@${username} already asked you. Their request is waiting below.`;
}
