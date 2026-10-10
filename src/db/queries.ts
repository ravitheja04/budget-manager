import type { SQLiteDatabase } from 'expo-sqlite';

import { monthRange } from '@/lib/dates';
import { cardCycle, type CardTxn } from '@/lib/cards';
import { collectDues, type DueItem } from '@/lib/dues';
import { holdingValue } from '@/lib/holdings';
import { loanStatus, type LoanStatus } from '@/lib/loans';
import type { Account, Attachment, Budget, Category, Holding, Loan, LoanPayment, Member, Policy, Recurring, Txn } from '@/lib/types';

export type TxnRow = Txn & {
  categoryName: string | null;
  categoryIcon: string | null;
  categoryColor: string | null;
  accountName: string | null;
  toAccountName: string | null;
  memberName: string | null;
};

const TXN_SELECT = `
  SELECT t.*, c.name AS categoryName, c.icon AS categoryIcon, c.color AS categoryColor,
         a.name AS accountName, ta.name AS toAccountName, m.name AS memberName
  FROM transactions t
  LEFT JOIN categories c ON c.id = t.categoryId
  LEFT JOIN accounts a ON a.id = t.accountId
  LEFT JOIN accounts ta ON ta.id = t.toAccountId
  LEFT JOIN members m ON m.id = t.memberId`;

export type TxnFilter = {
  from?: string;
  to?: string;
  kind?: Txn['kind'] | null;
  categoryId?: string | null;
  /** Only entries with no category. */
  uncategorised?: boolean;
  accountId?: string | null;
  memberId?: string | null;
  search?: string;
  sourceType?: string;
  sourceId?: string;
  limit?: number;
};

export async function listTransactions(db: SQLiteDatabase, f: TxnFilter = {}) {
  const where: string[] = [];
  const args: (string | number)[] = [];
  const add = (clause: string, ...values: (string | number)[]) => {
    where.push(clause);
    args.push(...values);
  };
  // Periods go by the date an entry counts on (the bill month for some cards).
  if (f.from) add('COALESCE(t.bookDate, t.date) >= ?', f.from);
  if (f.to) add('COALESCE(t.bookDate, t.date) <= ?', f.to);
  if (f.kind) add('t.kind = ?', f.kind);
  if (f.categoryId) add('t.categoryId = ?', f.categoryId);
  if (f.uncategorised) add('t.categoryId IS NULL');
  if (f.accountId) add('(t.accountId = ? OR t.toAccountId = ?)', f.accountId, f.accountId);
  if (f.memberId) add('t.memberId = ?', f.memberId);
  if (f.sourceType) add('t.sourceType = ?', f.sourceType);
  if (f.sourceId) add('t.sourceId = ?', f.sourceId);
  if (f.search?.trim()) {
    const q = `%${f.search.trim()}%`;
    const digits = f.search.replace(/[^\d.]/g, '');
    const amount = digits ? Math.round(Number(digits) * 100) : -1;
    add('(t.payee LIKE ? OR t.notes LIKE ? OR c.name LIKE ? OR t.amount = ?)', q, q, q, amount);
  }
  const sql = `${TXN_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY t.date DESC, t.createdAt DESC LIMIT ${f.limit ?? 500}`;
  return db.getAllAsync<TxnRow>(sql, args);
}

export async function listMembers(db: SQLiteDatabase) {
  return db.getAllAsync<Member>('SELECT * FROM members ORDER BY createdAt');
}

export async function listCategories(db: SQLiteDatabase, kind?: Category['kind']) {
  return kind
    ? db.getAllAsync<Category>('SELECT * FROM categories WHERE kind = ? ORDER BY sort, name', kind)
    : db.getAllAsync<Category>('SELECT * FROM categories ORDER BY kind, sort, name');
}

export type AccountWithBalance = Account & { balance: number };

export async function listAccounts(db: SQLiteDatabase, includeArchived = false) {
  return db.getAllAsync<AccountWithBalance>(
    `SELECT a.*, a.openingBalance + COALESCE((
       SELECT SUM(CASE
         WHEN t.kind = 'income' AND t.accountId = a.id THEN t.amount
         WHEN t.kind = 'expense' AND t.accountId = a.id THEN -t.amount
         WHEN t.kind = 'transfer' AND t.accountId = a.id THEN -t.amount
         WHEN t.kind = 'transfer' AND t.toAccountId = a.id THEN t.amount
         ELSE 0 END)
       FROM transactions t WHERE t.accountId = a.id OR t.toAccountId = a.id), 0) AS balance
     FROM accounts a ${includeArchived ? '' : 'WHERE a.archived = 0'}
     ORDER BY CASE a.kind WHEN 'bank' THEN 0 WHEN 'cash' THEN 1 WHEN 'wallet' THEN 2 ELSE 3 END, a.name`
  );
}

