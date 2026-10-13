/** JPEGs carrying real EXIF, assembled byte by byte. */

const MARKER_SOI = 0xffd8;
const MARKER_APP1 = 0xffe1;
const MARKER_EOI = 0xffd9;

/** TIFF field types, from the EXIF spec. */
const TYPE_ASCII = 2;
const TYPE_LONG = 4;
const TYPE_RATIONAL = 5;

const TAG_EXIF_IFD_POINTER = 0x8769;
const TAG_GPS_IFD_POINTER = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_GPS_LATITUDE_REF = 0x0001;
const TAG_GPS_LATITUDE = 0x0002;
const TAG_GPS_LONGITUDE_REF = 0x0003;
const TAG_GPS_LONGITUDE = 0x0004;

/** A rational is a numerator/denominator pair; EXIF stores angles as three. */
export type Rational = readonly [numerator: number, denominator: number];
export type DegreesMinutesSeconds = readonly [Rational, Rational, Rational];

interface Entry {
  tag: number;
  type: number;
  count: number;
  /** Values of four bytes or fewer live in the entry; longer ones go on a heap. */
  data?: Uint8Array;
  /** A LONG value written directly into the entry, such as an IFD pointer. */
  inline?: number;
}

const ENTRY_BYTES = 12;
const IFD_OVERHEAD_BYTES = 2 + 4; // entry count, then the next-IFD pointer.

function ifdByteLength(entryCount: number): number {
  return IFD_OVERHEAD_BYTES + entryCount * ENTRY_BYTES;
}

function ascii(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length + 1); // EXIF ASCII is NUL-terminated.
  for (let i = 0; i < value.length; i += 1) bytes[i] = value.charCodeAt(i) & 0xff;
  return bytes;
}

function rationals(values: DegreesMinutesSeconds): Uint8Array {
  const bytes = new Uint8Array(values.length * 8);
  const view = new DataView(bytes.buffer);
  values.forEach(([numerator, denominator], index) => {
    view.setUint32(index * 8, numerator);
    view.setUint32(index * 8 + 4, denominator);
  });
  return bytes;
}

