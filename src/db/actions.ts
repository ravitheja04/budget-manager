import type { SQLiteDatabase } from 'expo-sqlite';

import { addMonths, nextOccurrenceAfter, occurrence, type Frequency } from '@/lib/dates';
import type { Holding, Loan, LoanPayment, Policy, Recurring, Txn } from '@/lib/types';
import { loanPayments, listLoans } from './queries';
import { getById, notifyChange, remove, save } from './repo';
import { CATEGORY_IDS } from './seed';
import { newId } from './util';

type NewTxn = Omit<Txn, 'id' | 'createdAt' | 'updatedAt'> & { id?: string };

export async function saveTransaction(db: SQLiteDatabase, txn: NewTxn) {
  return save(db, 'transactions', { ...txn });
}

/** Deleting an entry the app logged for a loan also removes that payment from the loan. */
export async function deleteTransaction(db: SQLiteDatabase, txn: Txn) {
  await db.withTransactionAsync(async () => {
    if (txn.sourceType === 'loan') {
      const paymentId = txn.id.replace(/-[ip]$/, '');
      const payment = await getById<LoanPayment>(db, 'loan_payments', paymentId);
      if (payment) {
        await deleteLoanPayment(db, payment);
        return;
      }
    }
    await remove(db, 'transactions', txn.id, { silent: true });
    const atts = await db.getAllAsync<{ id: string }>("SELECT id FROM attachments WHERE ownerType = 'transaction' AND ownerId = ?", txn.id);
    await remove(
      db,
      'attachments',
      atts.map((a) => a.id),
      { silent: true }
    );
  });
  notifyChange();
}

// ---------- Recurring entries ----------

function nextRecurringDate(r: Pick<Recurring, 'startDate' | 'frequency' | 'nextDate'>) {
  return nextOccurrenceAfter(r.startDate, r.frequency as Frequency, r.nextDate);
}

/** Logs the due occurrence of a recurring entry and moves it to the next date. */
export async function payRecurring(db: SQLiteDatabase, r: Recurring, opts: { amount?: number; date?: string; accountId?: string | null } = {}) {
  await db.withTransactionAsync(async () => {
    await save(
      db,
      'transactions',
      {
        kind: r.kind,
        amount: opts.amount ?? r.amount,
        date: opts.date ?? r.nextDate,
        accountId: opts.accountId ?? r.accountId,
        toAccountId: r.kind === 'transfer' ? r.toAccountId : null,
        categoryId: r.kind === 'transfer' ? null : r.categoryId,
        memberId: r.memberId,
        payee: r.title,
        notes: '',
        sourceType: 'recurring',
        sourceId: r.id,
      },
      { silent: true }
    );
    await save(db, 'recurring', { ...r, nextDate: nextRecurringDate(r) }, { silent: true });
  });
  notifyChange();
}

export async function skipRecurring(db: SQLiteDatabase, r: Recurring) {
  await save(db, 'recurring', { ...r, nextDate: nextRecurringDate(r) });
}

/** Logs every automatic recurring entry that has come due (run at start-up). Returns how many were logged. */
export async function autoLogRecurring(db: SQLiteDatabase, today: string) {
  const due = await db.getAllAsync<Recurring>('SELECT * FROM recurring WHERE active = 1 AND autoLog = 1 AND nextDate <= ?', today);
  let count = 0;
  for (const r of due) {
    let current = r;
    // Cap the catch-up so a weekly entry left for years can't flood the list.
    for (let i = 0; i < 120 && current.nextDate <= today; i++) {
      await payRecurring(db, current);
      count++;
      current = { ...current, nextDate: nextRecurringDate(current) };
    }
  }
  return count;
}

// ---------- Loans ----------

/**
 * Logs a loan payment. For borrowed money the principal part is a transfer out
 * of the bank account (not spending) and the interest part is an expense;
 * money coming back from someone is a transfer in.
 */
