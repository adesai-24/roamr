/** Downscaling and re-encoding a picked photo, in the browser. */

/** Long edge, in pixels. */
export const MAX_PHOTO_DIMENSION = 2048;

export const PHOTO_CONTENT_TYPE = "image/jpeg";

/** High enough that the compression is invisible on a photo, low enough to halve the bytes. */
export const PHOTO_QUALITY = 0.82;

export interface Dimensions {
  width: number;
  height: number;
}

export interface EncodedPhoto {
  blob: Blob;
  width: number;
  height: number;
}

/** The target size for a photo, capped on its long edge. */
export function computeTargetSize(
  source: Dimensions,
  max: number = MAX_PHOTO_DIMENSION,
): Dimensions {
  const { width, height } = source;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error("Cannot resize an image without positive dimensions.");
  }
  if (!Number.isFinite(max) || max <= 0) {
    throw new Error("The maximum dimension must be a positive number.");
  }

  if (Math.max(width, height) <= max) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  if (width >= height) {
    return { width: max, height: Math.max(1, Math.round((height * max) / width)) };
  }
  return { width: Math.max(1, Math.round((width * max) / height)), height: max };
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("The browser could not encode that photo."));
      },
      PHOTO_CONTENT_TYPE,
      PHOTO_QUALITY,
    );
  });
}

/** Decode, rotate, downscale, re-encode as JPEG. */
export async function encodePhoto(
  file: Blob,
  max: number = MAX_PHOTO_DIMENSION,
): Promise<EncodedPhoto> {
  if (typeof createImageBitmap !== "function") {
    throw new Error("This browser cannot process photos. Try a newer one.");
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  try {
    const target = computeTargetSize({ width: bitmap.width, height: bitmap.height }, max);

    const canvas = document.createElement("canvas");
    canvas.width = target.width;
    canvas.height = target.height;

    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser could not open a canvas to resize the photo.");
    context.imageSmoothingQuality = "high";
    context.drawImage(bitmap, 0, 0, target.width, target.height);

    return { blob: await canvasToBlob(canvas), width: target.width, height: target.height };
  } finally {
    // Decoded bitmaps hold their pixels outside the JS heap.
    bitmap.close();
  }
}
