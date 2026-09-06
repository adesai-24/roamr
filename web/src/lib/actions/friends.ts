"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/actions/auth";

async function requireUserId() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");
  return { supabase, userId: user.id };
}

/** Send a friend request by username. Fails loudly if it's the caller's own username. */
export async function sendFriendRequest(formData: FormData): Promise<ActionResult> {
  const username = String(formData.get("username") ?? "").trim();
  if (!username) return { error: "Enter a username." };

  const { supabase, userId } = await requireUserId();

  const { data: target, error: lookupError } = await supabase
    .from("profiles")
    .select("id, username")
    .ilike("username", username)
    .maybeSingle();
  if (lookupError) return { error: lookupError.message };
  if (!target) return { error: `No user named "${username}".` };
  if (target.id === userId) return { error: "You can't friend yourself." };

  // Server-action-level check #1: don't even attempt an insert that RLS
  // would reject or that would duplicate an existing pair either direction.
  const { data: existing } = await supabase
    .from("friendships")
    .select("id")
    .or(
      `and(requester_id.eq.${userId},addressee_id.eq.${target.id}),and(requester_id.eq.${target.id},addressee_id.eq.${userId})`,
    )
    .maybeSingle();
  if (existing) return { error: "A friend request already exists between you two." };

  // Check #2: RLS's insert policy (requester_id = auth.uid()) independently
  // enforces the same thing.
  const { error } = await supabase
    .from("friendships")
    .insert({ requester_id: userId, addressee_id: target.id, status: "pending" });
  if (error) return { error: error.message };

  revalidatePath("/friends");
  return {};
}

export async function acceptFriendRequest(friendshipId: string): Promise<ActionResult> {
  const { supabase } = await requireUserId();
  // RLS's update policy (addressee_id = auth.uid()) is what actually stops a
  // user from accepting someone else's request; this is just the happy path.
  const { error } = await supabase
    .from("friendships")
    .update({ status: "accepted", updated_at: new Date().toISOString() })
    .eq("id", friendshipId)
    .eq("status", "pending");
  if (error) return { error: error.message };

  revalidatePath("/friends");
  return {};
}

export interface FriendRow {
  friendshipId: string;
  profile: { id: string; username: string };
}

export interface FriendsData {
  accepted: FriendRow[];
  incoming: FriendRow[];
  outgoing: FriendRow[];
}

/** Everything the /friends page needs: accepted friends plus pending in/out requests. */
export async function listFriendships(): Promise<FriendsData> {
  const { supabase, userId } = await requireUserId();

  const { data, error } = await supabase
    .from("friendships")
    .select(
      "id, status, requester_id, addressee_id, requester:requester_id(id, username), addressee:addressee_id(id, username)",
    )
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);

  const accepted: FriendRow[] = [];
  const incoming: FriendRow[] = [];
  const outgoing: FriendRow[] = [];

  interface RawFriendship {
    id: string;
    status: string;
    requester_id: string;
    addressee_id: string;
    requester: { id: string; username: string };
    addressee: { id: string; username: string };
  }

  for (const row of (data ?? []) as unknown as RawFriendship[]) {
    const other = row.requester_id === userId ? row.addressee : row.requester;
    const entry: FriendRow = { friendshipId: row.id, profile: other };
    if (row.status === "accepted") accepted.push(entry);
    else if (row.requester_id === userId) outgoing.push(entry);
    else incoming.push(entry);
  }

  return { accepted, incoming, outgoing };
}
