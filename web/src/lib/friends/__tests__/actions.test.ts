import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { acceptFriendRequest, removeFriendship, sendFriendRequest } from "../actions";
import type { FriendshipRow } from "../types";
import { createFakeDatabase, type FakeDatabase } from "./fake-supabase";

// Factories, so the real modules -- and `next/headers`, and the env schema --
// are never evaluated in jsdom.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const ALICE = "11111111-0000-4000-8000-000000000001";
const BOB = "22222222-0000-4000-8000-000000000002";
/** Sorts after both of the others, so the pair has to be swapped to be stored. */
const ZED = "ffffffff-0000-4000-8000-000000000003";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

function setup(currentUserId: string | null): FakeDatabase {
  const db = createFakeDatabase(currentUserId);
  vi.mocked(createClient).mockResolvedValue(db.client as unknown as SupabaseLike);

  db.profiles.push(
    { id: ALICE, username: "alice", display_name: "Alice" },
    { id: BOB, username: "bob", display_name: "Bob" },
    { id: ZED, username: "zed", display_name: "Zed" },
  );

  return db;
}

function pending(userA: string, userB: string, requestedBy: string): FriendshipRow {
  return {
    user_a: userA,
    user_b: userB,
    requested_by: requestedBy,
    status: "pending",
    created_at: "2026-01-05T00:00:00.000Z",
    responded_at: null,
  };
}

