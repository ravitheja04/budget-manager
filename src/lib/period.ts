/**
 * The date ranges the Stats screen can show: a week (Monday to Sunday), a
 * calendar month, a calendar year, an Indian financial year (April to March)
 * or any custom range. Pure, so it can be tested.
 */

import { addDays, addMonths, daysBetween, financialYear, monthRange, monthTitle } from './dates';
import { formatDate } from './format';

export type PeriodMode = 'week' | 'month' | 'year' | 'fy' | 'custom';

export const PERIOD_MODES: PeriodMode[] = ['week', 'month', 'year', 'fy', 'custom'];

export type Period = { mode: PeriodMode; from: string; to: string };

/** The period of this kind that contains `date`. */
export function periodFor(mode: Exclude<PeriodMode, 'custom'>, date: string): Period {
  const [y, m] = date.split('-').map(Number);
  switch (mode) {
    case 'week': {
      // Monday is day 0.
      const weekday = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
      const from = addDays(date, -weekday);
      return { mode, from, to: addDays(from, 6) };
    }
    case 'month': {
      const r = monthRange(date);
      return { mode, from: r.start, to: r.end };
    }
    case 'year':
      return { mode, from: `${y}-01-01`, to: `${y}-12-31` };
    case 'fy': {
      const start = m >= 4 ? y : y - 1;
      return { mode, from: `${start}-04-01`, to: `${start + 1}-03-31` };
    }
  }
}

/** The previous (-1) or next (+1) period of the same kind; a custom range moves by its own length. */
export function shiftPeriod(p: Period, step: -1 | 1): Period {
  switch (p.mode) {
    case 'week':
      return periodFor('week', addDays(p.from, 7 * step));
    case 'month':
      return periodFor('month', addMonths(p.from, step));
    case 'year':
      return periodFor('year', addMonths(p.from, 12 * step));
    case 'fy':
      return periodFor('fy', addMonths(p.from, 12 * step));
    case 'custom': {
      const days = daysBetween(p.from, p.to) + 1;
      return { mode: 'custom', from: addDays(p.from, days * step), to: addDays(p.to, days * step) };
    }
  }
}

/** "Oct 2026", "2026", "FY 2026-27", "6 Oct – 12 Oct 2026". */
export function periodLabel(p: Period) {
  switch (p.mode) {
    case 'month':
      return monthTitle(p.from);
    case 'year':
      return p.from.slice(0, 4);
    case 'fy':
      return `FY ${financialYear(p.from)}`;
    default: {
      const sameYear = p.from.slice(0, 4) === p.to.slice(0, 4);
      return `${sameYear ? formatDate(p.from).replace(/ \d{4}$/, '') : formatDate(p.from)} – ${formatDate(p.to)}`;
    }
  }
}

export type Slice<T> = { key: string; value: number; item: T | null };

/**
 * The largest `max` entries, with the rest folded into one "Other" slice
 * (item null) so a pie stays readable.
 */
export function topWithOther<T>(entries: { key: string; value: number; item: T }[], max = 6): Slice<T>[] {
  const sorted = entries.filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
  if (sorted.length <= max + 1) return sorted;
  const rest = sorted.slice(max).reduce((s, e) => s + e.value, 0);
  return [...sorted.slice(0, max), { key: 'other', value: rest, item: null }];
}
