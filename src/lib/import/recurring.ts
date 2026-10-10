/**
 * Spots monthly regulars in imported history (rent, salary, chits, EMIs) so
 * they can be set up as recurring entries with reminders. A regular is the
 * same note, amount and kind on about the same day in each of the last three
 * months of the data.
 */

import { addDays, addMonths, daysInMonth, monthsBetween, nextOccurrenceAfter } from '../dates';
import type { TxnKind } from '../types';

export type RecurringCandidate = {
  key: string;
  title: string;
  kind: TxnKind;
  amount: number;
  account: string;
  toAccount: string | null;
  category: string;
  day: number;
  /** The next date on or after `today`. */
  nextDate: string;
  lastDate: string;
};

type Row = { date: string; kind: TxnKind; amount: number; account: string; toAccount: string | null; category: string; note: string };

export function findRecurring(records: Row[], today: string, months = 3): RecurringCandidate[] {
  if (!records.length) return [];
  const latest = records.reduce((m, r) => (r.date > m ? r.date : m), records[0].date);
  // Too old to be a current regular.
  if (monthsBetween(latest, today) > 2) return [];

  const groups = new Map<string, Row[]>();
  for (const r of records) {
    const title = r.note.trim();
    if (!title) continue;
    const key = [r.kind, title.toLowerCase(), r.amount, r.account.toLowerCase()].join('|');
    const list = groups.get(key) ?? [];
    list.push(r);
    groups.set(key, list);
  }

  const out: RecurringCandidate[] = [];
  for (const [key, list] of groups) {
    const byMonth = new Map<string, Row>();
    for (const r of list) {
      const m = r.date.slice(0, 7);
      const prev = byMonth.get(m);
      if (!prev || r.date > prev.date) byMonth.set(m, r);
    }
    // Present in each of the last `months` months of the data.
    const recent = Array.from({ length: months }, (_, k) => addMonths(`${latest.slice(0, 7)}-01`, -k).slice(0, 7));
    if (!recent.every((m) => byMonth.has(m))) continue;
    // Twice in the same month is not a monthly regular.
    if (recent.some((m) => list.filter((r) => r.date.startsWith(m)).length > 1)) continue;
    const days = recent.map((m) => Number(byMonth.get(m)!.date.slice(8)));
    if (Math.max(...days) - Math.min(...days) > 3) continue;

    const last = byMonth.get(recent[0])!;
    const day = Math.min(...days);
    // Anchor on the usual day in the month of the last entry, then step to today or later.
    const [y, mo] = last.date.split('-').map(Number);
    const anchor = `${last.date.slice(0, 8)}${String(Math.min(day, daysInMonth(y, mo))).padStart(2, '0')}`;
    // "After yesterday" so a regular due today is still offered for today.
    const nextDate = nextOccurrenceAfter(anchor, 'monthly', addDays(today, -1));
    out.push({ key, title: last.note.trim(), kind: last.kind, amount: last.amount, account: last.account, toAccount: last.toAccount, category: last.category, day, nextDate, lastDate: last.date });
  }
  return out.sort((a, b) => (a.kind === b.kind ? b.amount - a.amount : a.kind === 'income' ? -1 : 1));
}
