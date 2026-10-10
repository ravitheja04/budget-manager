/**
 * Credit-card billing cycles. A card with a statement day (say the 18th)
 * bills everything spent from the 19th of one month to the 18th of the next;
 * that bill is due on the due day (say the 6th) after the statement.
 * Pure, so it can be tested.
 */

import { addDays, nextDayOfMonth } from './dates';

/** The statement a purchase lands on: the first statement day on or after it (spends on the 18th are on the 18th's bill). */
export function statementFor(purchase: string, statementDay: number) {
  return nextDayOfMonth(statementDay, purchase);
}

/** The most recent statement on or before `date`. */
export function lastStatementOn(date: string, statementDay: number) {
  const next = nextDayOfMonth(statementDay, date);
  if (next === date) return date;
  // One month back from the next statement, keeping the day where the month allows.
  const [y, m] = next.split('-').map(Number);
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  return nextDayOfMonth(statementDay, `${prevY}-${String(prevM).padStart(2, '0')}-01`);
}

/** When a statement must be paid: the first due day after the statement date. */
export function dueFor(statement: string, dueDay: number) {
  return nextDayOfMonth(dueDay, addDays(statement, 1));
}

/**
 * The date an entry counts on in budgets and Stats. For a card set to "count
 * spends in the month the bill is paid", that is the 1st of the due month;
 * otherwise the entry's own date.
 */
export function bookDateFor(date: string, card: { statementDay: number | null; dueDay: number | null; billMonth: number } | null) {
  if (!card || !card.billMonth || !card.statementDay || !card.dueDay) return date;
  return `${dueFor(statementFor(date, card.statementDay), card.dueDay).slice(0, 7)}-01`;
}

export type CardTxn = { kind: 'expense' | 'income' | 'transfer'; amount: number; date: string; accountId: string | null; toAccountId: string | null };

export type CardCycle = {
  /** Owed on the card right now (positive = owed). */
  outstanding: number;
  lastStatement: string;
  nextStatement: string;
  /** What the last statement asks for, less anything paid since. */
  billed: number;
  billedDue: string;
  /** Spent since the last statement; on the next bill. */
  unbilled: number;
};

/** Splits what's owed on a card into the billed amount (due on the due day) and unbilled spends. */
export function cardCycle(cardId: string, openingBalance: number, txns: CardTxn[], statementDay: number, dueDay: number, today: string): CardCycle {
  // Effect on the card's balance (negative = more owed).
  const effect = (t: CardTxn) => {
    if (t.kind === 'income' && t.accountId === cardId) return t.amount;
    if (t.kind === 'expense' && t.accountId === cardId) return -t.amount;
    if (t.kind === 'transfer' && t.accountId === cardId) return -t.amount;
    if (t.kind === 'transfer' && t.toAccountId === cardId) return t.amount;
    return 0;
  };
  const lastStatement = lastStatementOn(today, statementDay);
  const sum = (list: CardTxn[]) => list.reduce((s, t) => s + effect(t), 0);
  const upToToday = txns.filter((t) => t.date <= today);
  const balanceNow = openingBalance + sum(upToToday);
  const balanceAtStatement = openingBalance + sum(upToToday.filter((t) => t.date <= lastStatement));
  const after = upToToday.filter((t) => t.date > lastStatement);
  const creditsSince = after.reduce((s, t) => s + Math.max(0, effect(t)), 0);
  const billed = Math.max(0, -balanceAtStatement - creditsSince);
  const outstanding = -balanceNow;
  return {
    outstanding,
    lastStatement,
    nextStatement: nextDayOfMonth(statementDay, addDays(lastStatement, 1)),
    billed,
    billedDue: dueFor(lastStatement, dueDay),
    unbilled: Math.max(0, outstanding - billed),
  };
}
