import { describe, expect, it, vi } from "vitest";
import type { PhotoMetadata } from "../exif";
import type { EncodedPhoto } from "../image";
import { preparePhoto, type PhotoPipelineDeps } from "../photo-pipeline";

/** The ordering tests here are the point of this file. */

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

  /** The ordering assertion above passes even if the two steps are started together. */
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

    // Let every already-scheduled microtask run.
    await Promise.resolve();
    await Promise.resolve();
    expect(encode).not.toHaveBeenCalled();

    releaseMetadata?.();
    await pending;
    expect(encode).toHaveBeenCalledTimes(1);
  });

  /** The failure this catches is subtler than a swapped order. */
  it("reads the EXIF from the original file, not from anything derived from it", async () => {
    const original = new Blob(["original"]);
    const { deps } = createDeps();

    await preparePhoto(original, deps);

    // Identity.
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
