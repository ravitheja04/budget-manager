/**
 * Loan and deposit arithmetic, the way Indian banks quote it:
 * - Loans: reducing balance, monthly rest; EMI = P·r·(1+r)^n / ((1+r)^n − 1).
 * - Fixed deposits: compounded quarterly (or simple interest when paid out).
 * - Recurring deposits: each instalment compounded quarterly to maturity.
 * Rates are percent per year; amounts are paise.
 */

import { daysBetween, monthsBetween } from './dates';

/** Monthly EMI in paise, rounded to the rupee as banks do. */
export function emiFor(principal: number, annualRate: number, months: number) {
  if (months <= 0) return 0;
  const r = annualRate / 1200;
  const raw = r === 0 ? principal / months : (principal * r * (1 + r) ** months) / ((1 + r) ** months - 1);
  return Math.round(raw / 100) * 100;
}

/** Interest for one month on what is still owed, in paise. */
export function monthInterest(outstanding: number, annualRate: number) {
  return Math.round((outstanding * annualRate) / 1200);
}

/** Splits one EMI into interest and principal; the last EMI only covers what's left. */
export function splitEmi(outstanding: number, annualRate: number, emi: number) {
  const interest = monthInterest(outstanding, annualRate);
  const principal = Math.min(outstanding, Math.max(0, emi - interest));
  return { interest, principal, amount: interest + principal };
}

/** EMIs still needed to clear `outstanding` paying `emi` a month; Infinity if the EMI doesn't cover the interest. */
export function emisLeft(outstanding: number, annualRate: number, emi: number) {
  if (outstanding <= 0) return 0;
  const r = annualRate / 1200;
  if (r === 0) return Math.ceil(outstanding / emi);
  if (emi <= outstanding * r) return Infinity;
  return Math.ceil(-Math.log(1 - (r * outstanding) / emi) / Math.log(1 + r) - 1e-9);
}

export type ScheduleRow = { n: number; interest: number; principal: number; amount: number; balance: number };

/** The month-by-month repayment table from today's balance (capped at 40 years). */
export function schedule(outstanding: number, annualRate: number, emi: number): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let balance = outstanding;
  for (let n = 1; balance > 0 && n <= 480; n++) {
    const s = splitEmi(balance, annualRate, emi);
    if (s.principal <= 0) break;
    balance -= s.principal;
    rows.push({ n, ...s, balance });
  }
  return rows;
}

/** Total interest left to pay from today if the EMI stays the same. */
export function interestLeft(outstanding: number, annualRate: number, emi: number) {
  return schedule(outstanding, annualRate, emi).reduce((sum, r) => sum + r.interest, 0);
}

/**
 * What a prepayment saves. "tenure" keeps the EMI and finishes sooner;
 * "emi" keeps the remaining months and lowers the EMI.
 */
export function prepaymentEffect(outstanding: number, annualRate: number, emi: number, prepay: number) {
  const before = interestLeft(outstanding, annualRate, emi);
  const monthsBefore = emisLeft(outstanding, annualRate, emi);
  const after = Math.max(0, outstanding - prepay);
  const monthsAfter = emisLeft(after, annualRate, emi);
  const keepTenureEmi = Number.isFinite(monthsBefore) ? emiFor(after, annualRate, monthsBefore) : emi;
  return {
    tenure: { interestSaved: before - interestLeft(after, annualRate, emi), monthsSaved: monthsBefore - monthsAfter, emisLeft: monthsAfter },
    emi: { newEmi: keepTenureEmi, interestSaved: before - interestLeft(after, annualRate, keepTenureEmi) },
  };
}

/** Value of a fixed deposit on `on`: quarterly compounding (cumulative) or principal only (interest paid out). */
export function fdValue(principal: number, annualRate: number, start: string, on: string, payout = false) {
  const days = Math.max(0, daysBetween(start, on));
  if (payout) return principal;
  const quarters = days / 91.25;
  return Math.round(principal * (1 + annualRate / 400) ** quarters);
}

/** Maturity value of a recurring deposit of `instalment` a month for `months`, compounded quarterly. */
export function rdMaturity(instalment: number, annualRate: number, months: number) {
  let total = 0;
  for (let k = 1; k <= months; k++) {
    // The k-th from last instalment earns interest for k months.
    total += instalment * (1 + annualRate / 400) ** (k / 3);
  }
  return Math.round(total);
}

/** Months of an RD that run from start to maturity. */
export function rdMonths(start: string, maturity: string) {
  return Math.max(0, monthsBetween(start, maturity));
}
