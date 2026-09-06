/**
 * Row and view shapes for the friend graph.
 *
 * Declared by hand rather than imported from a generated Supabase types file:
 * that file is regenerated from a running local database, so several open
 * branches each regenerating it collide on every merge. The cost is having to
 * stay in step with 20260105000000_friendships.sql by hand.
 */

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

/**
 * The other person in a friendship, as the friends screen renders them.
 *
 * `avatarPath` is deliberately absent: a Storage path is not a URL, reads go
 * through a server-minted signed URL (CLAUDE.md #5), and that helper arrives
 * with the photos work. Initials are the correct thing to show until then.
 */
export interface FriendPerson {
  userId: string;
  username: string | null;
  displayName: string | null;
  /** When the request was sent. */
  createdAt: string;
  /** When it was accepted. Null while the request is still pending. */
  respondedAt: string | null;
}

export interface FriendsOverview {
  /** Accepted both ways -- there is only one row, so there is only one truth. */
  friends: FriendPerson[];
  /** Pending requests somebody else sent to you. */
  incoming: FriendPerson[];
  /** Pending requests you sent and nobody has answered yet. */
  outgoing: FriendPerson[];
}

/**
 * What every friend action returns.
 *
 * A discriminated union rather than a thrown error: an action that rejects
 * reaches the browser as an opaque "an error occurred", which cannot tell
 * somebody that the username they typed does not exist versus that they already
 * sent that request. Every outcome here is an ordinary thing a person can do,
 * so none of them is a 500.
 */
export type FriendActionResult = { ok: true; message: string } | { ok: false; error: string };
