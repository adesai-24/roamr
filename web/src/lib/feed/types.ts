/** What one row of the feed renders. */
export interface FeedItem {
  id: string;
  userId: string;
  authorName: string;
  authorUsername: string | null;
  cityId: string | null;
  cityName: string;
  caption: string | null;
  takenAt: string;
  createdAt: string;
  width: number;
  height: number;
  photoUrl: string | null;
}

export interface FeedPage {
  items: FeedItem[];
  /** `created_at|id` of the last row, or null at the end. */
  nextCursor: string | null;
}
