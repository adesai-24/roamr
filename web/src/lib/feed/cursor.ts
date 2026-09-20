import type { FeedItem } from "./types";

// Both halves are spliced into a PostgREST `.or()` filter, so anything looser than these
// shapes lets a hand-edited ?after= rewrite the filter.
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T[\d:.]+(?:Z|[+-]\d{2}:?\d{2})?$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
  if (!ISO_TIMESTAMP.test(createdAt) || !UUID.test(id)) return null;
  return { createdAt, id };
}
