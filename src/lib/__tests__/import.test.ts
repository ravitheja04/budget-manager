/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { strToU8, zipSync } from 'fflate';

import { DEFAULT_CATEGORIES } from '../../db/seed';
import { CARD_BILL, guessAccountKind, sourceCategories, suggestTarget } from '../import/mapping';
import { findRecurring } from '../import/recurring';
import { cleanLabel, parseDate, parseSheet } from '../import/sheet';
import { isOldXls, isXlsx, readCsv, readXlsx, type Cell } from '../import/xlsx';

/** Builds a minimal .xlsx with text in shared strings and numbers inline, like Excel writes it. */
function makeXlsx(rows: Cell[][]) {
  const shared: string[] = [];
  const col = (i: number) => String.fromCharCode(65 + i);
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const body = rows
    .map((row, r) => {
      const cells = row
        .map((v, c) => {
          const ref = `${col(c)}${r + 1}`;
          if (v === null) return '';
          if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
          shared.push(v);
          return `<c r="${ref}" t="s"><v>${shared.length - 1}</v></c>`;
        })
        .join('');
      return `<row r="${r + 1}">${cells}</row>`;
    })
    .join('');
  return zipSync({
    '[Content_Types].xml': strToU8('<Types/>'),
    'xl/workbook.xml': strToU8('<workbook><sheets><sheet name="Money Manager" sheetId="1" r:id="rId1"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<Relationships><Relationship Id="rId1" Type="worksheet" Target="worksheets/sheet1.xml"/></Relationships>'),
    'xl/sharedStrings.xml': strToU8(`<sst>${shared.map((s) => `<si><t>${esc(s)}</t></si>`).join('')}</sst>`),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${body}</sheetData></worksheet>`),
  });
}

// Excel serial numbers: 46296 = 1 Oct 2026; the fraction is the time of day.
const MM_HEADER = ['Date', 'Account', 'Category', 'Subcategory', 'Note', 'INR', 'Income/Expense', 'Description', 'Amount', 'Currency', 'Account'];
const mmRow = (serial: number, account: string, category: string, note: string, amount: number, type: string): Cell[] => [serial, account, category, null, note, amount, type, null, String(amount), 'INR', amount];

test('an .xlsx export from Money Manager is read row by row', () => {
  const bytes = makeXlsx([
    MM_HEADER,
    mmRow(46299.0617, 'Card', '🧘🏼 Health', 'Clinic & lab', 31500, 'Expense'),
    mmRow(46296, 'Accounts', '💰 Salary', 'Salary 1', 170300, 'Income'),
    mmRow(46296, 'Accounts', '⚡️Savings', 'Chit 1', 45000, 'Expense'),
    mmRow(46296.5, 'Accounts', 'Card', 'Pay card', 9000, 'Transfer-Out'),
    mmRow(46296.5, 'Card', 'Accounts', 'Pay card', 9000, 'Transfer-In'),
  ]);
  assert.ok(isXlsx(bytes));
  const rows = readXlsx(bytes);
  assert.equal(rows[1][2], '🧘🏼 Health');
  assert.equal(rows[1][4], 'Clinic & lab');

  const { records, skipped, columns } = parseSheet(rows);
  assert.equal(skipped.length, 0);
  assert.equal(columns.amount, 'INR');
  assert.equal(columns.account, 'Account');
  assert.equal(records.length, 4); // the Transfer-In half is dropped
  assert.deepEqual(
    { date: records[0].date, kind: records[0].kind, amount: records[0].amount, account: records[0].account, category: records[0].category, note: records[0].note },
    { date: '2026-10-04', kind: 'expense', amount: 3150000, account: 'Card', category: 'Health', note: 'Clinic & lab' }
  );
  assert.equal(records[1].kind, 'income');
  assert.deepEqual([records[3].kind, records[3].account, records[3].toAccount], ['transfer', 'Accounts', 'Card']);
});

test('re-reading the same file gives the same keys, so duplicates are skipped', () => {
  const rows: Cell[][] = [MM_HEADER, mmRow(46296, 'Card', 'Food', 'Tea', 50, 'Expense'), mmRow(46296, 'Card', 'Food', 'Tea', 50, 'Expense')];
  const a = parseSheet(rows).records.map((r) => r.key);
  const b = parseSheet(readXlsx(makeXlsx(rows))).records.map((r) => r.key);
  assert.deepEqual(a, b);
  // Two identical rows stay two entries.
  assert.equal(new Set(a).size, 2);
});

test('a bank statement CSV with Debit and Credit columns', () => {
  const csv = 'Txn Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance\n05/10/2026,"UPI-SWIGGY, BLR",450.00,,10000\n01/10/2026,SALARY OCT,,"1,25,000.00",10450\n';
  const { records } = parseSheet(readCsv(csv));
  assert.equal(records.length, 2);
  assert.deepEqual([records[0].date, records[0].kind, records[0].amount, records[0].note], ['2026-10-05', 'expense', 45000, 'UPI-SWIGGY, BLR']);
  assert.deepEqual([records[1].kind, records[1].amount], ['income', 12500000]);
});

test('dates in the usual spreadsheet formats', () => {
  assert.equal(parseDate(46296), '2026-10-01');
  assert.equal(parseDate('2026-10-05 01:28:58'), '2026-10-05');
  assert.equal(parseDate('05/10/2026'), '2026-10-05');
  assert.equal(parseDate('5-Oct-26'), '2026-10-05');
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('hello'), null);
  assert.equal(cleanLabel('🍜 Food'), 'Food');
  assert.equal(cleanLabel('⚡️Savings'), 'Savings');
});

test('categories are matched to the app’s, savings become transfers, the rest are kept', () => {
  const cats = DEFAULT_CATEGORIES;
  assert.deepEqual(suggestTarget({ kind: 'income', name: 'Salary' }, cats), { type: 'category', id: 'inc-salary' });
  assert.deepEqual(suggestTarget({ kind: 'expense', name: 'Rent' }, cats), { type: 'category', id: 'exp-housing' });
  assert.deepEqual(suggestTarget({ kind: 'expense', name: 'LIC' }, cats), { type: 'category', id: 'exp-insurance' });
  assert.deepEqual(suggestTarget({ kind: 'expense', name: 'Electricity bill' }, cats), { type: 'category', id: 'exp-utilities' });
  assert.deepEqual(suggestTarget({ kind: 'expense', name: 'Savings' }, cats), { type: 'transfer' });
  assert.deepEqual(suggestTarget({ kind: 'expense', name: 'SSY' }, cats), { type: 'transfer' });
  assert.deepEqual(suggestTarget({ kind: 'expense', name: 'Car loan' }, cats), { type: 'new', name: 'Car loan' });
  assert.deepEqual(suggestTarget({ kind: 'expense', name: 'Food & groceries' }, cats), { type: 'category', id: 'exp-food' });
  assert.equal(guessAccountKind('Card'), 'card');
  assert.equal(guessAccountKind('Accounts'), 'bank');
  assert.equal(guessAccountKind('Cash'), 'cash');
  assert.ok(CARD_BILL.test('CC bill'));
  assert.ok(CARD_BILL.test('Credit card bill'));
  assert.ok(!CARD_BILL.test('Credit card dmart'));

  const sources = sourceCategories(parseSheet([MM_HEADER, mmRow(46296, 'A', 'Food', 'x', 10, 'Expense'), mmRow(46297, 'A', 'Food', 'y', 20, 'Expense'), mmRow(46296, 'A', 'Salary', 's', 99, 'Income')]).records);
  assert.deepEqual(
    sources.map((s) => [s.kind, s.name, s.count, s.total]),
    [
      ['income', 'Salary', 1, 9900],
      ['expense', 'Food', 2, 3000],
    ]
  );
});

test('monthly regulars are found for recurring entries', () => {
  const row = (date: string, note: string, amount: number, kind: 'income' | 'expense' = 'expense') => ({ date, note, amount, kind, account: 'Accounts', toAccount: null, category: 'X' });
  const records = [
    ...['2026-08-01', '2026-09-01', '2026-10-01'].map((d) => row(d, 'Rent', 2205000)),
    ...['2026-08-01', '2026-09-02', '2026-10-01'].map((d) => row(d, 'Salary 1', 17030000, 'income')),
    // Missing in September: not regular.
    row('2026-08-07', 'Claude', 199900),
    row('2026-10-07', 'Claude', 199900),
    // Changing amounts: not the same regular.
    row('2026-08-03', 'Fuel', 100000),
    row('2026-09-03', 'Fuel', 120000),
    row('2026-10-03', 'Fuel', 90000),
  ];
  const found = findRecurring(records, '2026-10-10');
  assert.deepEqual(
    found.map((c) => [c.title, c.kind, c.day, c.nextDate]),
    [
      ['Salary 1', 'income', 1, '2026-11-01'],
      ['Rent', 'expense', 1, '2026-11-01'],
    ]
  );
  // Today is the usual day: offered for today.
  assert.equal(findRecurring(records, '2026-11-01')[0].nextDate, '2026-11-01');
  // Data that stopped long ago is not "current".
  assert.deepEqual(findRecurring(records, '2027-06-01'), []);
});

test('old binary .xls files are recognised so the user can be told to re-save them', () => {
  assert.ok(isOldXls(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0])));
  assert.ok(!isXlsx(Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1])));
});
