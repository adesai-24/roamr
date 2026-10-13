import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MOMENT_PHOTO_BUCKET } from "./photo-path";

/** The only way a photo becomes readable. */

/** Long enough for a slow connection to finish loading a grid of photos. */
export const PHOTO_URL_TTL_SECONDS = 300;

/** Signs paths that a policy has *already* cleared. */
async function signPaths(paths: readonly string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return signed;

  // The service role is required rather than convenient.
  const { data, error } = await createAdminClient()
    .storage.from(MOMENT_PHOTO_BUCKET)
    .createSignedUrls(unique, PHOTO_URL_TTL_SECONDS);

  if (error || !data) {
    // A missing photo is a gap in a page, not a reason to fail the render.
    console.error("Could not sign moment photos", error);
    return signed;
  }

  for (const entry of data) {
    if (entry.error || !entry.path || !entry.signedUrl) continue;
    signed.set(entry.path, entry.signedUrl);
  }
  return signed;
}

/** Signed URLs for moments, keyed by moment id. */
export async function signMomentPhotos(momentIds: readonly string[]): Promise<Map<string, string>> {
  const ids = [...new Set(momentIds)];
  if (ids.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase.from("moments").select("id, photo_path").in("id", ids);

  if (error || !data) {
    console.error("Could not read moment photo paths", error);
    return new Map();
  }

  const rows = data as { id: string; photo_path: string }[];
  const signed = await signPaths(rows.map((row) => row.photo_path));

  const byMomentId = new Map<string, string>();
  for (const row of rows) {
    const url = signed.get(row.photo_path);
    if (url) byMomentId.set(row.id, url);
  }
  return byMomentId;
}

/** Signed cover photos for city collections, keyed by collection id. */
export async function signCollectionCovers(
  collectionIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(collectionIds)];
  if (ids.length === 0) return new Map();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("user_cities")
    .select("id, cover_photo_path")
    .in("id", ids)
    .not("cover_photo_path", "is", null);

  if (error || !data) {
    console.error("Could not read collection cover paths", error);
    return new Map();
  }

  const rows = data as { id: string; cover_photo_path: string }[];
  const signed = await signPaths(rows.map((row) => row.cover_photo_path));

  const byCollectionId = new Map<string, string>();
  for (const row of rows) {
    const url = signed.get(row.cover_photo_path);
    if (url) byCollectionId.set(row.id, url);
  }
  return byCollectionId;
}

/** Removes stored objects. */
export async function deletePhotoObjects(paths: readonly string[]): Promise<void> {
  const unique = [...new Set(paths)].filter((path) => path.length > 0);
  if (unique.length === 0) return;

  const { error } = await createAdminClient()
    .storage.from(MOMENT_PHOTO_BUCKET)
    .remove([...unique]);

  if (error) {
    // Loud.
    console.error("Orphaned moment photo objects", { paths: unique, error });
  }
}
