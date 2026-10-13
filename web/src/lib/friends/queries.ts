import { createClient } from "@/lib/supabase/server";
import { partnerId } from "./pair";
import type { FriendPerson, FriendshipRow, FriendsOverview } from "./types";

/** Reads for the friends screen. */

const FRIENDSHIP_COLUMNS = "user_a, user_b, requested_by, status, created_at, responded_at";

/** PostgREST aliases keep snake_case in the database and camelCase in TypeScript. */
const PROFILE_COLUMNS = "id, username, displayName:display_name";

interface PartnerProfile {
  id: string;
  username: string | null;
  displayName: string | null;
}

/** Every friendship the caller is part of, split into the three lists the screen renders. */
export async function getFriendsOverview(userId: string): Promise<FriendsOverview> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("friendships")
    .select(FRIENDSHIP_COLUMNS)
    // `userId` is a uuid straight from the session.
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

  // Requests keep the created_at ordering the query asked for.
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
    // A profile can legitimately be missing its username.
    username: profile?.username ?? null,
    displayName: profile?.displayName ?? null,
    createdAt: row.created_at,
    respondedAt: row.responded_at,
  };
}
