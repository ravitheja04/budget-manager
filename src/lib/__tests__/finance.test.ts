/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addMonths, financialYear, monthRange, nextDayOfMonth, nextOccurrenceAfter, occurrence } from '../dates';
import { emiFor, emisLeft, fdValue, interestLeft, prepaymentEffect, rdMaturity, schedule, splitEmi } from '../finance';
import { formatMoney, formatMoneyShort, parseMoney, parseRate } from '../money';

test('money shows in rupees with Indian grouping', () => {
  assert.equal(formatMoney(0), '₹0');
  assert.equal(formatMoney(95000), '₹950');
  assert.equal(formatMoney(12550), '₹125.50');
  assert.equal(formatMoney(12500000), '₹1,25,000');
  assert.equal(formatMoney(1234567800), '₹1,23,45,678');
  assert.equal(formatMoney(-50000), '−₹500');
  assert.equal(formatMoney(50000, { sign: true }), '+₹500');
  assert.equal(formatMoneyShort(12500000), '₹1.25 L');
  assert.equal(formatMoneyShort(2400000000), '₹2.4 Cr');
  assert.equal(formatMoneyShort(1250000), '₹12.5K');
});

test('typed amounts are read in rupees, lakhs and crores', () => {
  assert.equal(parseMoney('450'), 45000);
  assert.equal(parseMoney('₹ 1,25,000'), 12500000);
  assert.equal(parseMoney('450.5'), 45050);
  assert.equal(parseMoney('1.5L'), 15000000);
  assert.equal(parseMoney('2 cr'), 2000000000);
  assert.equal(parseMoney('12k'), 1200000);
  assert.equal(parseMoney('Rs.99'), 9900);
  assert.equal(parseMoney(''), null);
  assert.equal(parseMoney('abc'), null);
  assert.equal(parseMoney('1.2.3'), null);
  assert.equal(parseRate('8.5%'), 8.5);
  assert.equal(parseRate(''), null);
});

test('month arithmetic keeps month-end dates sensible', () => {
  assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
  assert.equal(addMonths('2028-01-31', 1), '2028-02-29');
  assert.equal(addMonths('2026-11-15', 3), '2027-02-15');
  // Counted from the start, so a 31st schedule returns to the 31st after February.
  assert.equal(occurrence('2026-01-31', 'monthly', 2), '2026-03-31');
  assert.equal(nextOccurrenceAfter('2026-01-31', 'monthly', '2026-02-28'), '2026-03-31');
  assert.equal(nextOccurrenceAfter('2026-01-10', 'quarterly', '2026-10-10'), '2027-01-10');
  assert.equal(nextOccurrenceAfter('2026-12-01', 'yearly', '2026-10-10'), '2026-12-01');
  assert.equal(nextOccurrenceAfter('2026-10-01', 'weekly', '2026-10-10'), '2026-10-15');
  assert.equal(nextDayOfMonth(5, '2026-10-10'), '2026-11-05');
  assert.equal(nextDayOfMonth(31, '2026-11-10'), '2026-11-30');
  assert.equal(nextDayOfMonth(10, '2026-10-10'), '2026-10-10');
  assert.deepEqual(monthRange('2026-02-14'), { start: '2026-02-01', end: '2026-02-28' });
  assert.equal(financialYear('2026-03-31'), '2025-26');
  assert.equal(financialYear('2026-04-01'), '2026-27');
});

test('EMI matches bank calculators', () => {
  assert.equal(emiFor(1_000_000_00, 8.5, 240), 8678_00); // ₹10 L, 8.5%, 20 years
  assert.equal(emiFor(5_000_000_00, 9, 240), 44986_00); // ₹50 L, 9%, 20 years
  assert.equal(emiFor(120000_00, 0, 12), 10000_00);
});

test('each EMI splits into interest and principal on the reducing balance', () => {
  const s = splitEmi(1_000_000_00, 8.5, 8678_00);
  assert.equal(s.interest, 7083_33);
  assert.equal(s.principal, 8678_00 - 7083_33);
  // The last EMI only takes what's left.
  assert.deepEqual(splitEmi(5000_00, 12, 8000_00), { interest: 50_00, principal: 5000_00, amount: 5050_00 });
});

test('the schedule clears the loan in the expected number of months', () => {
  // The bank's EMI is rounded to the rupee, so a few rupees can be left for one small last EMI.
  const rows = schedule(1_000_000_00, 8.5, 8679_00);
  assert.equal(rows.length, 240);
  assert.equal(rows[rows.length - 1].balance, 0);
  assert.ok(rows[rows.length - 1].amount <= 8679_00);
  assert.equal(emisLeft(1_000_000_00, 8.5, 8679_00), 240);
  assert.equal(schedule(1_000_000_00, 8.5, 8678_00).length, emisLeft(1_000_000_00, 8.5, 8678_00));
  assert.equal(emisLeft(100000_00, 12, 500_00), Infinity); // EMI smaller than the interest
  assert.ok(interestLeft(1_000_000_00, 8.5, 8678_00) > 1_000_000_00);
});

test('a prepayment saves interest and months', () => {
  const effect = prepaymentEffect(1_000_000_00, 8.5, 8678_00, 100_000_00);
  assert.ok(effect.tenure.monthsSaved > 45 && effect.tenure.monthsSaved < 60, String(effect.tenure.monthsSaved));
  assert.ok(effect.tenure.interestSaved > effect.emi.interestSaved);
  assert.ok(effect.emi.newEmi < 8678_00);
});

test('deposits grow with quarterly compounding', () => {
  // ₹1 L at 7% for a year, compounded quarterly: ₹1,07,186.
  assert.ok(Math.abs(fdValue(100000_00, 7, '2026-01-01', '2027-01-01') - 107186_00) < 100_00);
  assert.equal(fdValue(100000_00, 7, '2026-01-01', '2027-01-01', true), 100000_00);
  // ₹1,000 a month for 12 months at 7%: about ₹12,460.
  const rd = rdMaturity(1000_00, 7, 12);
  assert.ok(rd > 12400_00 && rd < 12500_00, String(rd));
});
