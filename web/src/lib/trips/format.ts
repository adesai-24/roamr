/** Turning a trip's optional date range into something a person reads. */

/** Dates are stored as `date`, not `timestamptz`, and arrive as "2026-07-04". */
function toLocalDate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

function format(date: Date, opts: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(undefined, opts).format(date);
}

const SAME_YEAR: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
const WITH_YEAR: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };

/** Returns null when there is nothing worth showing. */
export function formatTripDates(startsOn: string | null, endsOn: string | null): string | null {
  const start = startsOn ? toLocalDate(startsOn) : null;
  const end = endsOn ? toLocalDate(endsOn) : null;

  if (!start && !end) return null;
  if (start && !end) return `From ${format(start, WITH_YEAR)}`;
  if (!start && end) return `Until ${format(end, WITH_YEAR)}`;
  if (!start || !end) return null;

  if (start.getTime() === end.getTime()) return format(start, WITH_YEAR);

  // Within one year the year is stated once, at the end, rather than twice.
  if (start.getFullYear() === end.getFullYear()) {
    return `${format(start, SAME_YEAR)} – ${format(end, WITH_YEAR)}`;
  }
  return `${format(start, WITH_YEAR)} – ${format(end, WITH_YEAR)}`;
}

/** "Chicago and Milwaukee", "Chicago, Milwaukee and 2 more". */
export function formatTripCities(cityNames: readonly string[], max = 2): string | null {
  if (cityNames.length === 0) return null;
  if (cityNames.length === 1) return cityNames[0];
  if (cityNames.length === 2) return `${cityNames[0]} and ${cityNames[1]}`;

  const shown = cityNames.slice(0, max);
  const remaining = cityNames.length - shown.length;
  if (remaining === 0) {
    return `${shown.slice(0, -1).join(", ")} and ${shown[shown.length - 1]}`;
  }
  return `${shown.join(", ")} and ${remaining} more`;
}
