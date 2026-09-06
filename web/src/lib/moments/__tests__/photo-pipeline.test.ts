import { describe, expect, it, vi } from "vitest";
import type { PhotoMetadata } from "../exif";
import type { EncodedPhoto } from "../image";
import { preparePhoto, type PhotoPipelineDeps } from "../photo-pipeline";

/**
 * The ordering tests here are the point of this file.
 *
 * Re-encoding a photo through a canvas strips its EXIF. That is exactly what
 * makes the pipeline safe -- the GPS fix of wherever the photo was taken never
 * reaches storage -- and it is also what makes the order silently reversible: a
 * refactor that encodes first and reads metadata from the result still returns
 * a plausible-looking object with no coordinates, or worse, still works because
 * some encoder preserved them. Nothing else in the suite would notice, and the
 * only way to see the failure in production is to open a stored file.
 */

const METADATA: PhotoMetadata = {
  takenAt: new Date("2024-07-04T18:30:15.000Z"),
  lat: 35.6895,
  lng: 139.6917,
};

const ENCODED: EncodedPhoto = { blob: new Blob(["encoded"]), width: 2048, height: 1536 };

function createDeps(): { deps: PhotoPipelineDeps; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    deps: {
      readMetadata: vi.fn(async () => {
        calls.push("readMetadata");
        return METADATA;
      }),
      encode: vi.fn(async () => {
        calls.push("encode");
        return ENCODED;
      }),
    },
  };
}

describe("preparePhoto", () => {
  it("reads the EXIF before re-encoding", async () => {
    const original = new Blob(["original"]);
    const { deps, calls } = createDeps();

    await preparePhoto(original, deps);

    expect(calls).toEqual(["readMetadata", "encode"]);
  });

  /**
   * The ordering assertion above passes even if the two steps are started
   * together, so this pins the sequencing: nothing may begin encoding while
   * the metadata read is still in flight, because that is the shape a
   * `Promise.all` refactor takes.
   */
  it("waits for the metadata read to finish before encoding starts", async () => {
    let releaseMetadata: (() => void) | undefined;
    const metadataDone = new Promise<void>((resolve) => {
      releaseMetadata = resolve;
    });

    const encode = vi.fn(async () => ENCODED);
    const pending = preparePhoto(new Blob(["original"]), {
      readMetadata: async () => {
        await metadataDone;
        return METADATA;
      },
      encode,
    });

    // Let every already-scheduled microtask run. If the pipeline had kicked
    // both off at once, the encoder would have been called by now.
    await Promise.resolve();
    await Promise.resolve();
    expect(encode).not.toHaveBeenCalled();

    releaseMetadata?.();
    await pending;
    expect(encode).toHaveBeenCalledTimes(1);
  });

  /**
   * The failure this catches is subtler than a swapped order: reading metadata
   * from `encoded.blob` rather than from `file` runs the two steps in the right
   * sequence and still finds nothing, because the encoder has already stripped
   * it. Identity, not order, is what rules that out.
   */
  it("reads the EXIF from the original file, not from anything derived from it", async () => {
    const original = new Blob(["original"]);
    const { deps } = createDeps();

    await preparePhoto(original, deps);

    // Identity, not equality: two Blobs with different bytes compare as equal
    // under a structural matcher, so `toHaveBeenCalledWith` would pass happily
    // on the encoded blob and prove nothing.
    expect(vi.mocked(deps.readMetadata).mock.calls[0]?.[0]).toBe(original);
    expect(vi.mocked(deps.encode).mock.calls[0]?.[0]).toBe(original);
  });

  it("returns the encoded blob and dimensions alongside the original's metadata", async () => {
    const { deps } = createDeps();

    const prepared = await preparePhoto(new Blob(["original"]), deps);

    expect(prepared).toEqual({
      blob: ENCODED.blob,
      width: ENCODED.width,
      height: ENCODED.height,
      takenAt: METADATA.takenAt,
      lat: METADATA.lat,
      lng: METADATA.lng,
    });
  });

  it("carries nulls through for a photo that knew nothing about itself", async () => {
    const prepared = await preparePhoto(new Blob(["original"]), {
      readMetadata: async () => ({ takenAt: null, lat: null, lng: null }),
      encode: async () => ENCODED,
    });

    expect(prepared.takenAt).toBeNull();
    expect(prepared.lat).toBeNull();
    expect(prepared.lng).toBeNull();
    expect(prepared.blob).toBe(ENCODED.blob);
  });
});
