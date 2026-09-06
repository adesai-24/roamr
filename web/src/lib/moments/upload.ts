import { createClient } from "@/lib/supabase/client";
import { PHOTO_CONTENT_TYPE } from "./image";
import type { MomentUploadTarget } from "./types";

/**
 * Putting the bytes where the server said to.
 *
 * The browser talks to Storage directly here, which is the one place it does.
 * That is not a hole in the "everything goes through the server" story: the
 * target is a single-use signed URL the server minted for a path the server
 * chose, and the bucket grants `authenticated` nothing at all, so this upload
 * is impossible without that URL. What it buys is not having to stream a
 * multi-megabyte photo through a server action, which is capped far below the
 * size of one.
 */
export async function uploadPhoto(target: MomentUploadTarget, blob: Blob): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.storage
    .from(target.bucket)
    .uploadToSignedUrl(target.path, target.token, blob, { contentType: PHOTO_CONTENT_TYPE });

  if (error) {
    console.error("Photo upload failed", error);
    throw new Error("Could not upload that photo. Check your connection and try again.");
  }
}
