/**
 * Programme-week ⇄ calendar-date mapping.
 *
 * Week 1 commences on `week1Date`. Week N commences (N-1)*7 days later.
 * Dates are used for DISPLAY ONLY — the whole app is driven by week numbers.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Parse an ISO `YYYY-MM-DD` string as a UTC date (no timezone surprises). */
export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
}

/** Calendar date on which a given programme week commences. */
export function weekToDate(week1Date: string, week: number): Date {
  const start = parseISODate(week1Date);
  return new Date(start.getTime() + (week - 1) * MS_PER_WEEK);
}

/**
 * Nearest programme week for a calendar date.
 * Rounds to the closest week boundary and clamps to >= 1.
 */
export function dateToWeek(week1Date: string, target: Date): number {
  const start = parseISODate(week1Date);
  const diffWeeks = (target.getTime() - start.getTime()) / MS_PER_WEEK;
  return Math.max(1, Math.round(diffWeeks) + 1);
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "DD Mon YYYY" for a date (UTC fields). */
export function formatDate(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, '0');
  return `${dd} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** "w/c DD Mon YYYY" for the commencing date of a programme week. */
export function formatWeekCommencing(week1Date: string, week: number): string {
  return `w/c ${formatDate(weekToDate(week1Date, week))}`;
}

/**
 * Parse a flexible calendar date string into a Date.
 * Accepts ISO (YYYY-MM-DD) and UK DD/MM/YYYY (also '-' or '.' separators).
 * Returns null for ambiguous / unparseable input.
 */
export function parseFlexibleDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s) return null;

  // ISO: YYYY-MM-DD
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) {
    const [, y, m, d] = iso.map(Number);
    return validUTC(y, m, d);
  }

  // UK day-first: DD/MM/YYYY (separators / - .)
  const uk = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/.exec(s);
  if (uk) {
    let [, d, m, y] = uk.map(Number);
    if (y < 100) y += 2000;
    return validUTC(y, m, d);
  }

  return null;
}

function validUTC(y: number, m: number, d: number): Date | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  // Reject roll-over (e.g. 31/02) by checking fields survived.
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== m - 1 ||
    date.getUTCDate() !== d
  ) {
    return null;
  }
  return date;
}