export async function addLoanPayment(
  db: SQLiteDatabase,
  loan: Loan,
  p: { kind: LoanPayment['kind']; date: string; principal: number; interest: number; accountId: string | null; log: boolean }
) {
  const id = newId();
  await db.withTransactionAsync(async () => {
    let transactionId: string | null = null;
    if (p.log && p.kind !== 'opening') {
      const label = loan.party;
      if (loan.direction === 'borrowed') {
        if (p.principal > 0) {
          transactionId = await save(
            db,
            'transactions',
            { id: `${id}-p`, kind: 'transfer', amount: p.principal, date: p.date, accountId: p.accountId, toAccountId: null, categoryId: null, memberId: loan.memberId, payee: label, notes: p.kind === 'prepayment' ? 'Prepayment (principal)' : 'EMI principal', sourceType: 'loan', sourceId: loan.id },
            { silent: true }
          );
        }
        if (p.interest > 0) {
          transactionId = transactionId ?? `${id}-i`;
          await save(
            db,
            'transactions',
            { id: `${id}-i`, kind: 'expense', amount: p.interest, date: p.date, accountId: p.accountId, toAccountId: null, categoryId: CATEGORY_IDS.loanInterest, memberId: loan.memberId, payee: label, notes: 'EMI interest', sourceType: 'loan', sourceId: loan.id },
            { silent: true }
          );
        }
      } else {
        if (p.principal > 0) {
          transactionId = await save(
            db,
            'transactions',
            { id: `${id}-p`, kind: 'transfer', amount: p.principal, date: p.date, accountId: null, toAccountId: p.accountId, categoryId: null, memberId: loan.memberId, payee: label, notes: 'Money returned', sourceType: 'loan', sourceId: loan.id },
            { silent: true }
          );
        }
        if (p.interest > 0) {
          await save(
            db,
            'transactions',
            { id: `${id}-i`, kind: 'income', amount: p.interest, date: p.date, accountId: p.accountId, toAccountId: null, categoryId: CATEGORY_IDS.interestIncome, memberId: loan.memberId, payee: label, notes: 'Interest received', sourceType: 'loan', sourceId: loan.id },
            { silent: true }
          );
        }
      }
    }
    await save(
      db,
      'loan_payments',
      { id, loanId: loan.id, kind: p.kind, date: p.date, amount: p.principal + p.interest, principal: p.principal, interest: p.interest, transactionId, emiCount: null },
      { silent: true }
    );
  });
  // Close the loan when nothing is left.
  const status = (await listLoans(db)).find((l) => l.loan.id === loan.id)?.status;
  if (status && status.outstanding <= 0 && !loan.closed) await save(db, 'loans', { ...loan, closed: 1 }, { silent: true });
  notifyChange();
}

/** Marks the next EMI paid on its due date, split on the reducing balance. */
export async function payEmi(db: SQLiteDatabase, loan: Loan, nextEmiDate: string, split: { principal: number; interest: number }, accountId: string | null) {
  await addLoanPayment(db, loan, { kind: 'emi', date: nextEmiDate, principal: split.principal, interest: split.interest, accountId, log: true });
}

export async function deleteLoanPayment(db: SQLiteDatabase, payment: LoanPayment) {
  await remove(db, 'transactions', [`${payment.id}-p`, `${payment.id}-i`], { silent: true });
  await remove(db, 'loan_payments', payment.id, { silent: true });
  const loan = await getById<Loan>(db, 'loans', payment.loanId);
  if (loan?.closed) await save(db, 'loans', { ...loan, closed: 0 }, { silent: true });
  notifyChange();
}

export async function deleteLoan(db: SQLiteDatabase, loan: Loan) {
  const payments = await loanPayments(db, loan.id);
  await db.withTransactionAsync(async () => {
    for (const p of payments) await remove(db, 'transactions', [`${p.id}-p`, `${p.id}-i`], { silent: true });
    await remove(
      db,
      'loan_payments',
      payments.map((p) => p.id),
      { silent: true }
    );
    await remove(db, 'loans', loan.id, { silent: true });
  });
  notifyChange();
}

// ---------- Insurance ----------

