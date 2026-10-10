import type { SQLiteDatabase } from 'expo-sqlite';

import { DEFAULT_CATEGORIES } from './seed';
import { newId, nowIso } from './util';

/**
 * The database layout. Column names match the field names in lib/types.ts so
 * rows come back ready to use. Every shared row carries `updatedAt` for backup
 * merging and, later, family sync. Each entry in MIGRATIONS runs once, in order.
 */
const MIGRATIONS: string[] = [
  `
  CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);

  CREATE TABLE IF NOT EXISTS members (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    relation TEXT NOT NULL DEFAULT '',
    color TEXT NOT NULL,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    openingBalance INTEGER NOT NULL DEFAULT 0,
    cardLimit INTEGER,
    dueDay INTEGER,
    archived INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    icon TEXT NOT NULL,
    color TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    updatedAt TEXT NOT NULL DEFAULT ''
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL,
    date TEXT NOT NULL,
    accountId TEXT,
    toAccountId TEXT,
    categoryId TEXT,
    memberId TEXT,
    payee TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    sourceType TEXT,
    sourceId TEXT,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS transactions_date ON transactions (date);
  CREATE INDEX IF NOT EXISTS transactions_source ON transactions (sourceType, sourceId);

  CREATE TABLE IF NOT EXISTS recurring (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount INTEGER NOT NULL,
    accountId TEXT,
    toAccountId TEXT,
    categoryId TEXT,
    memberId TEXT,
    frequency TEXT NOT NULL,
    startDate TEXT NOT NULL,
    nextDate TEXT NOT NULL,
    autoLog INTEGER NOT NULL DEFAULT 0,
    reminderDays INTEGER NOT NULL DEFAULT 1,
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS budgets (
    id TEXT PRIMARY KEY NOT NULL,
    categoryId TEXT,
    amount INTEGER NOT NULL,
    alerts INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS holdings (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL,
    institution TEXT NOT NULL DEFAULT '',
    memberId TEXT,
    nominee TEXT NOT NULL DEFAULT '',
    invested INTEGER NOT NULL DEFAULT 0,
    currentValue INTEGER,
    rate REAL,
    startDate TEXT,
    maturityDate TEXT,
    payout INTEGER NOT NULL DEFAULT 0,
    contribution INTEGER,
    contributionFrequency TEXT,
    nextContributionDate TEXT,
    accountId TEXT,
    notes TEXT NOT NULL DEFAULT '',
    closed INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loans (
    id TEXT PRIMARY KEY NOT NULL,
    direction TEXT NOT NULL,
    type TEXT NOT NULL,
    party TEXT NOT NULL,
    accountNumber TEXT NOT NULL DEFAULT '',
    principal INTEGER NOT NULL,
    rate REAL NOT NULL DEFAULT 0,
    tenureMonths INTEGER,
    startDate TEXT NOT NULL,
    emi INTEGER,
    dueDate TEXT,
    accountId TEXT,
    memberId TEXT,
    notes TEXT NOT NULL DEFAULT '',
    closed INTEGER NOT NULL DEFAULT 0,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS loan_payments (
    id TEXT PRIMARY KEY NOT NULL,
    loanId TEXT NOT NULL,
    kind TEXT NOT NULL,
    date TEXT NOT NULL,
    amount INTEGER NOT NULL,
    principal INTEGER NOT NULL,
    interest INTEGER NOT NULL,
    transactionId TEXT,
    emiCount INTEGER,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS loan_payments_loan ON loan_payments (loanId, date);

  CREATE TABLE IF NOT EXISTS policies (
    id TEXT PRIMARY KEY NOT NULL,
    kind TEXT NOT NULL,
    insurer TEXT NOT NULL,
    planName TEXT NOT NULL DEFAULT '',
    policyNumber TEXT NOT NULL DEFAULT '',
    holderId TEXT,
    nominees TEXT NOT NULL DEFAULT '',
    sumAssured INTEGER NOT NULL DEFAULT 0,
    premium INTEGER NOT NULL DEFAULT 0,
    frequency TEXT NOT NULL,
    nextDue TEXT,
    graceDays INTEGER NOT NULL DEFAULT 0,
    startDate TEXT,
    endDate TEXT,
    agentName TEXT NOT NULL DEFAULT '',
    agentPhone TEXT NOT NULL DEFAULT '',
    helpline TEXT NOT NULL DEFAULT '',
    details TEXT NOT NULL DEFAULT '{}',
    accountId TEXT,
    notes TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    createdAt TEXT NOT NULL,
    updatedAt TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS policy_members (
    policyId TEXT NOT NULL,
    memberId TEXT NOT NULL,
    PRIMARY KEY (policyId, memberId)
  );

  CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY NOT NULL,
    ownerType TEXT NOT NULL,
    ownerId TEXT NOT NULL,
    name TEXT NOT NULL,
    uri TEXT NOT NULL,
    mime TEXT NOT NULL DEFAULT '',
    createdAt TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS attachments_owner ON attachments (ownerType, ownerId);

  CREATE TABLE IF NOT EXISTS deleted (
    tableName TEXT NOT NULL,
    id TEXT NOT NULL,
    deletedAt TEXT NOT NULL,
    PRIMARY KEY (tableName, id)
  );
  `,
  // 2: credit-card billing cycles. bookDate is the date an entry counts on in
  // budgets and Stats (the bill month for cards set up that way).
  `
  ALTER TABLE accounts ADD COLUMN statementDay INTEGER;
  ALTER TABLE accounts ADD COLUMN billMonth INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE transactions ADD COLUMN bookDate TEXT;
  UPDATE transactions SET bookDate = date WHERE bookDate IS NULL;
  CREATE INDEX IF NOT EXISTS transactions_book_date ON transactions (bookDate);
  `,
  // 3: how many years premiums / deposits are paid for (the cover or maturity can run longer).
  `
  ALTER TABLE policies ADD COLUMN payYears INTEGER;
  ALTER TABLE holdings ADD COLUMN payYears INTEGER;
  `,
];

export async function migrate(db: SQLiteDatabase) {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = OFF;');
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = row?.user_version ?? 0;
  while (version < MIGRATIONS.length) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[version]);
      if (version === 0) await seed(db);
    });
    version++;
    await db.execAsync(`PRAGMA user_version = ${version}`);
  }
}

/** First run: the standard categories and a cash account so quick add works straight away. */
async function seed(db: SQLiteDatabase) {
  const now = nowIso();
  let sort = 0;
  for (const c of DEFAULT_CATEGORIES) {
    await db.runAsync(
      'INSERT OR IGNORE INTO categories (id, name, kind, icon, color, sort, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
      c.id,
      c.name,
      c.kind,
      c.icon,
      c.color,
      sort++,
      now
    );
  }
  await db.runAsync(
    "INSERT INTO accounts (id, name, kind, openingBalance, archived, createdAt, updatedAt) VALUES (?, 'Cash', 'cash', 0, 0, ?, ?)",
    newId(),
    now,
    now
  );
}
