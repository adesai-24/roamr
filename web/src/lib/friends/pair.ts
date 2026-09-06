/**
 * Pair ordering for `public.friendships`.
 *
 * The table stores one row per pair with a `user_a < user_b` check constraint,
 * so every query and every mutation has to sort the two ids exactly the way the
 * constraint does. Inlining `a < b` at each call site would mean the ordering
 * rule is written five times and only tested where somebody remembered to; here
 * it is written once, with no imports, so it can be tested exhaustively.
 *
 * Ordering is plain lexicographic string comparison, which is also what
 * Postgres `uuid` comparison amounts to for the canonical lowercase-hyphenated
 * text form these ids always arrive in.
 */

export interface OrderedPair {
  /** The smaller id, matching `friendships.user_a`. */
  userA: string;
  /** The larger id, matching `friendships.user_b`. */
  userB: string;
}

/**
 * Sort two user ids into the order the table stores them in.
 *
 * Throws when both ids are the same person. Self-friendship is impossible by
 * construction -- the constraint is a strict `<` -- so a caller that gets here
 * with one id twice has a bug upstream, and a loud error naming it beats a
 * Postgres 23514 that names only the constraint.
 */
export function orderPair(a: string, b: string): OrderedPair {
  if (a === b) {
    throw new Error(`Cannot order a friendship pair with one person twice: ${a}`);
  }
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

/**
 * The id of the other person in a stored pair.
 *
 * Rendering any friendship row means answering "who is this, from my side",
 * and the ternary that answers it is the same shape as the ordering bug this
 * module exists to prevent -- so it lives here and gets tested too.
 */
export function partnerId(userA: string, userB: string, selfId: string): string {
  if (selfId === userA) return userB;
  if (selfId === userB) return userA;
  throw new Error(`${selfId} is not part of the friendship between ${userA} and ${userB}`);
}