const PREMIUM_MONTHS = { monthly: 1, quarterly: 3, halfyearly: 6, yearly: 12 } as const;

export function nextPremiumDate(p: Pick<Policy, 'frequency' | 'nextDue'>) {
  if (!p.nextDue || p.frequency === 'single') return null;
  return addMonths(p.nextDue, PREMIUM_MONTHS[p.frequency]);
}

/** Logs the premium as an expense and moves the policy to its next due date. */
export async function payPremium(db: SQLiteDatabase, p: Policy, opts: { date: string; amount: number; accountId: string | null }) {
  await db.withTransactionAsync(async () => {
    await save(
      db,
      'transactions',
      {
        kind: 'expense',
        amount: opts.amount,
        date: opts.date,
        accountId: opts.accountId,
        toAccountId: null,
        categoryId: CATEGORY_IDS.insurance,
        memberId: p.holderId,
        payee: p.insurer,
        notes: [p.planName, p.policyNumber].filter(Boolean).join(' · '),
        sourceType: 'policy',
        sourceId: p.id,
      },
      { silent: true }
    );
    await save(db, 'policies', { ...p, nextDue: nextPremiumDate(p) }, { silent: true });
  });
  notifyChange();
}

export async function skipPremium(db: SQLiteDatabase, p: Policy) {
  await save(db, 'policies', { ...p, nextDue: nextPremiumDate(p) });
}

export async function savePolicyMembers(db: SQLiteDatabase, policyId: string, memberIds: string[]) {
  await db.runAsync('DELETE FROM policy_members WHERE policyId = ?', policyId);
  for (const m of memberIds) await db.runAsync('INSERT OR IGNORE INTO policy_members (policyId, memberId) VALUES (?, ?)', policyId, m);
}

export async function deletePolicy(db: SQLiteDatabase, id: string) {
  await db.runAsync('DELETE FROM policy_members WHERE policyId = ?', id);
  await remove(db, 'policies', id);
}

// ---------- Savings and investments ----------

/** Logs a contribution (SIP, RD instalment, PPF deposit, chit) as a transfer out of the bank and adds it to the holding. */
export async function payContribution(db: SQLiteDatabase, h: Holding, opts: { date: string; amount: number; accountId: string | null }) {
  await db.withTransactionAsync(async () => {
    await save(
      db,
      'transactions',
      { kind: 'transfer', amount: opts.amount, date: opts.date, accountId: opts.accountId, toAccountId: null, categoryId: null, memberId: h.memberId, payee: h.name, notes: 'Contribution', sourceType: 'holding', sourceId: h.id },
      { silent: true }
    );
    await save(
      db,
      'holdings',
      {
        ...h,
        invested: h.invested + opts.amount,
        currentValue: h.currentValue === null ? null : h.currentValue + opts.amount,
        nextContributionDate: nextContributionDate(h),
      },
      { silent: true }
    );
  });
  notifyChange();
}

export function nextContributionDate(h: Pick<Holding, 'nextContributionDate' | 'contributionFrequency'>) {
  if (!h.nextContributionDate || !h.contributionFrequency) return null;
  return occurrence(h.nextContributionDate, h.contributionFrequency, 1);
}

export async function skipContribution(db: SQLiteDatabase, h: Holding) {
  await save(db, 'holdings', { ...h, nextContributionDate: nextContributionDate(h) });
}

// ---------- Accounts ----------

/** Records the difference between the app's balance and the bank's as an adjustment (not income or spending). */
export async function reconcile(db: SQLiteDatabase, accountId: string, appBalance: number, actual: number, date: string) {
  const diff = actual - appBalance;
  if (diff === 0) return;
  await save(db, 'transactions', {
    kind: 'transfer',
    amount: Math.abs(diff),
    date,
    accountId: diff < 0 ? accountId : null,
    toAccountId: diff > 0 ? accountId : null,
    categoryId: null,
    memberId: null,
    payee: 'Balance adjustment',
    notes: '',
    sourceType: 'adjustment',
    sourceId: accountId,
  });
}
