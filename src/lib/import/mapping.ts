/**
 * Suggests where each imported category should go: one of the app's
 * categories, a new category with the same name, or "transfer" for money
 * moved into savings (chits, SSY, PPF, SIPs) so it isn't counted as spending.
 * The import screen shows these and lets the user change any of them.
 */

import type { AccountKind, Category, TxnKind } from '../types';
import type { ImportRecord } from './sheet';

export type Target = { type: 'category'; id: string } | { type: 'new'; name: string } | { type: 'transfer' };

export type SourceCategory = { kind: Exclude<TxnKind, 'transfer'>; name: string; count: number; total: number };

const INCOME_RULES: [RegExp, string][] = [
  [/salary|wage|pay ?slip|stipend/, 'inc-salary'],
  [/bonus|incentive/, 'inc-bonus'],
  [/interest/, 'inc-interest'],
  [/dividend/, 'inc-dividends'],
  [/rent/, 'inc-rent'],
  [/refund|cash ?back|reimburse/, 'inc-refunds'],
  [/gift/, 'inc-gifts'],
  [/business|freelanc|consult/, 'inc-business'],
];

const EXPENSE_RULES: [RegExp, string][] = [
  [/eating|restaurant|dining|swiggy|zomato|take ?away/, 'exp-eatout'],
  [/food|grocer|vegetable|milk/, 'exp-food'],
  [/rent|maintenance|housing|property tax/, 'exp-housing'],
  [/electric|water|\bgas\b|lpg|internet|broadband|recharge|mobile|dth|utilit|phone bill/, 'exp-utilities'],
  [/travel|trip|holiday|vacation|flight|hotel/, 'exp-travel'],
  [/transport|fuel|petrol|diesel|cab|taxi|metro|bus|auto|vehicle|parking/, 'exp-transport'],
  [/educat|school|college|tuition|course|book/, 'exp-education'],
  [/health|medic|hospital|doctor|pharma|clinic|dental/, 'exp-health'],
  [/apparel|cloth|shopping|electronic|gadget/, 'exp-shopping'],
  [/maid|driver|household help|servant/, 'exp-help'],
  [/social|entertain|movie|culture|subscri|ott|netflix|outing/, 'exp-entertainment'],
  [/gift|festival|ceremony|wedding|function/, 'exp-gifts'],
  [/insurance|\blic\b|policy|premium/, 'exp-insurance'],
  [/tax/, 'exp-taxes'],
  [/donat|charity|temple/, 'exp-donations'],
  [/beauty|personal|salon|grooming/, 'exp-personal'],
  [/parent|family support/, 'exp-family'],
  [/bank charge|fee|penalty/, 'exp-bank'],
  [/^other|misc/, 'exp-other'],
];

/** Money put aside rather than spent. */
const SAVINGS = /saving|chit|\bssy\b|sukanya|\bppf\b|\bsip\b|mutual|\bfd\b|\brd\b|deposit|invest|\bnps\b|gold/;

export function suggestTarget(source: Pick<SourceCategory, 'kind' | 'name'>, categories: Pick<Category, 'id' | 'name' | 'kind'>[]): Target {
  const name = source.name.toLowerCase();
  if (!name) return { type: 'category', id: source.kind === 'income' ? 'inc-other' : 'exp-other' };
  // A category with the same name already in the app.
  const same = categories.find((c) => c.kind === source.kind && c.name.toLowerCase() === name);
  if (same) return { type: 'category', id: same.id };
  if (source.kind === 'expense' && SAVINGS.test(name)) return { type: 'transfer' };
  const rules = source.kind === 'income' ? INCOME_RULES : EXPENSE_RULES;
  const hit = rules.find(([re]) => re.test(name));
  if (hit && categories.some((c) => c.id === hit[1])) return { type: 'category', id: hit[1] };
  return { type: 'new', name: source.name };
}

export function sourceCategories(records: ImportRecord[]): SourceCategory[] {
  const map = new Map<string, SourceCategory>();
  for (const r of records) {
    if (r.kind === 'transfer') continue;
    const key = `${r.kind}:${r.category}`;
    const entry = map.get(key) ?? { kind: r.kind, name: r.category, count: 0, total: 0 };
    entry.count++;
    entry.total += r.amount;
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => (a.kind === b.kind ? b.total - a.total : a.kind === 'income' ? -1 : 1));
}

export function guessAccountKind(name: string): AccountKind {
  const n = name.toLowerCase();
  if (/card|credit|\bcc\b|visa|master|amex|rupay/.test(n)) return 'card';
  if (/cash|wallet ?cash|pocket/.test(n)) return 'cash';
  if (/upi|paytm|phonepe|gpay|google pay|wallet|amazon pay/.test(n)) return 'wallet';
  return 'bank';
}

/** Expense rows that are really a credit-card bill paid from the bank ("CC bill", "Credit card bill"). */
export const CARD_BILL = /\b(cc|credit ?card)\s*(bill|payment|due)\b/i;
