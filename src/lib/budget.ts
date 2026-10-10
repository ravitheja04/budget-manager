import { daysBetween, monthRange } from './dates';

export type BudgetProgress = {
  spent: number;
  budget: number;
  /** spent / budget (can pass 1). */
  ratio: number;
  /** Share of the month gone by `today` (0..1), for the "expected pace" marker. */
  pace: number;
  daysLeft: number;
  remaining: number;
  level: 'ok' | 'warn' | 'over';
};

export function budgetProgress(spent: number, budget: number, today: string): BudgetProgress {
  const { start, end } = monthRange(today);
  const total = daysBetween(start, end) + 1;
  const gone = daysBetween(start, today) + 1;
  const ratio = budget > 0 ? spent / budget : 0;
  return {
    spent,
    budget,
    ratio,
    pace: Math.min(1, gone / total),
    daysLeft: Math.max(0, daysBetween(today, end)),
    remaining: budget - spent,
    level: ratio >= 1 ? 'over' : ratio >= 0.8 ? 'warn' : 'ok',
  };
}

/** The alert threshold just crossed by going from `before` to `after` spent, if any. */
export function crossedThreshold(before: number, after: number, budget: number): 80 | 100 | null {
  if (budget <= 0) return null;
  if (before < budget && after >= budget) return 100;
  if (before < budget * 0.8 && after >= budget * 0.8) return 80;
  return null;
}
