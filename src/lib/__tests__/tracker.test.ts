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
  payYears: null,
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
    payYears: null,
    agentName: '',
    agentPhone: '',
    helpline: '',
    details: '{}',
    accountId: null,
    notes: '',
    active: 1,
    ...stamp,
  };
  const card: Account = { id: 'c1', name: 'HDFC card', kind: 'card', openingBalance: 0, cardLimit: null, dueDay: 15, statementDay: null, billMonth: 0, archived: 0, ...stamp };
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

test('stats periods: weeks start on Monday, financial years in April', async () => {
  const { periodFor, periodLabel, shiftPeriod, topWithOther } = await import('../period');
  assert.deepEqual(periodFor('week', '2026-10-10'), { mode: 'week', from: '2026-10-05', to: '2026-10-11' }); // Sat -> Mon..Sun
  assert.deepEqual(periodFor('week', '2026-10-05').from, '2026-10-05');
  assert.deepEqual(periodFor('month', '2026-02-14'), { mode: 'month', from: '2026-02-01', to: '2026-02-28' });
  assert.deepEqual(periodFor('fy', '2026-03-31'), { mode: 'fy', from: '2025-04-01', to: '2026-03-31' });
  assert.deepEqual(periodFor('fy', '2026-04-01'), { mode: 'fy', from: '2026-04-01', to: '2027-03-31' });
  assert.deepEqual(shiftPeriod(periodFor('month', '2026-01-31'), -1), { mode: 'month', from: '2025-12-01', to: '2025-12-31' });
  assert.deepEqual(shiftPeriod(periodFor('year', '2026-06-01'), 1).from, '2027-01-01');
  assert.deepEqual(shiftPeriod({ mode: 'custom', from: '2026-10-01', to: '2026-10-10' }, 1), { mode: 'custom', from: '2026-10-11', to: '2026-10-20' });
  assert.equal(periodLabel(periodFor('month', '2026-10-10')), 'October 2026');
  assert.equal(periodLabel(periodFor('fy', '2026-10-10')), 'FY 2026-27');
  assert.equal(periodLabel(periodFor('week', '2026-10-10')), '5 Oct – 11 Oct 2026');
  assert.equal(periodLabel({ mode: 'custom', from: '2016-10-01', to: '2026-10-31' }), '1 Oct 2016 – 31 Oct 2026');

  const entries = [9, 8, 7, 6, 5, 4, 3, 2, 0].map((v, i) => ({ key: `c${i}`, value: v, item: i }));
  const slices = topWithOther(entries, 6);
  assert.deepEqual(slices.map((s) => s.key), ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'other']);
  assert.equal(slices[6].value, 5);
  // Seven slices fit without folding one into "Other".
  assert.equal(topWithOther(entries.slice(0, 7), 6).length, 7);
});

test('credit-card cycles: statement on the 18th, due on the 6th', async () => {
  const { bookDateFor, cardCycle, dueFor, lastStatementOn, statementFor } = await import('../cards');
  assert.equal(statementFor('2026-10-10', 18), '2026-10-18');
  assert.equal(statementFor('2026-10-18', 18), '2026-10-18'); // spends on the 18th are on that bill
  assert.equal(statementFor('2026-10-19', 18), '2026-11-18');
  assert.equal(dueFor('2026-10-18', 6), '2026-11-06');
  assert.equal(dueFor('2026-12-18', 6), '2027-01-06');
  // A due day after the statement day falls in the same month.
  assert.equal(dueFor('2026-10-05', 25), '2026-10-25');
  assert.equal(lastStatementOn('2026-10-25', 18), '2026-10-18');
  assert.equal(lastStatementOn('2026-10-18', 18), '2026-10-18');
  assert.equal(lastStatementOn('2026-10-10', 18), '2026-09-18');
  assert.equal(lastStatementOn('2026-03-10', 31), '2026-02-28');

  // Bill month: spent 19 Sep–18 Oct -> paid 6 Nov -> counts in November.
  const card = { statementDay: 18, dueDay: 6, billMonth: 1 };
  assert.equal(bookDateFor('2026-09-25', card), '2026-11-01');
  assert.equal(bookDateFor('2026-10-18', card), '2026-11-01');
  assert.equal(bookDateFor('2026-10-19', card), '2026-12-01');
  assert.equal(bookDateFor('2026-09-25', { ...card, billMonth: 0 }), '2026-09-25');
  assert.equal(bookDateFor('2026-09-25', null), '2026-09-25');

  // ₹40,000 owed at the 18 Oct statement, ₹12,000 spent after it.
  const txns = [
    { kind: 'expense' as const, amount: 40000_00, date: '2026-10-02', accountId: 'c', toAccountId: null },
    { kind: 'expense' as const, amount: 12000_00, date: '2026-10-22', accountId: 'c', toAccountId: null },
    { kind: 'expense' as const, amount: 999_00, date: '2026-10-22', accountId: 'bank', toAccountId: null },
  ];
  const before = cardCycle('c', 0, txns, 18, 6, '2026-10-25');
  assert.deepEqual([before.billed, before.unbilled, before.outstanding, before.billedDue, before.nextStatement], [40000_00, 12000_00, 52000_00, '2026-11-06', '2026-11-18']);
  // Paying the bill on 2 Nov clears what's due; the October spends wait for the next bill.
  const paid = cardCycle('c', 0, [...txns, { kind: 'transfer', amount: 40000_00, date: '2026-11-02', accountId: 'bank', toAccountId: 'c' }], 18, 6, '2026-11-03');
  assert.deepEqual([paid.billed, paid.unbilled], [0, 12000_00]);
  // A part payment leaves the rest of the bill due.
  const part = cardCycle('c', 0, [...txns, { kind: 'transfer', amount: 10000_00, date: '2026-11-02', accountId: 'bank', toAccountId: 'c' }], 18, 6, '2026-11-03');
  assert.equal(part.billed, 30000_00);
});

