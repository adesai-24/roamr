/** Row and view shapes for the friend graph. */

export type FriendshipStatus = "pending" | "accepted";

/** One row of `public.friendships`, snake_case exactly as PostgREST returns it. */
export interface FriendshipRow {
  user_a: string;
  user_b: string;
  requested_by: string;
  status: FriendshipStatus;
  created_at: string;
  responded_at: string | null;
}

/** The other person in a friendship, as the friends screen renders them. */
export interface FriendPerson {
  userId: string;
  username: string | null;
  displayName: string | null;
  /** When the request was sent. */
  createdAt: string;
  /** When it was accepted. */
  respondedAt: string | null;
}

export interface FriendsOverview {
  /** Accepted both ways, there is only one row, so there is only one truth. */
  friends: FriendPerson[];
  /** Pending requests somebody else sent to you. */
  incoming: FriendPerson[];
  /** Pending requests you sent and nobody has answered yet. */
  outgoing: FriendPerson[];
}

/** What every friend action returns. */
export type FriendActionResult = { ok: true; message: string } | { ok: false; error: string };
