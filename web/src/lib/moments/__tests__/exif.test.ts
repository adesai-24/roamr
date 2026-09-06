import { describe, expect, it } from "vitest";
import {
  buildExifJpeg,
  dms,
  NO_EXIF_JPEG,
  NO_GPS_JPEG,
  TOKYO_JPEG,
  USHUAIA_JPEG,
} from "../__fixtures__/exif-jpeg";
import { readPhotoMetadata, toDecimalDegrees } from "../exif";

/**
 * Coordinates good to five decimal places -- about a metre. Tighter than that
 * would be asserting on floating point noise, looser would let a sign error in
 * the seconds component through.
 */
const PRECISION = 5;

describe("toDecimalDegrees", () => {
  it("adds minutes and seconds into the degrees", () => {
    // 35° 41′ 22.2″ = 35 + 41/60 + 22.2/3600
    expect(toDecimalDegrees([35, 41, 22.2], "N")).toBeCloseTo(35.6895, PRECISION);
  });

  it("makes southern latitudes negative", () => {
    expect(toDecimalDegrees([54, 48, 4.8], "S")).toBeCloseTo(-54.80133, PRECISION);
  });

  it("makes western longitudes negative", () => {
    expect(toDecimalDegrees([87, 37, 27.84], "W")).toBeCloseTo(-87.6244, PRECISION);
  });

  it("reads the hemisphere case-insensitively and ignores surrounding space", () => {
    expect(toDecimalDegrees([10, 0, 0], " s ")).toBeCloseTo(-10, PRECISION);
  });

  it("accepts a bare number, which is what a whole-degree value can arrive as", () => {
    expect(toDecimalDegrees(41, "N")).toBeCloseTo(41, PRECISION);
  });

  it("rejects a missing or unrecognised hemisphere rather than guessing north", () => {
    expect(toDecimalDegrees([41, 52, 55], undefined)).toBeNull();
    expect(toDecimalDegrees([41, 52, 55], "X")).toBeNull();
    expect(toDecimalDegrees([41, 52, 55], "")).toBeNull();
  });

  it("rejects a latitude past the pole and a longitude past the date line", () => {
    expect(toDecimalDegrees([91, 0, 0], "N")).toBeNull();
    expect(toDecimalDegrees([181, 0, 0], "E")).toBeNull();
    // The same magnitude is fine as a longitude, which is why the bound is
    // taken from the hemisphere letter rather than fixed at 90.
    expect(toDecimalDegrees([91, 0, 0], "E")).toBeCloseTo(91, PRECISION);
  });

  it("rejects a negative component, which would mean two competing signs", () => {
    expect(toDecimalDegrees([-35, 41, 22.2], "N")).toBeNull();
    expect(toDecimalDegrees([35, -41, 22.2], "N")).toBeNull();
  });

  it("rejects values that are not finite numbers", () => {
    expect(toDecimalDegrees([Number.NaN, 0, 0], "N")).toBeNull();
    expect(toDecimalDegrees([Number.POSITIVE_INFINITY], "N")).toBeNull();
    expect(toDecimalDegrees(["35", "41", "22.2"], "N")).toBeNull();
    expect(toDecimalDegrees([], "N")).toBeNull();
  });
});

describe("readPhotoMetadata", () => {
  it("reads a northern, eastern coordinate and a capture time", async () => {
    const metadata = await readPhotoMetadata(TOKYO_JPEG);

    expect(metadata.lat).toBeCloseTo(35.6895, PRECISION);
    expect(metadata.lng).toBeCloseTo(139.6917, PRECISION);
    expect(metadata.takenAt).toBeInstanceOf(Date);
  });

  /**
   * The case that makes the sign handling worth testing at all: Ushuaia is
   * south *and* west, so dropping either sign moves the photo to a different
   * continent while leaving a coordinate that still looks perfectly valid.
   */
  it("reads a southern, western coordinate with both signs intact", async () => {
    const metadata = await readPhotoMetadata(USHUAIA_JPEG);

    expect(metadata.lat).toBeCloseTo(-54.80133, PRECISION);
    expect(metadata.lng).toBeCloseTo(-68.302, PRECISION);
  });

  it("returns a capture time with no coordinates when the photo has no GPS", async () => {
    const metadata = await readPhotoMetadata(NO_GPS_JPEG);

    expect(metadata.lat).toBeNull();
    expect(metadata.lng).toBeNull();
    expect(metadata.takenAt).toBeInstanceOf(Date);
  });

  it("returns nothing rather than throwing when there is no EXIF at all", async () => {
    await expect(readPhotoMetadata(NO_EXIF_JPEG)).resolves.toEqual({
      takenAt: null,
      lat: null,
      lng: null,
    });
  });

  it("treats a half-written GPS block as no location", async () => {
    // A latitude with no longitude cannot place anything, and half a
    // coordinate stored as a pin would be worse than none.
    const halfWritten = buildExifJpeg({
      latitude: { dms: dms(35, 41, 22.2), ref: "N" },
      dateTimeOriginal: "2024:07:04 18:30:15",
    });

    const metadata = await readPhotoMetadata(halfWritten);

    expect(metadata.lat).toBeNull();
    expect(metadata.lng).toBeNull();
  });

  it("treats a (0, 0) fix as no location", async () => {
    // Null Island: a real point in the Gulf of Guinea, and never where the
    // photo was taken. Devices write it when a fix fails.
    const nullIsland = buildExifJpeg({
      latitude: { dms: dms(0, 0, 0), ref: "N" },
      longitude: { dms: dms(0, 0, 0), ref: "E" },
    });

    const metadata = await readPhotoMetadata(nullIsland);

    expect(metadata.lat).toBeNull();
    expect(metadata.lng).toBeNull();
  });

  it("ignores a capture time from the future, which is a broken clock", async () => {
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const stamp = `${nextYear.getFullYear()}:01:01 12:00:00`;

    const metadata = await readPhotoMetadata(buildExifJpeg({ dateTimeOriginal: stamp }));

    expect(metadata.takenAt).toBeNull();
  });
});
