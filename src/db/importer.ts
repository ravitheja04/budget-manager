import type { SQLiteDatabase } from 'expo-sqlite';

import { CARD_BILL, type Target } from '@/lib/import/mapping';
import type { RecurringCandidate } from '@/lib/import/recurring';
import type { ImportRecord } from '@/lib/import/sheet';
import type { AccountKind, Category } from '@/lib/types';
import { listAccounts, listCategories } from './queries';
import { notifyChange, save } from './repo';
import { newId, nowIso, PALETTE } from './util';

export type AccountChoice = { name: string; existingId: string | null; kind: AccountKind };

export type ImportPlan = {
  records: ImportRecord[];
  /** Keyed by `${kind}:${category name}` as in sourceCategories(). */
  targets: Map<string, Target>;
  accounts: AccountChoice[];
  /** Log "CC bill" expenses paid from the bank as a transfer to this card account (by name). */
  cardBillAccount: string | null;
};

export type ImportResult = {
  added: number;
  duplicates: number;
  /** Entries deleted on this phone after an earlier import; left deleted. */
  previouslyDeleted: number;
  accountIds: Map<string, string>;
  /** Resolved destination per source category, for setting up recurring entries. */
  resolved: Map<string, { categoryId: string | null; transfer: boolean }>;
};

const lower = (s: string) => s.trim().toLowerCase();

/**
 * Adds the imported entries in one go. Each row's id comes from its content,
 * so importing the same file again only adds what is new.
 */
export async function applyImport(db: SQLiteDatabase, plan: ImportPlan): Promise<ImportResult> {
  const now = nowIso();
  const accountIds = new Map<string, string>();
  const resolved = new Map<string, { categoryId: string | null; transfer: boolean }>();
  let added = 0;
  let duplicates = 0;
  let previouslyDeleted = 0;

  await db.withTransactionAsync(async () => {
    // Accounts: use the chosen existing one, or create it.
    for (const a of plan.accounts) {
      if (a.existingId) {
        accountIds.set(lower(a.name), a.existingId);
        continue;
      }
      const id = newId();
      await db.runAsync(
        'INSERT INTO accounts (id, name, kind, openingBalance, cardLimit, dueDay, archived, createdAt, updatedAt) VALUES (?, ?, ?, 0, NULL, NULL, 0, ?, ?)',
        id,
        a.name,
        a.kind,
        now,
        now
      );
      accountIds.set(lower(a.name), id);
    }

    // Categories: create the new ones once each (or reuse one with the same name).
    const existing: Category[] = await listCategories(db);
    let sort = existing.reduce((m, c) => Math.max(m, c.sort), 0) + 1;
    for (const [key, target] of plan.targets) {
      if (target.type === 'transfer') {
        resolved.set(key, { categoryId: null, transfer: true });
      } else if (target.type === 'category') {
        resolved.set(key, { categoryId: target.id, transfer: false });
      } else {
        const kind = key.startsWith('income:') ? 'income' : 'expense';
        const same = existing.find((c) => c.kind === kind && lower(c.name) === lower(target.name));
        if (same) {
          resolved.set(key, { categoryId: same.id, transfer: false });
          continue;
        }
        const id = newId();
        const color = PALETTE[sort % PALETTE.length];
        await db.runAsync('INSERT INTO categories (id, name, kind, icon, color, sort, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)', id, target.name, kind, 'pricetag', color, sort++, now);
        existing.push({ id, name: target.name, kind, icon: 'pricetag', color, sort, updatedAt: now });
        resolved.set(key, { categoryId: id, transfer: false });
      }
    }

    const deleted = new Set(
      (await db.getAllAsync<{ id: string }>("SELECT id FROM deleted WHERE tableName = 'transactions' AND id LIKE 'imp-%'")).map((r) => r.id)
    );
    const cardId = plan.cardBillAccount ? (accountIds.get(lower(plan.cardBillAccount)) ?? null) : null;
    const statement = await db.prepareAsync(
      `INSERT OR IGNORE INTO transactions (id, kind, amount, date, bookDate, accountId, toAccountId, categoryId, memberId, payee, notes, sourceType, sourceId, createdAt, updatedAt)
       VALUES ($id, $kind, $amount, $date, $date, $accountId, $toAccountId, $categoryId, NULL, $payee, $notes, NULL, NULL, $createdAt, $updatedAt)`
    );
    try {
      for (const r of plan.records) {
        if (deleted.has(r.key)) {
          previouslyDeleted++;
          continue;
        }
        const accountId = accountIds.get(lower(r.account)) ?? null;
        let kind = r.kind;
        let toAccountId: string | null = r.toAccount ? (accountIds.get(lower(r.toAccount)) ?? null) : null;
        let categoryId: string | null = null;
        if (r.kind !== 'transfer') {
          const target = resolved.get(`${r.kind}:${r.category}`);
          if (target?.transfer) kind = 'transfer';
          else categoryId = target?.categoryId ?? (r.kind === 'income' ? 'inc-other' : 'exp-other');
          if (cardId && r.kind === 'expense' && accountId !== cardId && CARD_BILL.test(r.note)) {
            kind = 'transfer';
            categoryId = null;
            toAccountId = cardId;
          }
        }
        const result = await statement.executeAsync({
          $id: r.key,
          $kind: kind,
          $amount: r.amount,
          $date: r.date,
          $accountId: accountId,
          $toAccountId: kind === 'transfer' ? toAccountId : null,
          $categoryId: categoryId,
          $payee: r.note,
          $notes: r.description,
          $createdAt: now,
          $updatedAt: now,
        });
        if (result.changes > 0) added++;
        else duplicates++;
      }
    } finally {
      await statement.finalizeAsync();
    }
  });

  notifyChange();
  return { added, duplicates, previouslyDeleted, accountIds, resolved };
}

/** Matches imported account names to accounts already in the app (same name, ignoring case). */
export async function matchAccounts(db: SQLiteDatabase, names: string[], guess: (name: string) => AccountKind): Promise<AccountChoice[]> {
  const accounts = await listAccounts(db, true);
  return names.map((name) => {
    const same = accounts.find((a) => lower(a.name) === lower(name));
    return { name, existingId: same?.id ?? null, kind: same?.kind ?? guess(name) };
  });
}

/** Sets up the chosen regulars as monthly recurring entries that wait to be confirmed, with a reminder the day before. */
export async function createRecurringFromImport(db: SQLiteDatabase, picks: RecurringCandidate[], result: ImportResult) {
  const titles = new Set((await db.getAllAsync<{ title: string }>('SELECT title FROM recurring')).map((r) => lower(r.title)));
  let created = 0;
  for (const c of picks) {
    if (titles.has(lower(c.title))) continue;
    const target = c.kind === 'transfer' ? { categoryId: null, transfer: true } : result.resolved.get(`${c.kind}:${c.category}`);
    const transfer = c.kind === 'transfer' || !!target?.transfer;
    await save(
      db,
      'recurring',
      {
        title: c.title,
        kind: transfer ? 'transfer' : c.kind,
        amount: c.amount,
        accountId: result.accountIds.get(lower(c.account)) ?? null,
        toAccountId: c.toAccount ? (result.accountIds.get(lower(c.toAccount)) ?? null) : null,
        categoryId: transfer ? null : (target?.categoryId ?? null),
        memberId: null,
        frequency: 'monthly',
        startDate: c.nextDate,
        nextDate: c.nextDate,
        autoLog: 0,
        reminderDays: 1,
        active: 1,
      },
      { silent: true }
    );
    created++;
  }
  notifyChange();
  return created;
}
