import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { MOMENT_PHOTO_BUCKET } from "./photo-path";

/**
 * The only way a photo becomes readable.
 *
 * The bucket is private and carries no storage policies at all, so there is
 * exactly one path to the bytes: a short-lived signed URL minted here. That is
 * a deliberate choice over letting Storage enforce the rule itself. The rule is
 * "the owner, their friends, or anyone if the moment is public", and Storage
 * policies can only see the object path -- expressing it there would mean
 * writing roamr's central privacy rule a second time, in a second language,
 * against a different set of facts. Two copies of that rule is one copy too
 * many; the day they disagree, the wrong one is the one that leaks.
 *
 * So authorization happens once, in the `moments` and `user_cities` policies,
 * and this module simply cannot outrun it: every function here re-reads the row
 * through the caller's own session before signing anything. Nothing in this
 * module accepts a bare object path from its caller, which means there is no
 * signature to reach for that would skip the check -- a future caller holding a
 * path it should not have has nowhere to take it.
 */

/**
 * Long enough for a slow connection to finish loading a grid of photos,
 * including the ones lazy-loading below the fold. Short enough that a URL
 * copied out of devtools and pasted somewhere is dead before it arrives.
 */
export const PHOTO_URL_TTL_SECONDS = 300;

/**
 * Signs paths that a policy has *already* cleared. Private, so that condition
 * is checked by every caller in this file rather than trusted from outside it.
 */
async function signPaths(paths: readonly string[]): Promise<Map<string, string>> {
  const signed = new Map<string, string>();
  const unique = [...new Set(paths)];
  if (unique.length === 0) return signed;

  // The service role is required rather than convenient: `authenticated` has no
  // rights on this bucket at all, which is what keeps this the only door.
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

/**
 * Signed URLs for moments, keyed by moment id.
 *
 * The re-read looks redundant -- the caller has usually just listed these rows.
 * It is what makes the helper safe on its own terms: the select runs under the
 * caller's session, so a moment they cannot see comes back as nothing to sign,
 * whatever they passed in. An id the caller invented costs one row lookup and
 * yields no URL.
 */
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

/**
 * Signed cover photos for city collections, keyed by collection id.
 *
 * Same shape as above and for the same reason: `user_cities` has its own select
 * policy, so reading the cover path back through the caller's session is the
 * authorization check.
 */
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

/**
 * Removes stored objects. Deleting a moment has to delete its bytes too, or the
 * bucket fills with objects no row points at -- invisible to every page in the
 * app and billed for indefinitely.
 *
 * Callers pass paths they have already established belong to the signed-in
 * person, which is why this one takes paths rather than ids: by the time it
 * runs, the row it came from is gone.
 */
export async function deletePhotoObjects(paths: readonly string[]): Promise<void> {
  const unique = [...new Set(paths)].filter((path) => path.length > 0);
  if (unique.length === 0) return;

  const { error } = await createAdminClient()
    .storage.from(MOMENT_PHOTO_BUCKET)
    .remove([...unique]);

  if (error) {
    // Loud, but not fatal: the row is already gone and the moment is deleted as
    // far as the person is concerned. What is left is an orphan to sweep up.
    console.error("Orphaned moment photo objects", { paths: unique, error });
  }
}