export async function listRecurring(db: SQLiteDatabase) {
  return db.getAllAsync<Recurring & { categoryName: string | null; categoryIcon: string | null; categoryColor: string | null }>(
    `SELECT r.*, c.name AS categoryName, c.icon AS categoryIcon, c.color AS categoryColor
     FROM recurring r LEFT JOIN categories c ON c.id = r.categoryId
     ORDER BY r.active DESC, r.nextDate`
  );
}

export async function monthTotals(db: SQLiteDatabase, date: string) {
  const { start, end } = monthRange(date);
  const row = await db.getFirstAsync<{ income: number | null; expense: number | null }>(
    `SELECT SUM(CASE WHEN kind = 'income' THEN amount END) AS income,
            SUM(CASE WHEN kind = 'expense' THEN amount END) AS expense
     FROM transactions WHERE COALESCE(bookDate, date) BETWEEN ? AND ?`,
    start,
    end
  );
  return { income: row?.income ?? 0, expense: row?.expense ?? 0 };
}

/** Spending this month per category id ('' = all spending). */
export async function monthSpendByCategory(db: SQLiteDatabase, date: string) {
  const { start, end } = monthRange(date);
  const rows = await db.getAllAsync<{ categoryId: string | null; total: number }>(
    `SELECT categoryId, SUM(amount) AS total FROM transactions WHERE kind = 'expense' AND COALESCE(bookDate, date) BETWEEN ? AND ? GROUP BY categoryId`,
    start,
    end
  );
  const map = new Map<string, number>();
  let all = 0;
  for (const r of rows) {
    if (r.categoryId) map.set(r.categoryId, r.total);
    all += r.total;
  }
  map.set('', all);
  return map;
}

export type BudgetRow = Budget & { categoryName: string | null; categoryIcon: string | null; categoryColor: string | null; spent: number };

export async function listBudgets(db: SQLiteDatabase, date: string): Promise<BudgetRow[]> {
  const [budgets, spend] = await Promise.all([
    db.getAllAsync<Omit<BudgetRow, 'spent'>>(
      `SELECT b.*, c.name AS categoryName, c.icon AS categoryIcon, c.color AS categoryColor
       FROM budgets b LEFT JOIN categories c ON c.id = b.categoryId
       ORDER BY b.categoryId IS NOT NULL, c.sort, c.name`
    ),
    monthSpendByCategory(db, date),
  ]);
  return budgets.map((b) => ({ ...b, spent: spend.get(b.categoryId ?? '') ?? 0 }));
}

export async function listHoldings(db: SQLiteDatabase) {
  return db.getAllAsync<Holding & { memberName: string | null }>(
    'SELECT h.*, m.name AS memberName FROM holdings h LEFT JOIN members m ON m.id = h.memberId ORDER BY h.closed, h.type, h.name'
  );
}

export type LoanWithStatus = { loan: Loan; status: LoanStatus; memberName: string | null };

export async function listLoans(db: SQLiteDatabase): Promise<LoanWithStatus[]> {
  const [loans, payments] = await Promise.all([
    db.getAllAsync<Loan & { memberName: string | null }>('SELECT l.*, m.name AS memberName FROM loans l LEFT JOIN members m ON m.id = l.memberId ORDER BY l.closed, l.direction, l.createdAt'),
    db.getAllAsync<LoanPayment>('SELECT * FROM loan_payments ORDER BY date'),
  ]);
  return loans.map(({ memberName, ...loan }) => ({
    loan,
    memberName,
    status: loanStatus(
      loan,
      payments.filter((p) => p.loanId === loan.id)
    ),
  }));
}

export async function loanPayments(db: SQLiteDatabase, loanId: string) {
  return db.getAllAsync<LoanPayment>('SELECT * FROM loan_payments WHERE loanId = ? ORDER BY date DESC, createdAt DESC', loanId);
}

export type PolicyRow = Policy & { holderName: string | null; insuredNames: string | null };

export async function listPolicies(db: SQLiteDatabase) {
  return db.getAllAsync<PolicyRow>(
    `SELECT p.*, h.name AS holderName,
       (SELECT GROUP_CONCAT(m.name, ', ') FROM policy_members pm JOIN members m ON m.id = pm.memberId WHERE pm.policyId = p.id) AS insuredNames
     FROM policies p LEFT JOIN members h ON h.id = p.holderId
     ORDER BY p.active DESC, CASE p.kind WHEN 'health' THEN 0 WHEN 'term' THEN 1 ELSE 2 END, p.nextDue`
  );
}

export async function policyMemberIds(db: SQLiteDatabase, policyId: string) {
  const rows = await db.getAllAsync<{ memberId: string }>('SELECT memberId FROM policy_members WHERE policyId = ?', policyId);
  return rows.map((r) => r.memberId);
}

