/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { budgetProgress, crossedThreshold } from '../budget';
import { collectDues } from '../dues';
import { emiFor } from '../finance';
import { holdingValue, maturityValue } from '../holdings';
import { loanStatus, openingRecord } from '../loans';
import type { Account, Holding, Loan, LoanPayment, Policy, Recurring } from '../types';

const stamp = { createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' };

const homeLoan: Loan = {
  id: 'l1',
  direction: 'borrowed',
  type: 'home',
  party: 'SBI Home Loan',
  accountNumber: '',
  principal: 1_000_000_00,
  rate: 8.5,
  tenureMonths: 240,
  startDate: '2026-01-05',
  emi: emiFor(1_000_000_00, 8.5, 240),
  dueDate: null,
  accountId: null,
  memberId: null,
  notes: '',
  closed: 0,
  ...stamp,
};

function payment(p: Partial<LoanPayment>): LoanPayment {
  return { id: 'p', loanId: 'l1', kind: 'emi', date: '2026-01-05', amount: 0, principal: 0, interest: 0, transactionId: null, emiCount: null, ...stamp, ...p };
}

test('a new loan starts with the full principal and the first EMI on the start date', () => {
  const s = loanStatus(homeLoan, []);
  assert.equal(s.outstanding, 1_000_000_00);
  assert.equal(s.nextEmiDate, '2026-01-05');
  // The EMI is rounded down to the rupee, leaving one small last EMI.
  assert.equal(s.emisLeft, 241);
  assert.equal(s.closureDate, '2046-01-05');
  assert.equal(s.nextEmi?.interest, 7083_33);
});

test('paid EMIs reduce the outstanding principal and move the next date on', () => {
  const first = loanStatus(homeLoan, []).nextEmi!;
  const s = loanStatus(homeLoan, [payment({ ...first, date: '2026-01-05' })]);
  assert.equal(s.outstanding, 1_000_000_00 - first.principal);
  assert.equal(s.nextEmiDate, '2026-02-05');
  assert.equal(s.emisPaid, 1);
  assert.equal(s.interestPaid, first.interest);
});

test('a loan added part-way through counts the EMIs already paid', () => {
  const rec = openingRecord(homeLoan, '2026-10-10')!;
  assert.equal(rec.emiCount, 10); // Jan–Oct 5th are all before 10 Oct
  assert.equal(rec.date, '2026-10-05');
  const s = loanStatus(homeLoan, [payment({ kind: 'opening', ...rec })]);
  assert.equal(s.emisPaid, 10);
  assert.equal(s.nextEmiDate, '2026-11-05');
  assert.equal(s.emisLeft, 231);
  assert.equal(openingRecord(homeLoan, '2026-01-05'), null);
});

test('lent money is outstanding until repaid', () => {
  const lent: Loan = { ...homeLoan, direction: 'lent', emi: null, principal: 50000_00, dueDate: '2026-10-20' };
  const s = loanStatus(lent, [payment({ kind: 'repayment', amount: 20000_00, principal: 20000_00 })]);
  assert.equal(s.outstanding, 30000_00);
  assert.equal(s.nextEmiDate, null);
});

test('budgets show pace and warn at 80% and 100%', () => {
  const p = budgetProgress(6200_00, 10000_00, '2026-10-13');
  assert.equal(p.level, 'ok');
  assert.equal(p.daysLeft, 18);
  assert.equal(p.remaining, 3800_00);
  assert.equal(budgetProgress(8000_00, 10000_00, '2026-10-13').level, 'warn');
  assert.equal(budgetProgress(10000_00, 10000_00, '2026-10-13').level, 'over');
  assert.equal(crossedThreshold(7000_00, 8100_00, 10000_00), 80);
  assert.equal(crossedThreshold(7000_00, 12000_00, 10000_00), 100);
  assert.equal(crossedThreshold(8500_00, 9000_00, 10000_00), null);
});

const baseHolding: Holding = {
  id: 'h1',
  type: 'fd',
  name: 'HDFC FD',
  institution: 'HDFC',
  memberId: null,
  nominee: '',
  invested: 100000_00,
  currentValue: null,
  rate: 7,
  startDate: '2026-01-01',
  maturityDate: '2027-01-01',
  payout: 0,
  contribution: null,
  contributionFrequency: null,
  nextContributionDate: null,
  accountId: null,
  notes: '',
  closed: 0,
  ...stamp,
};

test('holdings are valued from what was typed, or worked out for deposits', () => {
  assert.ok(holdingValue(baseHolding, '2026-07-01') > 100000_00);
  assert.ok(holdingValue(baseHolding, '2026-07-01') < maturityValue(baseHolding)!);
  // After maturity the value stops growing.
  assert.equal(holdingValue(baseHolding, '2030-01-01'), maturityValue(baseHolding));
  assert.equal(holdingValue({ ...baseHolding, type: 'mf', currentValue: 123_00 }, '2026-07-01'), 123_00);
  assert.equal(holdingValue({ ...baseHolding, closed: 1 }, '2026-07-01'), 0);
});

test('dues gather everything coming up, oldest first, with overdue marked', () => {
  const recurring: Recurring = {
    id: 'r1',
    title: 'Rent',
    kind: 'expense',
    amount: 25000_00,
    accountId: null,
    toAccountId: null,
    categoryId: null,
    memberId: null,
    frequency: 'monthly',
    startDate: '2026-01-01',
    nextDate: '2026-10-01',
    autoLog: 0,
    reminderDays: 1,
    active: 1,
    ...stamp,
  };
  const policy: Policy = {
    id: 'pol',
    kind: 'health',
    insurer: 'Star Health',
    planName: 'Family Optima',
    policyNumber: '',
    holderId: null,
    nominees: '',
    sumAssured: 0,
    premium: 24000_00,
    frequency: 'yearly',
    nextDue: '2026-10-08',
    graceDays: 30,
    startDate: null,
    endDate: null,
    agentName: '',
    agentPhone: '',
    helpline: '',
    details: '{}',
    accountId: null,
    notes: '',
    active: 1,
    ...stamp,
  };
  const card: Account = { id: 'c1', name: 'HDFC card', kind: 'card', openingBalance: 0, cardLimit: null, dueDay: 15, archived: 0, ...stamp };
  const items = collectDues(
    {
      recurring: [recurring, { ...recurring, id: 'r2', autoLog: 1 }],
      loans: [{ loan: homeLoan, nextEmiDate: '2026-11-05', nextEmiAmount: 8678_00, outstanding: 1 }],
      policies: [policy],
      holdings: [{ ...baseHolding, maturityDate: '2026-11-01' }],
      cards: [
        { account: card, outstanding: 5000_00 },
        { account: { ...card, id: 'c2' }, outstanding: 0 },
      ],
    },
    '2026-10-10',
    7
  );
  assert.deepEqual(
    items.map((i) => i.kind),
    ['recurring', 'premium', 'card', 'maturity']
  );
  assert.equal(items[0].overdue, true);
  assert.equal(items[1].inGrace, true);
  assert.equal(items[2].date, '2026-10-15');
});

test('backup bytes round-trip through UTF-8 and base64', async () => {
  const { fromBase64, toBase64, utf8Decode, utf8Encode } = await import('../bytes');
  const text = 'Rent ₹25,000 · అద్దె 🏠';
  assert.deepEqual(utf8Encode(text), new Uint8Array(Buffer.from(text, 'utf8')));
  assert.equal(utf8Decode(utf8Encode(text)), text);
  for (const n of [0, 1, 2, 3, 4, 5, 31]) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
    assert.equal(toBase64(bytes), Buffer.from(bytes).toString('base64'));
    assert.deepEqual(fromBase64(toBase64(bytes)), bytes);
  }
});
