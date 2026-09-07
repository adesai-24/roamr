import { encodePhoto, type EncodedPhoto } from "./image";
import { readPhotoMetadata, type PhotoMetadata } from "./exif";

export interface PreparedPhoto extends EncodedPhoto, PhotoMetadata {}

export interface PhotoPipelineDeps {
  readMetadata: (input: Blob) => Promise<PhotoMetadata>;
  encode: (input: Blob) => Promise<EncodedPhoto>;
}

const REAL_DEPS: PhotoPipelineDeps = { readMetadata: readPhotoMetadata, encode: encodePhoto };

/** Injectable because jsdom has no canvas. */
export async function preparePhoto(
  file: Blob,
  deps: PhotoPipelineDeps = REAL_DEPS,
): Promise<PreparedPhoto> {
  // EXIF must be read from the original bytes; encoding strips it.
  const metadata = await deps.readMetadata(file);
  const encoded = await deps.encode(file);
  return { ...encoded, ...metadata };
}
