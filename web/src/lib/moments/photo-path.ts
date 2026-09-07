/** Where a photo lives in the bucket. */

export const MOMENT_PHOTO_BUCKET = "moment-photos";

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID = new RegExp(`^${UUID_PATTERN}$`, "i");

/** Anchored. */
const MOMENT_PHOTO_PATH = new RegExp(`^(${UUID_PATTERN})/${UUID_PATTERN}\\.jpg$`);

/** A fresh object id. */
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
  // Lower-cased so the path matches the moments_photo_path_owned check.
  return `${userId.toLowerCase()}/${objectId.toLowerCase()}.jpg`;
}

/** The server's own check that a path a client handed back is one it could have been given. */
export function isMomentPhotoPathOwnedBy(path: unknown, userId: string): boolean {
  if (typeof path !== "string" || !UUID.test(userId)) return false;
  const match = MOMENT_PHOTO_PATH.exec(path);
  return match !== null && match[1] === userId.toLowerCase();
}
