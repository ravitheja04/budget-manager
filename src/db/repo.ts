import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import { bookDateFor } from '@/lib/cards';
import { newId, nowIso } from './util';

/** Tables that are shared in backups (and, later, family sync). */
export const DATA_TABLES = [
  'members',
  'accounts',
  'categories',
  'transactions',
  'recurring',
  'budgets',
  'holdings',
  'loans',
  'loan_payments',
  'policies',
  'policy_members',
  'attachments',
] as const;
export type DataTable = (typeof DATA_TABLES)[number];

type Row = Record<string, SQLiteBindValue | undefined>;

const listeners = new Set<() => void>();

/** Called after any change, so reminders can be rescheduled. */
export function onDataChange(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function notifyChange() {
  listeners.forEach((l) => l());
}

/**
 * Inserts or replaces a row. A missing id makes a new row; createdAt and
 * updatedAt are filled in. Returns the id.
 */
export async function save(db: SQLiteDatabase, table: DataTable, row: Row, opts: { silent?: boolean } = {}) {
  const now = nowIso();
  const full: Row = { ...row, id: row.id || newId(), updatedAt: now };
  if (table !== 'categories' && table !== 'attachments' && !full.createdAt) {
    const existing = await db.getFirstAsync<{ createdAt: string }>(`SELECT createdAt FROM ${table} WHERE id = ?`, full.id as string);
    full.createdAt = existing?.createdAt ?? now;
  }
  if (table === 'transactions' && full.bookDate === undefined) {
    full.bookDate = await bookDateOf(db, full.date as string, (full.accountId as string | null) ?? null);
  }
  if (table === 'attachments') {
    delete full.updatedAt;
    full.createdAt = full.createdAt ?? now;
  }
  const keys = Object.keys(full).filter((k) => full[k] !== undefined);
  await db.runAsync(
    `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
    keys.map((k) => full[k] as SQLiteBindValue)
  );
  if (!opts.silent) notifyChange();
  return full.id as string;
}

/** Deletes rows and remembers the deletion, so a restore on another phone removes them too. */
export async function remove(db: SQLiteDatabase, table: DataTable, ids: string | string[], opts: { silent?: boolean } = {}) {
  const list = Array.isArray(ids) ? ids : [ids];
  if (!list.length) return;
  const now = nowIso();
  for (const id of list) {
    await db.runAsync(`DELETE FROM ${table} WHERE id = ?`, id);
    await db.runAsync('INSERT OR REPLACE INTO deleted (tableName, id, deletedAt) VALUES (?, ?, ?)', table, id, now);
  }
  if (!opts.silent) notifyChange();
}

export async function getById<T>(db: SQLiteDatabase, table: DataTable, id: string) {
  return db.getFirstAsync<T>(`SELECT * FROM ${table} WHERE id = ?`, id);
}

/** The date an entry on this account counts on (see bookDateFor): the bill month for cards set up that way. */
export async function bookDateOf(db: SQLiteDatabase, date: string, accountId: string | null) {
  if (!accountId) return date;
  const card = await db.getFirstAsync<{ statementDay: number | null; dueDay: number | null; billMonth: number }>(
    "SELECT statementDay, dueDay, billMonth FROM accounts WHERE id = ? AND kind = 'card'",
    accountId
  );
  return bookDateFor(date, card);
}