function concat(chunks: readonly Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

/** One IFD plus the heap its oversized values spill onto. */
function buildIfd(
  entries: readonly Entry[],
  heapStart: number,
): { bytes: Uint8Array; end: number } {
  const body = new Uint8Array(ifdByteLength(entries.length));
  const view = new DataView(body.buffer);
  view.setUint16(0, entries.length);

  const heap: Uint8Array[] = [];
  let heapOffset = heapStart;

  entries.forEach((entry, index) => {
    const at = 2 + index * ENTRY_BYTES;
    view.setUint16(at, entry.tag);
    view.setUint16(at + 2, entry.type);
    view.setUint32(at + 4, entry.count);

    if (!entry.data) {
      view.setUint32(at + 8, entry.inline ?? 0);
      return;
    }

    if (entry.data.length <= 4) {
      body.set(entry.data, at + 8);
      return;
    }

    view.setUint32(at + 8, heapOffset);
    heap.push(entry.data);
    heapOffset += entry.data.length;
    // IFD offsets must be even, so an odd-length value gets a pad byte.
    if (entry.data.length % 2 === 1) {
      heap.push(new Uint8Array(1));
      heapOffset += 1;
    }
  });

  // Next-IFD pointer: zero, because these fixtures carry only IFD0.
  view.setUint32(2 + entries.length * ENTRY_BYTES, 0);

  return { bytes: concat([body, ...heap]), end: heapOffset };
}

export interface ExifJpegOptions {
  /** Latitude as degrees/minutes/seconds, with its hemisphere reference. */
  latitude?: { dms: DegreesMinutesSeconds; ref: "N" | "S" };
  longitude?: { dms: DegreesMinutesSeconds; ref: "E" | "W" };
  /** EXIF's own format: "YYYY:MM:DD HH:MM:SS", with no timezone. */
  dateTimeOriginal?: string;
}

/** A JPEG that is nothing but an EXIF segment: start-of-image, APP1, end-of-image. */
export function buildExifJpeg(options: ExifJpegOptions = {}): Uint8Array {
  const { latitude, longitude, dateTimeOriginal } = options;
  const hasGps = Boolean(latitude && longitude);
  const hasExifIfd = Boolean(dateTimeOriginal);

  const tiffHeaderBytes = 8;
  const ifd0EntryCount = (hasExifIfd ? 1 : 0) + (hasGps ? 1 : 0);
  const exifIfdStart = tiffHeaderBytes + ifdByteLength(ifd0EntryCount);

  const exifIfd = hasExifIfd
    ? buildIfd(
        [
          {
            tag: TAG_DATE_TIME_ORIGINAL,
            type: TYPE_ASCII,
            count: dateTimeOriginal!.length + 1,
            data: ascii(dateTimeOriginal!),
          },
        ],
        exifIfdStart + ifdByteLength(1),
      )
    : { bytes: new Uint8Array(0), end: exifIfdStart };

  const gpsIfdStart = exifIfd.end;
  const gpsIfd =
    hasGps && latitude && longitude
      ? buildIfd(
          [
            { tag: TAG_GPS_LATITUDE_REF, type: TYPE_ASCII, count: 2, data: ascii(latitude.ref) },
            { tag: TAG_GPS_LATITUDE, type: TYPE_RATIONAL, count: 3, data: rationals(latitude.dms) },
            { tag: TAG_GPS_LONGITUDE_REF, type: TYPE_ASCII, count: 2, data: ascii(longitude.ref) },
            {
              tag: TAG_GPS_LONGITUDE,
              type: TYPE_RATIONAL,
              count: 3,
              data: rationals(longitude.dms),
            },
          ],
          gpsIfdStart + ifdByteLength(4),
        )
      : { bytes: new Uint8Array(0), end: gpsIfdStart };

  const ifd0Entries: Entry[] = [];
  if (hasExifIfd) {
    ifd0Entries.push({
      tag: TAG_EXIF_IFD_POINTER,
      type: TYPE_LONG,
      count: 1,
      inline: exifIfdStart,
    });
  }
  if (hasGps) {
    ifd0Entries.push({ tag: TAG_GPS_IFD_POINTER, type: TYPE_LONG, count: 1, inline: gpsIfdStart });
  }

  const header = new Uint8Array(tiffHeaderBytes);
  const headerView = new DataView(header.buffer);
  header[0] = 0x4d; // "MM": big-endian, which is what the writers above assume.
  header[1] = 0x4d;
  headerView.setUint16(2, 0x002a);
  headerView.setUint32(4, tiffHeaderBytes);

  const tiff = concat([
    header,
    buildIfd(ifd0Entries, exifIfdStart).bytes,
    exifIfd.bytes,
    gpsIfd.bytes,
  ]);

  const app1Payload = concat([ascii("Exif").subarray(0, 4), new Uint8Array([0, 0]), tiff]);
  const app1Header = new Uint8Array(4);
  const app1View = new DataView(app1Header.buffer);
  app1View.setUint16(0, MARKER_APP1);
  // A JPEG segment's length field counts itself but not the marker.
  app1View.setUint16(2, app1Payload.length + 2);

  const soi = new Uint8Array(2);
  new DataView(soi.buffer).setUint16(0, MARKER_SOI);
  const eoi = new Uint8Array(2);
  new DataView(eoi.buffer).setUint16(0, MARKER_EOI);

  return concat([soi, app1Header, app1Payload, eoi]);
}

/** Degrees, minutes and decimal seconds as the rational triplet EXIF stores. */
export function dms(degrees: number, minutes: number, seconds: number): DegreesMinutesSeconds {
  return [
    [degrees, 1],
    [minutes, 1],
    [Math.round(seconds * 1000), 1000],
  ];
}

/** Tokyo: northern and eastern, so both components come out positive. */
export const TOKYO_JPEG = buildExifJpeg({
  latitude: { dms: dms(35, 41, 22.2), ref: "N" },
  longitude: { dms: dms(139, 41, 30.12), ref: "E" },
  dateTimeOriginal: "2024:07:04 18:30:15",
});

/** Ushuaia. */
export const USHUAIA_JPEG = buildExifJpeg({
  latitude: { dms: dms(54, 48, 4.8), ref: "S" },
  longitude: { dms: dms(68, 18, 7.2), ref: "W" },
  dateTimeOriginal: "2023:01:12 09:05:00",
});

/** A photo with a timestamp but no GPS, a scan, or location services off. */
export const NO_GPS_JPEG = buildExifJpeg({ dateTimeOriginal: "2022:11:02 07:00:00" });

/** No EXIF at all: a screenshot, or an image some other tool already stripped. */
export const NO_EXIF_JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
