import { describe, expect, it } from "vitest";
import {
  buildMomentPhotoPath,
  isMomentPhotoPathOwnedBy,
  MOMENT_PHOTO_BUCKET,
  newPhotoObjectId,
} from "../photo-path";

const USER = "8f14e45f-ceea-467a-9d1b-4c1f2a3b4c5d";
const OTHER_USER = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const OBJECT = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("buildMomentPhotoPath", () => {
  it("scopes the object under the owner's id", () => {
    expect(buildMomentPhotoPath(USER, OBJECT)).toBe(`${USER}/${OBJECT}.jpg`);
  });

  /**
   * The database compares this against `user_id::text`, which Postgres always
   * renders lower-case. A path built with the upper-case spelling of the same
   * uuid would fail that CHECK constraint at insert time.
   */
  it("lower-cases both ids so the path matches what Postgres writes", () => {
    expect(buildMomentPhotoPath(USER.toUpperCase(), OBJECT.toUpperCase())).toBe(
      `${USER}/${OBJECT}.jpg`,
    );
  });

  it("always ends in .jpg, because the pipeline re-encodes everything to JPEG", () => {
    expect(buildMomentPhotoPath(USER, newPhotoObjectId())).toMatch(/\.jpg$/);
  });

  it("refuses anything that is not a uuid, so no caller-supplied text reaches the path", () => {
    expect(() => buildMomentPhotoPath("../../etc", OBJECT)).toThrow();
    expect(() => buildMomentPhotoPath(USER, "../secrets")).toThrow();
    expect(() => buildMomentPhotoPath("", OBJECT)).toThrow();
    expect(() => buildMomentPhotoPath(USER, "photo.jpg")).toThrow();
  });

  it("generates a fresh object id each time", () => {
    expect(newPhotoObjectId()).not.toBe(newPhotoObjectId());
  });
});

describe("isMomentPhotoPathOwnedBy", () => {
  it("accepts a path this owner could have been given", () => {
    expect(isMomentPhotoPathOwnedBy(buildMomentPhotoPath(USER, OBJECT), USER)).toBe(true);
  });

  it("rejects another user's object, which is the whole point of the check", () => {
    expect(isMomentPhotoPathOwnedBy(`${OTHER_USER}/${OBJECT}.jpg`, USER)).toBe(false);
  });

  it("rejects a path that only starts with the owner's id", () => {
    expect(isMomentPhotoPathOwnedBy(`${USER}x/${OBJECT}.jpg`, USER)).toBe(false);
    expect(isMomentPhotoPathOwnedBy(`x${USER}/${OBJECT}.jpg`, USER)).toBe(false);
  });

  it("rejects traversal and extra path segments outright rather than stripping them", () => {
    expect(isMomentPhotoPathOwnedBy(`${USER}/../${OTHER_USER}/${OBJECT}.jpg`, USER)).toBe(false);
    expect(isMomentPhotoPathOwnedBy(`${USER}/nested/${OBJECT}.jpg`, USER)).toBe(false);
    expect(isMomentPhotoPathOwnedBy(`/${USER}/${OBJECT}.jpg`, USER)).toBe(false);
    expect(isMomentPhotoPathOwnedBy(`${USER}/${OBJECT}.jpg/x`, USER)).toBe(false);
  });

  it("rejects any extension other than the one the pipeline produces", () => {
    expect(isMomentPhotoPathOwnedBy(`${USER}/${OBJECT}.svg`, USER)).toBe(false);
    expect(isMomentPhotoPathOwnedBy(`${USER}/${OBJECT}.html`, USER)).toBe(false);
    expect(isMomentPhotoPathOwnedBy(`${USER}/${OBJECT}`, USER)).toBe(false);
  });

  it("rejects a non-string path and a caller with no valid id", () => {
    expect(isMomentPhotoPathOwnedBy(null, USER)).toBe(false);
    expect(isMomentPhotoPathOwnedBy(undefined, USER)).toBe(false);
    expect(isMomentPhotoPathOwnedBy({ path: `${USER}/${OBJECT}.jpg` }, USER)).toBe(false);
    expect(isMomentPhotoPathOwnedBy(`${USER}/${OBJECT}.jpg`, "not-a-uuid")).toBe(false);
  });
});

describe("the bucket", () => {
  it("is named once, so nothing has to remember the string", () => {
    expect(MOMENT_PHOTO_BUCKET).toBe("moment-photos");
  });
});
