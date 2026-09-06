import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export const MOMENT_PHOTOS_BUCKET = "moment-photos";

/** Object path a photo upload for a given user/moment lands at, inside their own folder (see storage RLS policy). */
export function momentPhotoPath(userId: string, momentId: string, filename: string) {
  const safeName = filename.replace(/[^a-zA-Z0-9_.-]/g, "_");
  return `${userId}/${momentId}-${safeName}`;
}

const SIGNED_URL_TTL_SECONDS = 60;

/**
 * Mints a short-TTL signed URL for a private moment photo. Always call this
 * only after confirming (via the RLS-scoped client) that the caller can see
 * the moment the photo belongs to -- this function itself uses the admin
 * client and does not re-check authorization (CLAUDE.md non-negotiable #5).
 */
export async function createSignedMomentPhotoUrl(path: string): Promise<string | null> {
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(MOMENT_PHOTOS_BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error) return null;
  return data.signedUrl;
}
