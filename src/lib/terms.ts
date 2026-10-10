/**
 * How far along a policy's premiums or a scheme's deposits are. Many plans
 * take payments for fewer years than they last: a term policy may take
 * premiums for 10 years and cover 35; Sukanya Samriddhi takes deposits for
 * 15 years and matures at 21. Pure, so it can be tested.
 */

import { addMonths, monthsBetween, occurrence, type Frequency } from './dates';

export type PayFrequency = Frequency | 'single';

export type ScheduleInput = {
  start: string | null;
  frequency: PayFrequency | null;
  /** The next payment date; null once payments have finished (or are unknown). */
  next: string | null;
  /** Years payments are made for (premium / deposit paying term). */
  payYears: number | null;
  /** Amount of each payment. */
  amount: number;
  /** When the cover ends or the plan matures. */
  end: string | null;
};

export type Progress = {
  paidCount: number;
  /** Null when the paying term isn't known. */
  totalCount: number | null;
  leftCount: number | null;
  perYear: number;
  /** Estimated as payments × amount. */
  paidAmount: number;
  leftAmount: number | null;
  yearsPaid: number;
  yearsToPay: number | null;
  yearsLeftToPay: number | null;
  /** Date of the last payment, when the term is known. */
  lastPayment: string | null;
  finished: boolean;
  /** Whole years of cover / until maturity left from today, and in total. */
  coverYearsLeft: number | null;
  coverYearsTotal: number | null;
};

const PER_YEAR: Record<PayFrequency, number> = { weekly: 52, monthly: 12, quarterly: 4, halfyearly: 2, yearly: 1, single: 1 };

/** The k-th payment date, from the start. */
function paymentDate(start: string, f: PayFrequency, k: number) {
  return f === 'single' ? start : occurrence(start, f, k);
}

/** Payment k (0-based) is the last one in a term of this many. */
export function totalPayments(payYears: number | null, f: PayFrequency) {
  if (f === 'single') return 1;
  return payYears && payYears > 0 ? Math.round(payYears * PER_YEAR[f]) : null;
}

/** The date of the last payment in the term, or null if the term isn't known. */
export function lastPaymentDate(start: string | null, f: PayFrequency | null, payYears: number | null) {
  if (!start || !f) return null;
  const total = totalPayments(payYears, f);
  return total ? paymentDate(start, f, total - 1) : null;
}

/** The payment after `current`, or null once the paying term is over. */
export function nextPaymentWithinTerm(current: string, start: string | null, f: PayFrequency, payYears: number | null, step: (d: string) => string) {
  if (f === 'single') return null;
  const next = step(current);
  const last = lastPaymentDate(start, f, payYears);
  return last && next > last ? null : next;
}

const years = (months: number) => Math.round((months / 12) * 10) / 10;

export function scheduleProgress(s: ScheduleInput, today: string): Progress {
  const f = s.frequency ?? 'yearly';
  const perYear = PER_YEAR[f];
  const total = totalPayments(s.payYears, f);
  let paid = 0;
  if (s.start) {
    if (f === 'single') paid = s.start <= today ? 1 : 0;
    else if (s.next) {
      // Every scheduled payment before the next one has been made.
      while (paymentDate(s.start, f, paid) < s.next && paid < 2000) paid++;
    } else {
      // No next date: payments are over (if the term is known) or counted up to today.
      if (total !== null) paid = total;
      else while (paymentDate(s.start, f, paid) <= today && paid < 2000) paid++;
    }
  }
  if (total !== null) paid = Math.min(paid, total);
  const left = total === null ? null : total - paid;

  const coverYearsLeft = s.end ? Math.max(0, years(monthsBetween(today, s.end))) : null;
  const coverYearsTotal = s.end && s.start ? years(monthsBetween(s.start, s.end)) : null;
  return {
    paidCount: paid,
    totalCount: total,
    leftCount: left,
    perYear,
    paidAmount: paid * s.amount,
    leftAmount: left === null ? null : left * s.amount,
    yearsPaid: f === 'single' ? 0 : Math.round((paid / perYear) * 10) / 10,
    yearsToPay: f === 'single' ? 0 : s.payYears,
    yearsLeftToPay: left === null ? null : f === 'single' ? 0 : Math.round((left / perYear) * 10) / 10,
    lastPayment: s.start && total ? paymentDate(s.start, f, total - 1) : null,
    finished: total !== null && left === 0,
    coverYearsLeft,
    coverYearsTotal,
  };
}

/** Sukanya Samriddhi: deposits for 15 years from opening, matures 21 years after opening. PPF: 15 years. */
export const SCHEME_DEFAULTS: Partial<Record<'ssy' | 'ppf', { payYears: number; maturityYears: number }>> = {
  ssy: { payYears: 15, maturityYears: 21 },
  ppf: { payYears: 15, maturityYears: 15 },
};

export function maturityFrom(start: string, maturityYears: number) {
  return addMonths(start, maturityYears * 12);
}
