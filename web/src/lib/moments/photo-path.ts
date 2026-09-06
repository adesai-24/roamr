/**
 * Where a photo lives in the bucket.
 *
 * Every object is `<owner uuid>/<object uuid>.jpg` and nothing else. Two things
 * follow from that shape:
 *
 * - A bucket listing cannot be walked. The first segment is the owner's id, so
 *   there is no shared prefix to enumerate, and the second is a random uuid
 *   rather than the original filename -- which would otherwise leak
 *   "IMG_4021.HEIC" or, worse, whatever someone named a screenshot.
 * - The database can check it. `moments.photo_path` carries a constraint that
 *   the path starts with the owner's uuid, so a moment can never point at
 *   another person's object.
 *
 * The extension is fixed because the upload pipeline re-encodes everything to
 * JPEG, so there is no user-supplied extension to sanitise in the first place.
 */

export const MOMENT_PHOTO_BUCKET = "moment-photos";

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID = new RegExp(`^${UUID_PATTERN}$`, "i");

/**
 * Anchored, lower-case only, and with no alternative to a single "/" -- so
 * "..", a second directory level and a path that merely starts with the right
 * uuid all fail rather than needing to be stripped out.
 */
const MOMENT_PHOTO_PATH = new RegExp(`^(${UUID_PATTERN})/${UUID_PATTERN}\\.jpg$`);

/** A fresh object id. Separate from the moment's own id: the row is written after the upload. */
export function newPhotoObjectId(): string {
  return crypto.randomUUID();
}

export function buildMomentPhotoPath(userId: string, objectId: string): string {
  if (!UUID.test(userId)) {
    throw new Error("A photo path needs the owner's user id.");
  }
  if (!UUID.test(objectId)) {
    throw new Error("A photo path needs a generated object id.");
  }
  // Lower-cased so the path matches `user_id::text` in the database's check
  // constraint, which is always lower-case.
  return `${userId.toLowerCase()}/${objectId.toLowerCase()}.jpg`;
}

/**
 * The server's own check that a path a client handed back is one it could have
 * been given. The database constraint says the same thing, which is the point:
 * CLAUDE.md asks for the permission to be enforced twice, and a client that
 * invents a path gets rejected here before it reaches Postgres.
 */
export function isMomentPhotoPathOwnedBy(path: unknown, userId: string): boolean {
  if (typeof path !== "string" || !UUID.test(userId)) return false;
  const match = MOMENT_PHOTO_PATH.exec(path);
  return match !== null && match[1] === userId.toLowerCase();
}
