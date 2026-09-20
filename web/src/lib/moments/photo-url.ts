import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { MOMENT_PHOTO_BUCKET } from "./photo-path";

/** The only way a photo becomes readable. */

/** Long enough for a slow connection to finish loading a grid of photos. */
export const PHOTO_URL_TTL_SECONDS = 300;

/** Signs paths that a policy has *already* cleared: each came from a row read under RLS. */
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

/** Signed URLs for moments, keyed by moment id. Callers pass rows a policy already returned. */
export async function signMomentPhotos(
  moments: readonly { id: string; photoPath: string }[],
): Promise<Map<string, string>> {
  const signed = await signPaths(moments.map((m) => m.photoPath));
  const byMomentId = new Map<string, string>();
  for (const m of moments) {
    const url = signed.get(m.photoPath);
    if (url) byMomentId.set(m.id, url);
  }
  return byMomentId;
}

/** Signed cover photos for city collections, keyed by collection id. */
export async function signCollectionCovers(
  collections: readonly { id: string; coverPhotoPath: string | null }[],
): Promise<Map<string, string>> {
  const covered = collections.filter(
    (c): c is { id: string; coverPhotoPath: string } => c.coverPhotoPath !== null,
  );
  const signed = await signPaths(covered.map((c) => c.coverPhotoPath));
  const byCollectionId = new Map<string, string>();
  for (const c of covered) {
    const url = signed.get(c.coverPhotoPath);
    if (url) byCollectionId.set(c.id, url);
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
