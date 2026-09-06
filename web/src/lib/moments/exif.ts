import exifr from "exifr";

/**
 * Reading what a photo already knows about itself.
 *
 * This runs in the browser, on the file the person picked, *before* anything
 * re-encodes it -- see photo-pipeline.ts for why that order is not negotiable.
 * What comes out is used to prefill the city and to offer a starting point for
 * the optional pin. None of it survives into the stored file.
 */

export interface PhotoMetadata {
  /** Capture time, where the file carried a usable one. */
  takenAt: Date | null;
  /** Decimal degrees. Both are set together or neither is. */
  lat: number | null;
  lng: number | null;
}

const NO_METADATA: PhotoMetadata = { takenAt: null, lat: null, lng: null };

/**
 * Only the tags this feature reads. `pick` also narrows which EXIF blocks exifr
 * parses at all, so a 12MP photo does not get its thumbnail and colour profile
 * walked to answer two questions.
 */
const TAGS = [
  "GPSLatitude",
  "GPSLatitudeRef",
  "GPSLongitude",
  "GPSLongitudeRef",
  "DateTimeOriginal",
  "CreateDate",
  "ModifyDate",
] as const;

const HEMISPHERES: Record<string, { sign: 1 | -1; maxDegrees: 90 | 180 }> = {
  N: { sign: 1, maxDegrees: 90 },
  S: { sign: -1, maxDegrees: 90 },
  E: { sign: 1, maxDegrees: 180 },
  W: { sign: -1, maxDegrees: 180 },
};

/** A clock can be a little ahead; a photo taken next month is a broken one. */
const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000;

/**
 * EXIF stores an angle as an unsigned degrees/minutes/seconds triplet plus a
 * separate hemisphere letter. Turning that into the signed decimal degrees
 * Postgres wants is where the whole thing can go quietly wrong: drop the sign
 * and a photo from Ushuaia files itself in the Arctic, and nothing about the
 * result looks malformed enough to notice.
 *
 * exifr will compute a `latitude`/`longitude` pair of its own, but this reads
 * the raw triplet instead, because the conversion is the part with
 * consequences and it should be ours to test. It also lets a nonsensical value
 * be rejected here rather than travelling on as a pin.
 */
export function toDecimalDegrees(value: unknown, ref: unknown): number | null {
  const letter = typeof ref === "string" ? ref.trim().toUpperCase().charAt(0) : "";
  const hemisphere = HEMISPHERES[letter];
  if (!hemisphere) return null;

  const parts = (Array.isArray(value) ? value : [value]).slice(0, 3);
  if (parts.length === 0) return null;

  let magnitude = 0;
  for (const [index, part] of parts.entries()) {
    // Negative components would mean the sign is being carried in two places at
    // once, which is exactly the confusion this function exists to remove.
    if (typeof part !== "number" || !Number.isFinite(part) || part < 0) return null;
    magnitude += part / 60 ** index;
  }

  if (magnitude > hemisphere.maxDegrees) return null;
  return hemisphere.sign * magnitude;
}

function readCoordinates(tags: Record<string, unknown>): { lat: number; lng: number } | null {
  const lat = toDecimalDegrees(tags.GPSLatitude, tags.GPSLatitudeRef);
  const lng = toDecimalDegrees(tags.GPSLongitude, tags.GPSLongitudeRef);
  if (lat === null || lng === null) return null;

  // Null Island. It is a real point in the Gulf of Guinea and it is never where
  // the photo was taken -- devices that fail to get a fix write it as a
  // placeholder often enough that treating it as "no location" is right.
  if (lat === 0 && lng === 0) return null;

  return { lat, lng };
}

function readTakenAt(tags: Record<string, unknown>): Date | null {
  const candidate = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
  if (!(candidate instanceof Date) || Number.isNaN(candidate.getTime())) return null;
  if (candidate.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) return null;
  return candidate;
}

/**
 * Everything roamr wants from a photo's EXIF, or nulls.
 *
 * A file with no EXIF, a truncated segment, or a format exifr cannot read are
 * all the same answer here: there is nothing to prefill. None of them is a
 * failure worth showing somebody who is trying to post a picture, and treating
 * them as one would block screenshots and exports outright.
 *
 * The capture time comes back with no timezone, because EXIF has none. exifr
 * resolves it against the runtime's zone, which in the browser is the phone
 * that took the photo -- the best guess available and usually the right one.
 */
export async function readPhotoMetadata(input: Blob | Uint8Array): Promise<PhotoMetadata> {
  let tags: Record<string, unknown> | undefined;
  try {
    tags = await exifr.parse(input, { pick: [...TAGS] });
  } catch {
    return NO_METADATA;
  }
  if (!tags) return NO_METADATA;

  const coordinates = readCoordinates(tags);
  return {
    takenAt: readTakenAt(tags),
    lat: coordinates?.lat ?? null,
    lng: coordinates?.lng ?? null,
  };
}
