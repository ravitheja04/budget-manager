/**
 * Everything the family has to pay or watch for, gathered from recurring
 * entries, loans, policies, holdings and credit cards into one dated list.
 * Pure: the screens and the reminder scheduler both use it.
 */

import { addDays, nextDayOfMonth } from './dates';
import type { Account, Holding, Loan, Policy, Recurring } from './types';

export type DueKind = 'recurring' | 'emi' | 'lent' | 'premium' | 'contribution' | 'card' | 'maturity' | 'policyEnd';

export type DueItem = {
  key: string;
  kind: DueKind;
  ownerId: string;
  title: string;
  date: string;
  amount: number | null;
  overdue: boolean;
  /** Premiums past the due date but still inside the grace period. */
  inGrace?: boolean;
  /** Days before the date to remind; several for premiums. */
  remindDays: number[];
};

export type DuesInput = {
  recurring: Recurring[];
  loans: { loan: Loan; nextEmiDate: string | null; nextEmiAmount: number | null; outstanding: number }[];
  policies: Policy[];
  holdings: Holding[];
  cards: { account: Account; outstanding: number }[];
};

/** Maturities and policy expiries are shown this far ahead even on the 7-day dashboard. */
export const LONG_HORIZON_DAYS = 30;

export function collectDues(input: DuesInput, today: string, horizonDays: number): DueItem[] {
  const until = addDays(today, horizonDays);
  const longUntil = addDays(today, Math.max(horizonDays, LONG_HORIZON_DAYS));
  const items: DueItem[] = [];
  const push = (item: Omit<DueItem, 'overdue'>, limit = until) => {
    if (item.date <= limit) items.push({ ...item, overdue: item.date < today });
  };

  for (const r of input.recurring) {
    if (!r.active || r.autoLog) continue;
    push({
      key: `recurring:${r.id}:${r.nextDate}`,
      kind: 'recurring',
      ownerId: r.id,
      title: r.title,
      date: r.nextDate,
      amount: r.amount,
      remindDays: r.reminderDays >= 0 ? [r.reminderDays] : [],
    });
  }

  for (const { loan, nextEmiDate, nextEmiAmount, outstanding } of input.loans) {
    if (loan.closed || outstanding <= 0) continue;
    if (loan.direction === 'borrowed' && nextEmiDate) {
      push({ key: `emi:${loan.id}:${nextEmiDate}`, kind: 'emi', ownerId: loan.id, title: loan.party, date: nextEmiDate, amount: nextEmiAmount, remindDays: [3, 0] });
    } else if (loan.direction === 'lent' && loan.dueDate) {
      push({ key: `lent:${loan.id}:${loan.dueDate}`, kind: 'lent', ownerId: loan.id, title: loan.party, date: loan.dueDate, amount: outstanding, remindDays: [0] });
    }
  }

  for (const p of input.policies) {
    if (!p.active) continue;
    if (p.nextDue) {
      const graceEnd = addDays(p.nextDue, p.graceDays);
      const inGrace = p.nextDue < today && graceEnd >= today;
      push({
        key: `premium:${p.id}:${p.nextDue}`,
        kind: 'premium',
        ownerId: p.id,
        title: p.insurer + (p.planName ? ` · ${p.planName}` : ''),
        date: p.nextDue,
        amount: p.premium,
        inGrace,
        remindDays: [30, 15, 7, 1, 0],
      });
    }
    if (p.endDate && p.endDate >= today) {
      push(
        { key: `policyEnd:${p.id}:${p.endDate}`, kind: 'policyEnd', ownerId: p.id, title: p.insurer + (p.planName ? ` · ${p.planName}` : ''), date: p.endDate, amount: null, remindDays: [30, 7] },
        longUntil
      );
    }
  }

  for (const h of input.holdings) {
    if (h.closed) continue;
    if (h.contribution && h.nextContributionDate) {
      push({
        key: `contribution:${h.id}:${h.nextContributionDate}`,
        kind: 'contribution',
        ownerId: h.id,
        title: h.name,
        date: h.nextContributionDate,
        amount: h.contribution,
        remindDays: [1],
      });
    }
    if (h.maturityDate && h.maturityDate >= today) {
      push({ key: `maturity:${h.id}:${h.maturityDate}`, kind: 'maturity', ownerId: h.id, title: h.name, date: h.maturityDate, amount: null, remindDays: [30, 7] }, longUntil);
    }
  }

  for (const { account, outstanding } of input.cards) {
    if (account.archived || !account.dueDay || outstanding <= 0) continue;
    const date = nextDayOfMonth(account.dueDay, today);
    push({ key: `card:${account.id}:${date}`, kind: 'card', ownerId: account.id, title: account.name, date, amount: outstanding, remindDays: [3, 0] });
  }

  return items.sort((a, b) => (a.date === b.date ? a.title.localeCompare(b.title) : a.date < b.date ? -1 : 1));
}
