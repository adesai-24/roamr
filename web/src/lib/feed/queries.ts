import "server-only";

import { signMomentPhotos } from "@/lib/moments/photo-url";
import { createClient } from "@/lib/supabase/server";
import { decodeCursor, encodeCursor } from "./cursor";
import type { FeedItem, FeedPage } from "./types";

/**
 * The feed is whatever the moments select policy lets you read, newest first.
 * No scoring, no ranking, no filtering beyond that.
 *
 * The city rides along as an embed. Authors cannot: moments.user_id references
 * auth.users rather than profiles, so they are one lookup keyed by id, run
 * alongside photo signing. Every extra sequential step is a full round trip.
 */

interface MomentRow {
  id: string;
  user_id: string;
  user_city_id: string;
  user_cities: { city: { id: string; display_name: string } | null } | null;
  photo_path: string;
  width: number;
  height: number;
  caption: string | null;
  taken_at: string;
  created_at: string;
}

export const FEED_PAGE_SIZE = 20;

const MOMENT_COLUMNS =
  "id, user_id, user_city_id, photo_path, width, height, caption, taken_at, created_at, user_cities(city:cities(id, display_name))";

export async function getFeedPage(cursor?: string | null): Promise<FeedPage> {
  const supabase = await createClient();

  let query = supabase
    .from("moments")
    .select(MOMENT_COLUMNS)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(FEED_PAGE_SIZE + 1);

  const after = decodeCursor(cursor);
  if (after) {
    query = query.or(
      `created_at.lt.${after.createdAt},and(created_at.eq.${after.createdAt},id.lt.${after.id})`,
    );
  }

  const { data, error } = await query;
  if (error) throw new Error(`Could not load the feed: ${error.message}`);

  const rows = (data ?? []) as unknown as MomentRow[];
  const hasMore = rows.length > FEED_PAGE_SIZE;
  const page = hasMore ? rows.slice(0, FEED_PAGE_SIZE) : rows;
  if (page.length === 0) return { items: [], nextCursor: null };

  const unique = <T>(values: T[]) => [...new Set(values)];

  const [{ data: authors }, photos] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, username, display_name")
      .in("id", unique(page.map((r) => r.user_id))),
    signMomentPhotos(page.map((r) => ({ id: r.id, photoPath: r.photo_path }))),
  ]);

  const authorById = new Map(
    (authors ?? []).map((a) => [
      a.id as string,
      a as { username: string | null; display_name: string | null },
    ]),
  );

  const items: FeedItem[] = page.map((row) => {
    const author = authorById.get(row.user_id);
    const city = row.user_cities?.city ?? null;
    return {
      id: row.id,
      userId: row.user_id,
      authorName: author?.display_name ?? author?.username ?? "Someone",
      authorUsername: author?.username ?? null,
      cityId: city?.id ?? null,
      cityName: city?.display_name ?? "Somewhere",
      caption: row.caption,
      takenAt: row.taken_at,
      createdAt: row.created_at,
      width: row.width,
      height: row.height,
      photoUrl: photos.get(row.id) ?? null,
    };
  });

  const last = items[items.length - 1];
  return { items, nextCursor: hasMore && last ? encodeCursor(last) : null };
}
