import { afterEach, describe, expect, it, vi } from "vitest";
import { computeTargetSize, encodePhoto, MAX_PHOTO_DIMENSION } from "../image";

const { isHeic, heicTo } = vi.hoisted(() => ({ isHeic: vi.fn(), heicTo: vi.fn() }));
vi.mock("heic-to/csp", () => ({ isHeic, heicTo }));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("encodePhoto", () => {
  function setup(nativeFailure: boolean) {
    const bitmap = { width: 4032, height: 3024, close: vi.fn() };
    const nativeDecode = vi.fn();
    if (nativeFailure)
      nativeDecode.mockRejectedValue(new Error("The source image could not be decoded."));
    else nativeDecode.mockResolvedValue(bitmap);
    vi.stubGlobal("createImageBitmap", nativeDecode);
    vi.mocked(isHeic).mockResolvedValue(true);
    vi.mocked(heicTo).mockResolvedValue(bitmap as ImageBitmap);
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      drawImage,
    } as unknown as CanvasRenderingContext2D);
    const jpeg = new Blob(["jpeg"], { type: "image/jpeg" });
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) =>
      callback(jpeg),
    );
    return { bitmap, jpeg, drawImage };
  }

  it("uses native decoding when available", async () => {
    const { bitmap } = setup(false);
    await encodePhoto(new Blob(["image"]));
    expect(isHeic).not.toHaveBeenCalled();
    expect(heicTo).not.toHaveBeenCalled();
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("decodes HEIC with missing MIME information and applies the normal JPEG resize", async () => {
    const { bitmap, jpeg, drawImage } = setup(true);
    const file = new File(["heic bytes"], "IMG_1234.HEIC");
    expect(await encodePhoto(file)).toEqual({ blob: jpeg, width: 2048, height: 1536 });
    expect(isHeic).toHaveBeenCalledWith(file);
    expect(heicTo).toHaveBeenCalledWith({ blob: file, type: "bitmap" });
    expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 2048, 1536);
    expect(bitmap.close).toHaveBeenCalledOnce();
  });

  it("provides an actionable error for unreadable files", async () => {
    setup(true);
    vi.mocked(isHeic).mockResolvedValue(false);
    await expect(encodePhoto(new Blob(["invalid"]))).rejects.toThrow("export it as JPEG or PNG");
    expect(heicTo).not.toHaveBeenCalled();
  });

  it("handles HEIC decoder failures", async () => {
    setup(true);
    vi.mocked(heicTo).mockRejectedValue(new Error("corrupt HEIC"));
    await expect(encodePhoto(new Blob(["corrupt"]))).rejects.toThrow("export it as JPEG or PNG");
  });
});

/** Relative rather than absolute. */
const ASPECT_TOLERANCE = 0.005;

function aspect({ width, height }: { width: number; height: number }): number {
  return width / height;
}

describe("computeTargetSize", () => {
  it("caps the long edge of a landscape photo at 2048", () => {
    const target = computeTargetSize({ width: 4032, height: 3024 });

    expect(target.width).toBe(MAX_PHOTO_DIMENSION);
    expect(target.height).toBe(1536);
  });

  it("caps the long edge of a portrait photo, not the width", () => {
    const target = computeTargetSize({ width: 3024, height: 4032 });

    expect(target.height).toBe(MAX_PHOTO_DIMENSION);
    expect(target.width).toBe(1536);
  });

  it("keeps the aspect ratio through the resize", () => {
    for (const source of [
      { width: 4032, height: 3024 },
      { width: 6000, height: 4000 },
      { width: 5000, height: 1000 },
      { width: 1000, height: 5000 },
      { width: 4001, height: 2999 },
    ]) {
      const target = computeTargetSize(source);
      const drift = Math.abs(aspect(target) / aspect(source) - 1);
      expect(drift).toBeLessThan(ASPECT_TOLERANCE);
    }
  });

  it("puts the short edge on the nearest whole pixel, not one further out", () => {
    // 3024 * 2048 / 4032 is exactly 1536.
    for (const source of [
      { width: 4032, height: 3024 },
      { width: 4001, height: 2999 },
      { width: 5000, height: 1000 },
    ]) {
      const target = computeTargetSize(source);
      const exact = (source.height * MAX_PHOTO_DIMENSION) / source.width;
      expect(Math.abs(target.height - exact)).toBeLessThanOrEqual(0.5);
    }
  });

  it("leaves an image that already fits exactly alone", () => {
    expect(computeTargetSize({ width: MAX_PHOTO_DIMENSION, height: 1200 })).toEqual({
      width: MAX_PHOTO_DIMENSION,
      height: 1200,
    });
  });

  /** Upscaling would cost bytes and add no detail. */
  it("never upscales an image that is already smaller than the cap", () => {
    expect(computeTargetSize({ width: 640, height: 480 })).toEqual({ width: 640, height: 480 });
    expect(computeTargetSize({ width: 1, height: 1 })).toEqual({ width: 1, height: 1 });
  });

  it("keeps the short edge at a whole pixel for an extreme panorama", () => {
    const target = computeTargetSize({ width: 20000, height: 5 });

    expect(target.width).toBe(MAX_PHOTO_DIMENSION);
    // Rounds to zero without the floor, and a zero-width canvas cannot encode.
    expect(target.height).toBeGreaterThanOrEqual(1);
  });

  it("honours a custom cap, so the constant is not baked into the arithmetic", () => {
    expect(computeTargetSize({ width: 1000, height: 500 }, 100)).toEqual({
      width: 100,
      height: 50,
    });
  });

  it("refuses dimensions that cannot describe an image", () => {
    expect(() => computeTargetSize({ width: 0, height: 100 })).toThrow();
    expect(() => computeTargetSize({ width: -10, height: 100 })).toThrow();
    expect(() => computeTargetSize({ width: Number.NaN, height: 100 })).toThrow();
    expect(() => computeTargetSize({ width: 100, height: 100 }, 0)).toThrow();
  });
});