function accepted(userA: string, userB: string, requestedBy: string): FriendshipRow {
  return {
    ...pending(userA, userB, requestedBy),
    status: "accepted",
    responded_at: "2026-01-06T00:00:00.000Z",
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("sendFriendRequest", () => {
  it("stores a pending row the caller requested", async () => {
    const db = setup(ALICE);

    const result = await sendFriendRequest("bob");

    expect(result).toEqual({ ok: true, message: "Request sent to @bob." });
    expect(db.friendships).toEqual([
      expect.objectContaining({
        user_a: ALICE,
        user_b: BOB,
        requested_by: ALICE,
        status: "pending",
      }),
    ]);
  });

  it("orders the pair when the sender is the larger id", async () => {
    // Written as a check on the stored row rather than on orderPair: the whole
    // point of this action is that the constraint never sees an unordered pair,
    // and the fake raises 23514 exactly like Postgres would if it did.
    const db = setup(ZED);

    const result = await sendFriendRequest("alice");

    expect(result.ok).toBe(true);
    expect(db.friendships[0]).toMatchObject({ user_a: ALICE, user_b: ZED, requested_by: ZED });
  });

  it("does not set responded_at on a request nobody has answered", async () => {
    const db = setup(ALICE);
    await sendFriendRequest("bob");
    expect(db.friendships[0]?.responded_at ?? null).toBeNull();
  });

  it("refreshes the friends screen after a successful send", async () => {
    setup(ALICE);
    await sendFriendRequest("bob");
    expect(revalidatePath).toHaveBeenCalledWith("/friends");
  });

  it("forgives whitespace and capitals in what was typed", async () => {
    const db = setup(ALICE);

    const result = await sendFriendRequest("  BOB \n");

    expect(result).toEqual({ ok: true, message: "Request sent to @bob." });
    expect(db.friendships).toHaveLength(1);
  });

  it("asks for a username instead of complaining about an empty one", async () => {
    setup(ALICE);
    expect(await sendFriendRequest("   ")).toEqual({
      ok: false,
      error: "Type a username to send a request.",
    });
  });

  it.each(["ab", "not a username", "Bob!", "friends"])(
    "rejects %j before it reaches the database",
    async (input) => {
      const db = setup(ALICE);
      const result = await sendFriendRequest(input);
      expect(result.ok).toBe(false);
      expect(db.calls).toHaveLength(0);
    },
  );

  it("says nobody goes by that name rather than failing", async () => {
    setup(ALICE);
    expect(await sendFriendRequest("nobody_here")).toEqual({
      ok: false,
      error: "No one here goes by @nobody_here.",
    });
  });

  it("stops a request to yourself before the check constraint would", async () => {
    const db = setup(ALICE);

    const result = await sendFriendRequest("alice");

    expect(result).toEqual({ ok: false, error: "That is your own username." });
    expect(db.friendships).toHaveLength(0);
    expect(db.calls.some((call) => call.operation === "insert")).toBe(false);
  });

  it("says you are already friends", async () => {
    const db = setup(ALICE);
    db.friendships.push(accepted(ALICE, BOB, BOB));

    expect(await sendFriendRequest("bob")).toEqual({
      ok: false,
      error: "You and @bob are already friends.",
    });
  });

  it("says you already asked when the pending request is yours", async () => {
    const db = setup(ALICE);
    db.friendships.push(pending(ALICE, BOB, ALICE));

    expect(await sendFriendRequest("bob")).toEqual({
      ok: false,
      error: "You already asked @bob. Give them a moment.",
    });
  });

  it("points at the inbox when they asked first", async () => {
    const db = setup(ALICE);
    db.friendships.push(pending(ALICE, BOB, BOB));

    expect(await sendFriendRequest("bob")).toEqual({
      ok: false,
      error: "@bob already asked you — their request is waiting below.",
    });
  });

  it("treats a simultaneous request as already-requested, not as an error", async () => {
    const db = setup(ALICE);
    // The row appears in the window between the existence check and the insert,
    // which is exactly what happens when both people press the button at once.
    db.beforeInsert = () => {
      db.friendships.push(pending(ALICE, BOB, BOB));
      db.beforeInsert = undefined;
    };

    const result = await sendFriendRequest("bob");

    expect(result).toEqual({
      ok: false,
      error: "@bob already asked you — their request is waiting below.",
    });
    // The row that won the race is the one that survives, unchanged.
    expect(db.friendships).toEqual([pending(ALICE, BOB, BOB)]);
  });

  it("refuses without a session", async () => {
    setup(null);
    expect(await sendFriendRequest("bob")).toEqual({ ok: false, error: "Sign in to add friends." });
  });
});

describe("acceptFriendRequest", () => {
  it("accepts a request somebody else sent", async () => {
    const db = setup(ALICE);
    db.friendships.push(pending(ALICE, BOB, BOB));

    const result = await acceptFriendRequest(BOB);

    expect(result).toEqual({ ok: true, message: "You are friends now." });
    expect(db.friendships[0]).toMatchObject({ status: "accepted" });
    expect(db.friendships[0]?.responded_at).toEqual(expect.any(String));
    expect(revalidatePath).toHaveBeenCalledWith("/friends");
  });

  it("will not let the requester accept their own request", async () => {
    const db = setup(ALICE);
    db.friendships.push(pending(ALICE, BOB, ALICE));

    const result = await acceptFriendRequest(BOB);

    expect(result).toEqual({ ok: false, error: "That request is not waiting any more." });
    expect(db.friendships[0]).toMatchObject({ status: "pending", responded_at: null });
  });

  it("will not re-accept an accepted friendship", async () => {
    const db = setup(ALICE);
    const already = accepted(ALICE, BOB, BOB);
    db.friendships.push(already);

    const result = await acceptFriendRequest(BOB);

    expect(result.ok).toBe(false);
    expect(db.friendships[0]).toEqual(already);
  });

  it("reports a request that is no longer there", async () => {
    setup(ALICE);
    expect(await acceptFriendRequest(BOB)).toEqual({
      ok: false,
      error: "That request is not waiting any more.",
    });
  });

  it("rejects an id that is not a uuid before building a statement", async () => {
    const db = setup(ALICE);
    const result = await acceptFriendRequest("bob");
    expect(result).toEqual({ ok: false, error: "That is not somebody roamr knows about." });
    expect(db.calls).toHaveLength(0);
  });

  it("rejects accepting yourself", async () => {
    const db = setup(ALICE);
    expect(await acceptFriendRequest(ALICE)).toEqual({
      ok: false,
      error: "You cannot do that to yourself.",
    });
    expect(db.calls).toHaveLength(0);
  });
});

describe("removeFriendship", () => {
  it.each([
    ["declines a request somebody sent you", () => pending(ALICE, BOB, BOB)],
    ["cancels a request you sent", () => pending(ALICE, BOB, ALICE)],
    ["unfriends an accepted friendship", () => accepted(ALICE, BOB, ALICE)],
  ])("%s", async (_name, makeRow) => {
    const db = setup(ALICE);
    db.friendships.push(makeRow());

    const result = await removeFriendship(BOB);

    expect(result.ok).toBe(true);
    expect(db.friendships).toHaveLength(0);
    expect(revalidatePath).toHaveBeenCalledWith("/friends");
  });

  it("orders the pair, so it deletes the row that actually exists", async () => {
    const db = setup(ZED);
    db.friendships.push(accepted(ALICE, ZED, ALICE));

    await removeFriendship(ALICE);

    expect(db.friendships).toHaveLength(0);
  });

  it("succeeds when the row is already gone", async () => {
    // A double tap, or the other person unfriending first. The end state the
    // caller asked for holds either way, so reporting a failure would be a lie.
    setup(ALICE);
    expect(await removeFriendship(BOB)).toMatchObject({ ok: true });
  });

  it("leaves other people's friendships alone", async () => {
    const db = setup(ALICE);
    db.friendships.push(accepted(BOB, ZED, BOB));

    await removeFriendship(BOB);

    expect(db.friendships).toHaveLength(1);
  });
});
