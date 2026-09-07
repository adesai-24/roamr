import exifr from "exifr";

/** Reading what a photo already knows about itself. */

export interface PhotoMetadata {
  /** Capture time, where the file carried a usable one. */
  takenAt: Date | null;
  /** Decimal degrees. */
  lat: number | null;
  lng: number | null;
}

const NO_METADATA: PhotoMetadata = { takenAt: null, lat: null, lng: null };

/** Only the tags this feature reads. */
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

export function toDecimalDegrees(value: unknown, ref: unknown): number | null {
  const letter = typeof ref === "string" ? ref.trim().toUpperCase().charAt(0) : "";
  const hemisphere = HEMISPHERES[letter];
  if (!hemisphere) return null;

  const parts = (Array.isArray(value) ? value : [value]).slice(0, 3);
  if (parts.length === 0) return null;

  let magnitude = 0;
  for (const [index, part] of parts.entries()) {
    // Negative components would mean the sign is being carried in two places at once.
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

  // Null Island.
  if (lat === 0 && lng === 0) return null;

  return { lat, lng };
}

function readTakenAt(tags: Record<string, unknown>): Date | null {
  const candidate = tags.DateTimeOriginal ?? tags.CreateDate ?? tags.ModifyDate;
  if (!(candidate instanceof Date) || Number.isNaN(candidate.getTime())) return null;
  if (candidate.getTime() > Date.now() + MAX_CLOCK_SKEW_MS) return null;
  return candidate;
}

/** Everything roamr wants from a photo's EXIF, or nulls. */
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
