/**
 * Calendar helpers on ISO dates (YYYY-MM-DD). Dates are plain calendar days,
 * worked out in UTC so time zones and daylight saving never shift them.
 */

export type Frequency = 'weekly' | 'monthly' | 'quarterly' | 'halfyearly' | 'yearly';

export const FREQUENCIES: Frequency[] = ['weekly', 'monthly', 'quarterly', 'halfyearly', 'yearly'];

const MONTHS_IN: Record<Exclude<Frequency, 'weekly'>, number> = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 };

/** How many times a year something with this frequency happens. */
export function perYear(f: Frequency) {
  return f === 'weekly' ? 52 : 12 / MONTHS_IN[f];
}

function parts(iso: string) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

function iso(y: number, m: number, d: number) {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toISOString().slice(0, 10);
}

export function daysInMonth(y: number, m: number) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function addDays(date: string, days: number) {
  const { y, m, d } = parts(date);
  return iso(y, m, d + days);
}

/** 31 Jan + 1 month = 28/29 Feb: the day is kept where the month allows it. */
export function addMonths(date: string, months: number) {
  const { y, m, d } = parts(date);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return iso(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

/** Whole days from `a` to `b` (negative when b is earlier). */
export function daysBetween(a: string, b: string) {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** The k-th date of a schedule that starts on `start` (k = 0 is the start). Counted from the start so 31st-of-month dates don't drift. */
export function occurrence(start: string, f: Frequency, k: number) {
  return f === 'weekly' ? addDays(start, 7 * k) : addMonths(start, MONTHS_IN[f] * k);
}

/** The first date of the schedule that falls after `after`. */
export function nextOccurrenceAfter(start: string, f: Frequency, after: string) {
  if (start > after) return start;
  // Jump close, then step: avoids looping over years of weekly dates.
  const approx = f === 'weekly' ? Math.floor(daysBetween(start, after) / 7) : Math.floor(monthsBetween(start, after) / MONTHS_IN[f]);
  let k = Math.max(0, approx - 1);
  while (occurrence(start, f, k) <= after) k++;
  return occurrence(start, f, k);
}

/** Whole calendar months from a to b, ignoring days. */
export function monthsBetween(a: string, b: string) {
  const pa = parts(a);
  const pb = parts(b);
  return (pb.y - pa.y) * 12 + (pb.m - pa.m);
}

/** "2026-10" for any date in October 2026. */
export function monthKey(date: string) {
  return date.slice(0, 7);
}

/** First and last day of the month a date falls in. */
export function monthRange(date: string) {
  const { y, m } = parts(date);
  return { start: iso(y, m, 1), end: iso(y, m, daysInMonth(y, m)) };
}

/** The next date (on or after `from`) that falls on this day of the month, e.g. a card's due day. */
export function nextDayOfMonth(day: number, from: string) {
  const { y, m, d } = parts(from);
  const thisMonth = iso(y, m, Math.min(day, daysInMonth(y, m)));
  if (Math.min(day, daysInMonth(y, m)) >= d) return thisMonth;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return iso(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

/** The Indian financial year (April–March) a date falls in: "2026-27". */
export function financialYear(date: string) {
  const { y, m } = parts(date);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "October 2026" */
export function monthTitle(date: string) {
  const { y, m } = parts(date);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}
