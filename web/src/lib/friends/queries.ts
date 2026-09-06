import { createClient } from "@/lib/supabase/server";
import { partnerId } from "./pair";
import type { FriendPerson, FriendshipRow, FriendsOverview } from "./types";

/**
 * Reads for the friends screen.
 *
 * Everything here runs as the signed-in person, so RLS is doing the real work:
 * the select policy on `friendships` already limits the result to rows the
 * caller is part of. The explicit `user_a`/`user_b` filter below is the second
 * of the two checks CLAUDE.md asks for, not the first.
 */

const FRIENDSHIP_COLUMNS = "user_a, user_b, requested_by, status, created_at, responded_at";

/** PostgREST aliases keep snake_case in the database and camelCase in TypeScript. */
const PROFILE_COLUMNS = "id, username, displayName:display_name";

interface PartnerProfile {
  id: string;
  username: string | null;
  displayName: string | null;
}

/**
 * Every friendship the caller is part of, split into the three lists the screen
 * renders.
 *
 * One query for the edges and one for the people, rather than three queries for
 * three lists: `friendships` references `auth.users`, not `public.profiles`, so
 * there is no foreign key for PostgREST to embed across and the join has to
 * happen here anyway. Doing it once is cheaper and keeps the three lists
 * consistent with each other.
 */
export async function getFriendsOverview(userId: string): Promise<FriendsOverview> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("friendships")
    .select(FRIENDSHIP_COLUMNS)
    // `userId` is a uuid straight from the session, so it cannot carry PostgREST
    // filter syntax -- this is not a place a user-supplied string reaches.
    .or(`user_a.eq.${userId},user_b.eq.${userId}`)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Could not load friendships: ${error.message}`);
  }

  const rows = (data ?? []) as FriendshipRow[];
  if (rows.length === 0) {
    return { friends: [], incoming: [], outgoing: [] };
  }

  const partnerIds = rows.map((row) => partnerId(row.user_a, row.user_b, userId));
  const profiles = await readProfiles(supabase, partnerIds);

  const overview: FriendsOverview = { friends: [], incoming: [], outgoing: [] };

  for (const row of rows) {
    const otherId = partnerId(row.user_a, row.user_b, userId);
    const person = toPerson(otherId, profiles.get(otherId), row);

    if (row.status === "accepted") {
      overview.friends.push(person);
    } else if (row.requested_by === userId) {
      overview.outgoing.push(person);
    } else {
      overview.incoming.push(person);
    }
  }

  // Requests keep the created_at ordering the query asked for. Friends are
  // sorted by when the friendship actually started instead, because the row's
  // created_at is when the *request* was sent -- a request accepted a month
  // late would otherwise sort as if it were a month old.
  overview.friends.sort((a, b) => (b.respondedAt ?? "").localeCompare(a.respondedAt ?? ""));

  return overview;
}

type SupabaseLike = Awaited<ReturnType<typeof createClient>>;

async function readProfiles(
  supabase: SupabaseLike,
  ids: readonly string[],
): Promise<Map<string, PartnerProfile>> {
  const unique = [...new Set(ids)];
  const { data, error } = await supabase.from("profiles").select(PROFILE_COLUMNS).in("id", unique);

  if (error) {
    throw new Error(`Could not load the people in your friendships: ${error.message}`);
  }

  const profiles = (data ?? []) as PartnerProfile[];
  return new Map(profiles.map((profile) => [profile.id, profile]));
}

function toPerson(
  userId: string,
  profile: PartnerProfile | undefined,
  row: FriendshipRow,
): FriendPerson {
  return {
    userId,
    // A profile can legitimately be missing its username: the row exists from
    // the moment the account does, and onboarding fills it in later.
    username: profile?.username ?? null,
    displayName: profile?.displayName ?? null,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}
