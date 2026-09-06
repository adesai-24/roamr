import { describe, expect, it } from "vitest";
import { computeTargetSize, MAX_PHOTO_DIMENSION } from "../image";

/**
 * Relative rather than absolute, because a panorama's ratio is a much bigger
 * number than a snapshot's and half a rounded pixel is worth more of it. Half a
 * percent is comfortably above what rounding one edge can cost and far below
 * what any real mistake -- a swapped axis, a cap applied to the wrong side --
 * would show up as.
 */
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
    // 3024 * 2048 / 4032 is exactly 1536; 2999 * 2048 / 4001 is not, and the
    // result has to land within half a pixel of it rather than being truncated.
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

  /**
   * Upscaling would cost bytes and add no detail -- the pixels it invents are
   * interpolation, so a 640px photo blown up to 2048px is a bigger, blurrier
   * 640px photo.
   */
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
