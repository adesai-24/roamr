import { createClient } from "@/lib/supabase/client";
import { PHOTO_CONTENT_TYPE } from "./image";
import type { MomentUploadTarget } from "./types";

/** Putting the bytes where the server said to. */
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
