import { beforeEach, describe, expect, it, vi } from "vitest";
import { createClient } from "@/lib/supabase/server";
import { getFriendsOverview } from "../queries";
import type { FriendshipRow } from "../types";
import { createFakeDatabase, type FakeDatabase } from "./fake-supabase";

vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

const ME = "11111111-0000-4000-8000-000000000001";
const BOB = "22222222-0000-4000-8000-000000000002";
const CARL = "33333333-0000-4000-8000-000000000003";
/** Sorts after mine, so this pair is stored the other way round. */
const ZED = "ffffffff-0000-4000-8000-000000000004";

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

function setup(): FakeDatabase {
  const db = createFakeDatabase(ME);
  vi.mocked(createClient).mockResolvedValue(db.client as unknown as SupabaseLike);

  db.profiles.push(
    { id: ME, username: "me", display_name: "Me" },
    { id: BOB, username: "bob", display_name: "Bob" },
    { id: CARL, username: "carl", display_name: null },
    { id: ZED, username: "zed", display_name: "Zed" },
  );

  return db;
}

function row(overrides: Partial<FriendshipRow> & Pick<FriendshipRow, "user_a" | "user_b">) {
  return {
    requested_by: overrides.user_a,
    status: "pending",
    created_at: "2026-01-05T00:00:00.000Z",
    responded_at: null,
    ...overrides,
  } as FriendshipRow;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getFriendsOverview", () => {
  it("splits the one table into the three lists the screen renders", async () => {
    const db = setup();
    db.friendships.push(
      row({
        user_a: ME,
        user_b: BOB,
        requested_by: BOB,
        status: "accepted",
        responded_at: "2026-02-01T00:00:00.000Z",
      }),
      // Sent to me and still waiting: an incoming request.
      row({ user_a: ME, user_b: CARL, requested_by: CARL }),
      // Sent by me and still waiting: an outgoing one, stored the other way
      // round because my id sorts first.
      row({ user_a: ME, user_b: ZED, requested_by: ME }),
    );

    const overview = await getFriendsOverview(ME);

    expect(overview.friends.map((person) => person.username)).toEqual(["bob"]);
    expect(overview.incoming.map((person) => person.username)).toEqual(["carl"]);
    expect(overview.outgoing.map((person) => person.username)).toEqual(["zed"]);
  });

  it("reads the other person from whichever column they are in", async () => {
    const db = setup();
    // ZED sorts after me, so I am user_a here and user_b in the other row.
    db.friendships.push(
      row({ user_a: ME, user_b: ZED, requested_by: ZED, status: "accepted", responded_at: "x" }),
    );

    const first = await getFriendsOverview(ME);
    expect(first.friends[0]?.userId).toBe(ZED);

    db.friendships.length = 0;
    db.friendships.push(
      row({ user_a: BOB, user_b: ZED, requested_by: BOB, status: "accepted", responded_at: "x" }),
    );

    const second = await getFriendsOverview(ZED);
    expect(second.friends[0]?.userId).toBe(BOB);
  });

  it("sorts friends by when the friendship started, not by when it was asked for", async () => {
    const db = setup();
    db.friendships.push(
      row({
        user_a: ME,
        user_b: BOB,
        requested_by: BOB,
        status: "accepted",
        created_at: "2026-01-01T00:00:00.000Z",
        // Asked for first, answered last.
        responded_at: "2026-03-01T00:00:00.000Z",
      }),
      row({
        user_a: ME,
        user_b: CARL,
        requested_by: CARL,
        status: "accepted",
        created_at: "2026-02-01T00:00:00.000Z",
        responded_at: "2026-02-02T00:00:00.000Z",
      }),
    );

    const overview = await getFriendsOverview(ME);

    expect(overview.friends.map((person) => person.username)).toEqual(["bob", "carl"]);
  });

  it("falls back to the username when somebody has no display name", async () => {
    const db = setup();
    db.friendships.push(row({ user_a: ME, user_b: CARL, requested_by: CARL }));

    const overview = await getFriendsOverview(ME);

    expect(overview.incoming[0]).toMatchObject({ username: "carl", displayName: null });
  });

  it("survives a profile that has not been onboarded yet", async () => {
    const db = setup();
    db.profiles = db.profiles.filter((profile) => profile.id !== CARL);
    db.friendships.push(row({ user_a: ME, user_b: CARL, requested_by: CARL }));

    const overview = await getFriendsOverview(ME);

    expect(overview.incoming[0]).toMatchObject({ userId: CARL, username: null, displayName: null });
  });

  it("does not ask for profiles when there are no friendships", async () => {
    const db = setup();

    const overview = await getFriendsOverview(ME);

    expect(overview).toEqual({ friends: [], incoming: [], outgoing: [] });
    expect(db.calls.filter((call) => call.table === "profiles")).toHaveLength(0);
  });

  it("asks the database for the caller's own rows as well as trusting the policy", async () => {
    const db = setup();
    db.friendships.push(row({ user_a: ME, user_b: BOB, requested_by: BOB }));

    await getFriendsOverview(ME);

    const query = db.calls.find((call) => call.table === "friendships");
    expect(query?.filters).toContainEqual({
      op: "or",
      column: "",
      value: `user_a.eq.${ME},user_b.eq.${ME}`,
    });
  });
});
