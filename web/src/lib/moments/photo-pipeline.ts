import { encodePhoto, type EncodedPhoto } from "./image";
import { readPhotoMetadata, type PhotoMetadata } from "./exif";

/**
 * The one place a picked file becomes something ready to upload.
 *
 * The order of the two steps is the whole point of this module existing
 * separately from either of them:
 *
 *   1. read EXIF from the file exactly as the person picked it
 *   2. re-encode it through a canvas, which drops that EXIF
 *
 * Swap those and everything still appears to work. The city still prefills,
 * the pin still offers coordinates, every other test still passes -- and every
 * stored photo now carries the GPS fix of wherever it was taken, which for the
 * average camera roll means somebody's home address, sitting in an object that
 * a signed URL hands to whoever the owner shares it with. There is no error
 * state and nothing user-visible; the only way to notice is to look inside a
 * stored file. That is why the ordering has a test of its own.
 */

export interface PreparedPhoto extends EncodedPhoto, PhotoMetadata {}

export interface PhotoPipelineDeps {
  readMetadata: (input: Blob) => Promise<PhotoMetadata>;
  encode: (input: Blob) => Promise<EncodedPhoto>;
}

const REAL_DEPS: PhotoPipelineDeps = { readMetadata: readPhotoMetadata, encode: encodePhoto };

/**
 * Injectable because jsdom has no canvas, so a test cannot run the real
 * encoder -- and because the ordering assertion needs to observe the two steps
 * rather than infer them from their output.
 */
export async function preparePhoto(
  file: Blob,
  deps: PhotoPipelineDeps = REAL_DEPS,
): Promise<PreparedPhoto> {
  // Read first, and from `file` -- the original bytes. Awaiting here rather
  // than running both together is deliberate: it leaves no version of this
  // function in which the encoded blob is the thing available to read from.
  const metadata = await deps.readMetadata(file);
  const encoded = await deps.encode(file);
  return { ...encoded, ...metadata };
}
