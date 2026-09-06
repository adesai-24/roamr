import { format, isSameDay, isSameYear } from "date-fns";

/** Dates as they appear on the collection pages. Kept here so they read alike everywhere. */

function parse(iso: string | null): Date | null {
  if (!iso) return null;
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatMomentDate(iso: string | null): string | null {
  const date = parse(iso);
  return date ? format(date, "d MMM yyyy") : null;
}

/**
 * How long a collection spans.
 *
 * A single day, or several photos from one day, reads as a date rather than as
 * a range from a day to itself. Two dates in the same year drop the first
 * year, because repeating it says nothing.
 */
export function formatCollectionSpan(
  firstIso: string | null,
  lastIso: string | null,
): string | null {
  const first = parse(firstIso);
  const last = parse(lastIso);
  if (!first || !last) return null;
  if (isSameDay(first, last)) return format(first, "d MMM yyyy");
  if (isSameYear(first, last)) return `${format(first, "d MMM")} – ${format(last, "d MMM yyyy")}`;
  return `${format(first, "MMM yyyy")} – ${format(last, "MMM yyyy")}`;
}

export function formatMomentCount(count: number): string {
  return `${count} ${count === 1 ? "moment" : "moments"}`;
}