test('a card with a billing cycle reminds about the billed amount only', async () => {
  const { collectDues } = await import('../dues');
  const card: Account = { id: 'c1', name: 'HDFC card', kind: 'card', openingBalance: 0, cardLimit: null, dueDay: 6, statementDay: 18, billMonth: 1, archived: 0, ...stamp };
  const base = { recurring: [], loans: [], policies: [], holdings: [] };
  const due = collectDues({ ...base, cards: [{ account: card, outstanding: 52000_00, billed: 40000_00, billedDue: '2026-11-06' }] }, '2026-11-01', 7);
  assert.deepEqual(due.map((d) => [d.kind, d.date, d.amount]), [['card', '2026-11-06', 40000_00]]);
  // Bill paid: nothing due even though later spends are still outstanding.
  assert.equal(collectDues({ ...base, cards: [{ account: card, outstanding: 12000_00, billed: 0, billedDue: '2026-11-06' }] }, '2026-11-01', 7).length, 0);
});

test('premium and deposit terms: paid so far, left to pay, cover left', async () => {
  const { lastPaymentDate, maturityFrom, nextPaymentWithinTerm, scheduleProgress } = await import('../terms');
  // Term policy: yearly ₹24,000 for 10 years from Mar 2020, cover till Mar 2055; next premium Mar 2027.
  const term = scheduleProgress({ start: '2020-03-15', frequency: 'yearly', next: '2027-03-15', payYears: 10, amount: 24000_00, end: '2055-03-15' }, '2026-10-10');
  assert.deepEqual(
    [term.paidCount, term.totalCount, term.leftCount, term.paidAmount, term.leftAmount, term.yearsLeftToPay, term.lastPayment, term.finished],
    [7, 10, 3, 168000_00, 72000_00, 3, '2029-03-15', false]
  );
  assert.equal(term.coverYearsLeft, 28.4);
  assert.equal(term.coverYearsTotal, 35);
  // Monthly LIC premium: counts months.
  const lic = scheduleProgress({ start: '2024-01-05', frequency: 'monthly', next: '2026-11-05', payYears: 12, amount: 5000_00, end: '2044-01-05' }, '2026-10-10');
  assert.deepEqual([lic.paidCount, lic.totalCount, lic.yearsPaid, lic.yearsLeftToPay], [34, 144, 2.8, 9.2]);
  // Sukanya Samriddhi: yearly deposits for 15 years, matures at 21.
  const ssy = scheduleProgress({ start: '2021-04-10', frequency: 'yearly', next: '2027-04-10', payYears: 15, amount: 150000_00, end: maturityFrom('2021-04-10', 21) }, '2026-10-10');
  assert.deepEqual([ssy.paidCount, ssy.leftCount, ssy.lastPayment, ssy.coverYearsTotal], [6, 9, '2035-04-10', 21]);
  // Paying term over: no next date.
  const done = scheduleProgress({ start: '2010-01-01', frequency: 'yearly', next: null, payYears: 10, amount: 1000_00, end: '2040-01-01' }, '2026-10-10');
  assert.deepEqual([done.paidCount, done.leftCount, done.finished], [10, 0, true]);
  // Single premium.
  const single = scheduleProgress({ start: '2025-06-01', frequency: 'single', next: null, payYears: null, amount: 50000_00, end: '2040-06-01' }, '2026-10-10');
  assert.deepEqual([single.paidCount, single.totalCount, single.leftCount, single.finished], [1, 1, 0, true]);
  // Term unknown: count what's been paid, nothing about what's left.
  const open = scheduleProgress({ start: '2024-04-01', frequency: 'yearly', next: '2027-04-01', payYears: null, amount: 1000_00, end: null }, '2026-10-10');
  assert.deepEqual([open.paidCount, open.totalCount, open.leftCount], [3, null, null]);

  assert.equal(lastPaymentDate('2020-03-15', 'yearly', 10), '2029-03-15');
  const step = (d: string) => `${Number(d.slice(0, 4)) + 1}${d.slice(4)}`;
  assert.equal(nextPaymentWithinTerm('2028-03-15', '2020-03-15', 'yearly', 10, step), '2029-03-15');
  assert.equal(nextPaymentWithinTerm('2029-03-15', '2020-03-15', 'yearly', 10, step), null); // that was the last one
  assert.equal(nextPaymentWithinTerm('2029-03-15', '2020-03-15', 'yearly', null, step), '2030-03-15'); // no term: keep going
});
