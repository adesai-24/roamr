/** Row level security on `public.friendships`, against a real database. */

import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  RLS_SKIP_REASON,
  createRlsFixture,
  deleteRowsFor,
  expectAllowed,
  expectDenied,
  expectRowCount,
  rlsEnabled,
  type RlsFixture,
  type TestUser,
} from "@/test/rls";
import { orderPair } from "../pair";
import type { FriendshipRow } from "../types";

const COLUMNS = "user_a, user_b, requested_by, status, created_at, responded_at";

/** Generous: every case is several round trips, and CI's first one is cold. */
const DB_TIMEOUT = 20_000;

// The reason rides along in the suite name.
const SUITE = rlsEnabled
  ? "friendships row level security"
  : `friendships row level security (skipped: ${RLS_SKIP_REASON})`;

describe.skipIf(!rlsEnabled)(SUITE, () => {
  let fixture: RlsFixture;
  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;

  beforeAll(async () => {
    fixture = await createRlsFixture(3);
    [alice, bob, carol] = fixture.users;
  }, 60_000);

  afterAll(async () => {
    await fixture?.cleanup();
  });

  afterEach(async () => {
    // The accounts are reused across cases.
    const ids = fixture.users.map((user) => user.id);
    await deleteRowsFor(fixture.admin, "friendships", "user_a", ids);
    await deleteRowsFor(fixture.admin, "friendships", "user_b", ids);
  });

  /** Send a request as `from`, asserting the policy allowed it. */
  async function request(from: TestUser, to: TestUser) {
    const pair = orderPair(from.id, to.id);
    const result = await from.db.from("friendships").insert({
      user_a: pair.userA,
      user_b: pair.userB,
      requested_by: from.id,
      status: "pending",
    });
    expectAllowed(result, `${from.username} sending a request to ${to.username}`);
    return pair;
  }

  /** Send and accept, the way the two actions do. */
  async function befriend(from: TestUser, to: TestUser) {
    const pair = await request(from, to);
    const result = await to.db
      .from("friendships")
      .update({ status: "accepted", responded_at: new Date().toISOString() })
      .eq("user_a", pair.userA)
      .eq("user_b", pair.userB)
      .select();
    expectRowCount(result, 1, `${to.username} accepting`);
    return pair;
  }

  /** Read the row as the service role, to see what actually landed. */
  async function storedRow(pair: { userA: string; userB: string }) {
    const { data, error } = await fixture.admin
      .from("friendships")
      .select(COLUMNS)
      .eq("user_a", pair.userA)
      .eq("user_b", pair.userB)
      .maybeSingle();
    if (error) throw new Error(`Could not read the row back: ${error.message}`);
    return data as FriendshipRow | null;
  }

  async function areFriends(caller: TestUser, one: TestUser, two: TestUser): Promise<boolean> {
    const { data, error } = await caller.db.rpc("are_friends", {
      user_one: one.id,
      user_two: two.id,
    });
    if (error) throw new Error(`are_friends failed: ${error.message}`);
    return data as boolean;
  }

  describe("reading", () => {
    it(
      "shows a friendship to the two people in it and to nobody else",
      async () => {
        const pair = await befriend(alice, bob);

        for (const participant of [alice, bob]) {
          const mine = await participant.db
            .from("friendships")
            .select(COLUMNS)
            .eq("user_a", pair.userA)
            .eq("user_b", pair.userB);
          expectRowCount(mine, 1, `${participant.username} reading their own friendship`);
        }

        const pointed = await carol.db
          .from("friendships")
          .select(COLUMNS)
          .eq("user_a", pair.userA)
          .eq("user_b", pair.userB);
        expectDenied(pointed, "carol reading a friendship she is not part of");
      },
      DB_TIMEOUT,
    );

    it(
      "gives a stranger nothing when they ask for the whole table",
      async () => {
        // There is no browsing the graph.
        await befriend(alice, bob);

        const everything = await carol.db.from("friendships").select(COLUMNS);

        expectRowCount(everything, 0, "carol enumerating the friend graph");
      },
      DB_TIMEOUT,
    );
  });

  describe("sending a request", () => {
    it(
      "refuses a friendship fabricated between two other people",
      async () => {
        const pair = orderPair(alice.id, bob.id);

        const result = await carol.db.from("friendships").insert({
          user_a: pair.userA,
          user_b: pair.userB,
          requested_by: carol.id,
          status: "pending",
        });

        expectDenied(result, "carol inventing a friendship between alice and bob");
        expect(await storedRow(pair)).toBeNull();
      },
      DB_TIMEOUT,
    );

    it(
      "refuses a request that claims somebody else sent it",
      async () => {
        const pair = orderPair(alice.id, bob.id);

        const result = await alice.db.from("friendships").insert({
          user_a: pair.userA,
          user_b: pair.userB,
          requested_by: bob.id,
          status: "pending",
        });

        expectDenied(result, "alice signing bob's name to her own request");
        expect(await storedRow(pair)).toBeNull();
      },
      DB_TIMEOUT,
    );

    it(
      "refuses a friendship that starts out already accepted",
      async () => {
        const pair = orderPair(alice.id, bob.id);

        const result = await alice.db.from("friendships").insert({
          user_a: pair.userA,
          user_b: pair.userB,
          requested_by: alice.id,
          status: "accepted",
          responded_at: new Date().toISOString(),
        });

        expectDenied(result, "alice befriending bob without asking him");
        expect(await storedRow(pair)).toBeNull();
      },
      DB_TIMEOUT,
    );

    it(
      "refuses an unordered pair, which is why orderPair exists",
      async () => {
        const pair = orderPair(alice.id, bob.id);

        const result = await alice.db.from("friendships").insert({
          // Deliberately the wrong way round.
          user_a: pair.userB,
          user_b: pair.userA,
          requested_by: alice.id,
          status: "pending",
        });

        expect(result.error?.code, result.error?.message).toBe("23514");
      },
      DB_TIMEOUT,
    );

    it(
      "keeps one row per pair, whichever direction the second request comes from",
      async () => {
        const pair = await request(alice, bob);

        const again = await bob.db.from("friendships").insert({
          user_a: pair.userA,
          user_b: pair.userB,
          requested_by: bob.id,
          status: "pending",
        });

        // The 23505 the send action treats as "already requested" rather than as a fault.
        expect(again.error?.code, again.error?.message).toBe("23505");
        expect(await storedRow(pair)).toMatchObject({ requested_by: alice.id });
      },
      DB_TIMEOUT,
    );
  });

  describe("accepting", () => {
    it(
      "will not let the requester accept their own request",
      async () => {
        const pair = await request(alice, bob);

        const result = await alice.db
          .from("friendships")
          .update({ status: "accepted", responded_at: new Date().toISOString() })
          .eq("user_a", pair.userA)
          .eq("user_b", pair.userB)
          .select();

        expectDenied(result, "alice accepting the request she sent");
        expect(await storedRow(pair)).toMatchObject({ status: "pending", responded_at: null });
      },
      DB_TIMEOUT,
    );

    it(
      "will not let a third party accept somebody else's request",
      async () => {
        const pair = await request(alice, bob);

        const result = await carol.db
          .from("friendships")
          .update({ status: "accepted", responded_at: new Date().toISOString() })
          .eq("user_a", pair.userA)
          .eq("user_b", pair.userB)
          .select();

        expectDenied(result, "carol accepting on bob's behalf");
        expect(await storedRow(pair)).toMatchObject({ status: "pending" });
      },
      DB_TIMEOUT,
    );

    it(
      "will not flip an accepted friendship back to pending",
      async () => {
        const pair = await befriend(alice, bob);

        for (const participant of [alice, bob]) {
          const result = await participant.db
            .from("friendships")
            .update({ status: "pending", responded_at: null })
            .eq("user_a", pair.userA)
            .eq("user_b", pair.userB)
            .select();

          expectDenied(result, `${participant.username} un-accepting the friendship`);
        }

        expect(await storedRow(pair)).toMatchObject({ status: "accepted" });
      },
      DB_TIMEOUT,
    );

    it(
      "will not let requested_by be rewritten",
      async () => {
        // "Who asked" is what decides who may accept.
        const pair = await request(alice, bob);

        const rewrite = await bob.db
          .from("friendships")
          .update({ requested_by: bob.id })
          .eq("user_a", pair.userA)
          .eq("user_b", pair.userB)
          .select();
        expectDenied(rewrite, "bob rewriting who sent the request");

        const smuggled = await bob.db
          .from("friendships")
          .update({
            status: "accepted",
            responded_at: new Date().toISOString(),
            requested_by: bob.id,
          })
          .eq("user_a", pair.userA)
          .eq("user_b", pair.userB)
          .select();
        expectDenied(smuggled, "bob rewriting the requester alongside a legitimate accept");

        expect(await storedRow(pair)).toMatchObject({
          requested_by: alice.id,
          status: "pending",
        });
      },
      DB_TIMEOUT,
    );
  });

  describe("removing", () => {
    it(
      "lets the recipient delete the row, which is how declining works",
      async () => {
        const pair = await request(alice, bob);

        const result = await bob.db
          .from("friendships")
          .delete()
          .eq("user_a", pair.userA)
          .eq("user_b", pair.userB)
          .select();

        expectRowCount(result, 1, "bob declining");
        expect(await storedRow(pair)).toBeNull();
      },
      DB_TIMEOUT,
    );

    it(
      "lets the sender delete the row, which is how cancelling works",
      async () => {
        const pair = await request(alice, bob);

        const result = await alice.db
          .from("friendships")
          .delete()
          .eq("user_a", pair.userA)
          .eq("user_b", pair.userB)
          .select();

        expectRowCount(result, 1, "alice cancelling");
        expect(await storedRow(pair)).toBeNull();
      },
      DB_TIMEOUT,
    );

    it(
      "lets either participant unfriend",
      async () => {
        for (const participant of [alice, bob]) {
          const pair = await befriend(alice, bob);

          const result = await participant.db
            .from("friendships")
            .delete()
            .eq("user_a", pair.userA)
            .eq("user_b", pair.userB)
            .select();

          expectRowCount(result, 1, `${participant.username} unfriending`);
          expect(await storedRow(pair)).toBeNull();
        }
      },
      DB_TIMEOUT,
    );

    it(
      "does not let a third party break up somebody else's friendship",
      async () => {
        const pair = await befriend(alice, bob);

        const result = await carol.db
          .from("friendships")
          .delete()
          .eq("user_a", pair.userA)
          .eq("user_b", pair.userB)
          .select();

        expectDenied(result, "carol unfriending two other people");
        expect(await storedRow(pair)).toMatchObject({ status: "accepted" });
      },
      DB_TIMEOUT,
    );
  });

  describe("are_friends", () => {
    it(
      "is false while a request is pending, true once it is accepted, false once it is gone",
      async () => {
        // This function is the single friendship check every other table's policy will call.
        const pair = await request(alice, bob);
        expect(await areFriends(alice, alice, bob)).toBe(false);

        await bob.db
          .from("friendships")
          .update({ status: "accepted", responded_at: new Date().toISOString() })
          .eq("user_a", pair.userA)
          .eq("user_b", pair.userB);

        expect(await areFriends(alice, alice, bob)).toBe(true);
        // Symmetric, because there is only one row to be symmetric about.
        expect(await areFriends(bob, bob, alice)).toBe(true);

        await alice.db
          .from("friendships")
          .delete()
          .eq("user_a", pair.userA)
          .eq("user_b", pair.userB);

        expect(await areFriends(alice, alice, bob)).toBe(false);
      },
      DB_TIMEOUT,
    );

    it(
      "is false for two people with no row at all",
      async () => {
        expect(await areFriends(alice, alice, carol)).toBe(false);
      },
      DB_TIMEOUT,
    );
  });
});
