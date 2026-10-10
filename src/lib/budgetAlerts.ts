import type { SQLiteDatabase } from 'expo-sqlite';

import { listBudgets } from '@/db/queries';
import { t } from '@/i18n';
import { crossedThreshold } from './budget';
import { monthKey } from './dates';
import { formatMoney } from './money';
import { notifyNow } from './reminders';
import { getSetting, setSetting } from './settings';

/**
 * After an expense is saved: if it took a budget past 80% or 100% this month,
 * say so once (per budget, per threshold, per month). Returns the messages so
 * the screen can show them too.
 */
export async function checkBudgetAlerts(db: SQLiteDatabase, date: string, categoryId: string | null, before: Map<string, number>) {
  const budgets = await listBudgets(db, date);
  const messages: string[] = [];
  for (const b of budgets) {
    if (!b.alerts) continue;
    if (b.categoryId && b.categoryId !== categoryId) continue;
    const key = b.categoryId ?? '';
    const crossed = crossedThreshold(before.get(key) ?? 0, b.spent, b.amount);
    if (!crossed) continue;
    const flag = `budgetAlert.${b.id}.${monthKey(date)}`;
    const already = Number((await getSetting(db, flag)) ?? 0);
    if (already >= crossed) continue;
    await setSetting(db, flag, String(crossed));
    const name = b.categoryId ? t(b.categoryName ?? '') : t('Overall budget');
    const msg =
      crossed === 100
        ? t('{name}: budget used up ({spent} of {budget})', { name, spent: formatMoney(b.spent), budget: formatMoney(b.amount) })
        : t('{name}: 80% of the budget used ({spent} of {budget})', { name, spent: formatMoney(b.spent), budget: formatMoney(b.amount) });
    messages.push(msg);
    await notifyNow(db, t('Budget alert'), msg);
  }
  return messages;
}