export async function attachmentsFor(db: SQLiteDatabase, ownerType: string, ownerId: string) {
  return db.getAllAsync<Attachment>('SELECT * FROM attachments WHERE ownerType = ? AND ownerId = ? ORDER BY createdAt', ownerType, ownerId);
}

export async function loadDues(db: SQLiteDatabase, today: string, horizonDays: number): Promise<DueItem[]> {
  const [recurring, loans, policies, holdings, accounts] = await Promise.all([
    db.getAllAsync<Recurring>('SELECT * FROM recurring WHERE active = 1'),
    listLoans(db),
    db.getAllAsync<Policy>('SELECT * FROM policies WHERE active = 1'),
    db.getAllAsync<Holding>('SELECT * FROM holdings WHERE closed = 0'),
    listAccounts(db),
  ]);
  return collectDues(
    {
      recurring,
      loans: loans.map(({ loan, status }) => ({ loan, nextEmiDate: status.nextEmiDate, nextEmiAmount: status.nextEmi?.amount ?? null, outstanding: status.outstanding })),
      policies,
      holdings,
      cards: await Promise.all(
        accounts
          .filter((a) => a.kind === 'card')
          .map(async (a) => {
            const cycle = await cardCycleFor(db, a, today);
            return { account: a, outstanding: -a.balance, billed: cycle?.billed, billedDue: cycle?.billedDue };
          })
      ),
    },
    today,
    horizonDays
  );
}

export type NetWorth = { accounts: number; holdings: number; borrowed: number; lent: number; total: number };

export async function netWorth(db: SQLiteDatabase, today: string): Promise<NetWorth> {
  const [accounts, holdings, loans] = await Promise.all([listAccounts(db), listHoldings(db), listLoans(db)]);
  const a = accounts.reduce((s, x) => s + x.balance, 0);
  const h = holdings.reduce((s, x) => s + holdingValue(x, today), 0);
  const borrowed = loans.filter((l) => l.loan.direction === 'borrowed' && !l.loan.closed).reduce((s, l) => s + l.status.outstanding, 0);
  const lent = loans.filter((l) => l.loan.direction === 'lent' && !l.loan.closed).reduce((s, l) => s + l.status.outstanding, 0);
  return { accounts: a, holdings: h, borrowed, lent, total: a + h + lent - borrowed };
}

/** The account used for the last entry, so quick add can default to it. */
export async function lastUsedAccountId(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ accountId: string }>(
    "SELECT t.accountId FROM transactions t JOIN accounts a ON a.id = t.accountId WHERE a.archived = 0 AND t.sourceType IS NULL ORDER BY t.createdAt DESC LIMIT 1"
  );
  if (row) return row.accountId;
  const first = await db.getFirstAsync<{ id: string }>("SELECT id FROM accounts WHERE archived = 0 ORDER BY CASE kind WHEN 'cash' THEN 0 ELSE 1 END LIMIT 1");
  return first?.id ?? null;
}

export type CategoryTotal = { categoryId: string | null; name: string | null; icon: string | null; color: string | null; total: number; count: number };

/** Income or spending per category between two dates, largest first. */
export async function categoryTotals(db: SQLiteDatabase, kind: 'income' | 'expense', from: string, to: string) {
  return db.getAllAsync<CategoryTotal>(
    `SELECT t.categoryId, c.name, c.icon, c.color, SUM(t.amount) AS total, COUNT(*) AS count
     FROM transactions t LEFT JOIN categories c ON c.id = t.categoryId
     WHERE t.kind = ? AND COALESCE(t.bookDate, t.date) BETWEEN ? AND ?
     GROUP BY t.categoryId ORDER BY total DESC`,
    kind,
    from,
    to
  );
}

/** Money moved out of the accounts to savings or loan principal (transfers to no tracked account), which isn't counted as spending. */
export async function movedOut(db: SQLiteDatabase, from: string, to: string) {
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT SUM(amount) AS total FROM transactions
     WHERE kind = 'transfer' AND accountId IS NOT NULL AND toAccountId IS NULL
       AND (sourceType IS NULL OR sourceType != 'adjustment') AND date BETWEEN ? AND ?`,
    from,
    to
  );
  return row?.total ?? 0;
}

export async function firstEntryDate(db: SQLiteDatabase) {
  return (await db.getFirstAsync<{ d: string | null }>('SELECT MIN(date) AS d FROM transactions'))?.d ?? null;
}

/** Billed and unbilled amounts for a card with a statement and due day; null for other accounts. */
export async function cardCycleFor(db: SQLiteDatabase, account: Account, today: string) {
  if (account.kind !== 'card' || !account.statementDay || !account.dueDay) return null;
  const txns = await db.getAllAsync<CardTxn>('SELECT kind, amount, date, accountId, toAccountId FROM transactions WHERE accountId = ? OR toAccountId = ?', account.id, account.id);
  return cardCycle(account.id, account.openingBalance, txns, account.statementDay, account.dueDay, today);
}
