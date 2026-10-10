/**
 * Where a loan stands, worked out from the loan and the payments logged
 * against it. Pure functions so they can be tested without a phone.
 */

import { addMonths, nextOccurrenceAfter } from './dates';
import { emisLeft, interestLeft, schedule, splitEmi } from './finance';
import type { Loan, LoanPayment } from './types';

export type LoanStatus = {
  /** Principal still owed (borrowed) or still to come back (lent). */
  outstanding: number;
  principalPaid: number;
  interestPaid: number;
  totalPaid: number;
  emisPaid: number;
  /** Borrowed loans with an EMI only. */
  nextEmiDate: string | null;
  nextEmi: { interest: number; principal: number; amount: number } | null;
  emisLeft: number | null;
  interestLeft: number | null;
  closureDate: string | null;
  /** 0..1 of the principal repaid. */
  progress: number;
};

export function loanStatus(loan: Loan, payments: LoanPayment[]): LoanStatus {
  const principalPaid = payments.reduce((s, p) => s + p.principal, 0);
  const interestPaid = payments.reduce((s, p) => s + p.interest, 0);
  const totalPaid = payments.reduce((s, p) => s + p.amount, 0);
  const outstanding = Math.max(0, loan.principal - principalPaid);
  const emiPayments = payments.filter((p) => p.kind === 'emi' || p.kind === 'opening');
  const emisPaid = payments.filter((p) => p.kind === 'emi').length + openingEmiCount(payments);
  const progress = loan.principal > 0 ? Math.min(1, principalPaid / loan.principal) : 0;

  const base = { outstanding, principalPaid, interestPaid, totalPaid, emisPaid, progress };
  if (loan.direction !== 'borrowed' || !loan.emi || outstanding <= 0 || loan.closed) {
    return { ...base, nextEmiDate: null, nextEmi: null, emisLeft: outstanding <= 0 ? 0 : null, interestLeft: null, closureDate: null };
  }

  const lastEmi = emiPayments.reduce<string | null>((latest, p) => (!latest || p.date > latest ? p.date : latest), null);
  const nextEmiDate = lastEmi ? nextOccurrenceAfter(loan.startDate, 'monthly', lastEmi) : loan.startDate;
  const left = emisLeft(outstanding, loan.rate, loan.emi);
  return {
    ...base,
    nextEmiDate,
    nextEmi: splitEmi(outstanding, loan.rate, loan.emi),
    emisLeft: Number.isFinite(left) ? left : null,
    interestLeft: Number.isFinite(left) ? interestLeft(outstanding, loan.rate, loan.emi) : null,
    closureDate: Number.isFinite(left) && left > 0 ? addMonths(nextEmiDate, left - 1) : null,
  };
}

/** An "opening" record stands for the EMIs paid before the loan was added (see openingRecord). */
function openingEmiCount(payments: LoanPayment[]) {
  return payments.filter((p) => p.kind === 'opening').reduce((s, p) => s + (p.emiCount ?? 0), 0);
}

/**
 * For a loan that started before it was added to the app: the EMIs that fell
 * due before `today` are assumed paid, summed into one record so the
 * outstanding balance and the next EMI date come out right.
 */
export function openingRecord(loan: Pick<Loan, 'principal' | 'rate' | 'emi' | 'startDate'>, today: string) {
  if (!loan.emi || loan.startDate >= today) return null;
  const rows = schedule(loan.principal, loan.rate, loan.emi);
  let count = 0;
  let lastDate = loan.startDate;
  for (let k = 0; k < rows.length; k++) {
    const date = addMonths(loan.startDate, k);
    if (date >= today) break;
    count = k + 1;
    lastDate = date;
  }
  if (count === 0) return null;
  const paid = rows.slice(0, count);
  return {
    date: lastDate,
    emiCount: count,
    principal: paid.reduce((s, r) => s + r.principal, 0),
    interest: paid.reduce((s, r) => s + r.interest, 0),
    amount: paid.reduce((s, r) => s + r.amount, 0),
  };
}
