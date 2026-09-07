import type { FeedItem } from "./types";

/**
 * Keyset cursors for the feed.
 *
 * created_at alone is not unique: two moments saved in the same millisecond
 * would make one of them unreachable, since a strict `<` skips both.
 */
export function encodeCursor(item: FeedItem): string {
  return `${item.createdAt}|${item.id}`;
}

export function decodeCursor(cursor: string | null | undefined): {
  createdAt: string;
  id: string;
} | null {
  if (!cursor) return null;
  const separator = cursor.lastIndexOf("|");
  if (separator <= 0) return null;
  const createdAt = cursor.slice(0, separator);
  const id = cursor.slice(separator + 1);
  if (!createdAt || !id) return null;
  return { createdAt, id };
}
