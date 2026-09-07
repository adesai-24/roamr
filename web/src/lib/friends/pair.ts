/** Pair ordering for `public.friendships`. */

export interface OrderedPair {
  /** The smaller id, matching `friendships.user_a`. */
  userA: string;
  /** The larger id, matching `friendships.user_b`. */
  userB: string;
}

/** Sort two user ids into the order the table stores them in. */
export function orderPair(a: string, b: string): OrderedPair {
  if (a === b) {
    throw new Error(`Cannot order a friendship pair with one person twice: ${a}`);
  }
  return a < b ? { userA: a, userB: b } : { userA: b, userB: a };
}

/** The id of the other person in a stored pair. */
export function partnerId(userA: string, userB: string, selfId: string): string {
  if (selfId === userA) return userB;
  if (selfId === userB) return userA;
  throw new Error(`${selfId} is not part of the friendship between ${userA} and ${userB}`);
}
