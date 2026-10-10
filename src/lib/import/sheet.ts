/**
 * Turns spreadsheet rows into entries. Works out which column is which from
 * the header row, so it reads Money Manager exports (Date, Account, Category,
 * Note, INR, Income/Expense…) as well as simple sheets and bank statements
 * with separate Debit/Credit columns. Pure: no database, no phone APIs.
 */

import { indianToIso, isValidDate } from '../format';
import type { TxnKind } from '../types';
import type { Cell } from './xlsx';

export type ImportRecord = {
  /** Stable across re-imports of the same file, so duplicates are skipped. */
  key: string;
  date: string;
  kind: TxnKind;
  amount: number;
  account: string;
  /** Transfers only: where the money went. */
  toAccount: string | null;
  category: string;
  note: string;
  description: string;
};

export type ParsedSheet = {
  records: ImportRecord[];
  /** Rows that looked like entries but couldn't be read (bad date or amount), by spreadsheet row number. */
  skipped: { row: number; reason: string }[];
  columns: Partial<Record<Column, string>>;
};

type Column = 'date' | 'account' | 'category' | 'subcategory' | 'note' | 'description' | 'amount' | 'type' | 'debit' | 'credit';

const HEADERS: Record<Column, RegExp> = {
  date: /^(date|txn date|transaction date|value date|posting date|date time|period)$/,
  account: /^(account|accounts|from account|bank|wallet|mode|payment mode)$/,
  category: /^(category|categories|head|expense head)$/,
  subcategory: /^(subcategory|sub category|sub-category)$/,
  note: /^(note|notes|payee|merchant|particulars|narration|remarks|item|title|details)$/,
  description: /^(description|memo|comment|comments)$/,
  amount: /^(amount|inr|rs|rs\.|₹|amount \(inr\)|amount \(rs\)|value)$/,
  type: /^(income\/expense|type|transaction type|txn type|kind|income or expense|cr\/dr|dr\/cr)$/,
  debit: /^(debit|withdrawal|withdrawals|withdrawal amt\.?|debit amount|dr|paid out|spent|expense)$/,
  credit: /^(credit|deposit|deposits|deposit amt\.?|credit amount|cr|paid in|received|income)$/,
};

const norm = (v: Cell) => String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

function toNumber(v: Cell): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v === null) return null;
  const text = String(v).replace(/[₹,\s]/g, '').replace(/^rs\.?/i, '');
  if (!text) return null;
  // (1,234.00) and 1234.00- are negative in some bank statements.
  const negative = /^\(.*\)$/.test(text) || text.endsWith('-');
  const n = Number(text.replace(/[()]/g, '').replace(/-$/, ''));
  return Number.isFinite(n) ? (negative ? -n : n) : null;
}

/** Excel serial day numbers count from 30 Dec 1899; the fraction is the time of day. */
function serialToIso(serial: number) {
  const ms = Math.round((Math.floor(serial) - 25569) * 86400000);
  return new Date(ms).toISOString().slice(0, 10);
}

export function parseDate(v: Cell): string | null {
  if (v === null) return null;
  if (typeof v === 'number') return v > 20000 && v < 80000 ? serialToIso(v) : null;
  const text = String(v).trim();
  // 2026-10-05, 2026-10-05 01:28:58, 2026/10/05
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(text);
  if (m) {
    const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
    return isValidDate(iso) ? iso : null;
  }
  // 05/10/2026 (day first, as in India), with or without a time after it.
  m = /^(\d{1,2}[-/.]\d{1,2}[-/.]\d{4})/.exec(text);
  if (m) return indianToIso(m[1]);
  // 05/10/26
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/.exec(text);
  if (m) return indianToIso(`${m[1]}/${m[2]}/20${m[3]}`);
  // 5 Oct 2026, 05-Oct-26
  m = /^(\d{1,2})[\s-]([a-z]{3})[a-z]*[\s-,]+(\d{2,4})/i.exec(text);
  if (m) {
    const month = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(m[2].toLowerCase()) + 1;
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${year}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return month && isValidDate(iso) ? iso : null;
  }
  return null;
}

/** Strips emoji and decoration from a category or account name: "🍜 Food" -> "Food". */
export function cleanLabel(v: Cell) {
  return String(v ?? '')
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Modifier}‍️⃣]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** A short, stable hash (cyrb53) used to recognise rows imported before. */
function hash(text: string) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/** Finds the header row (within the first 15) and which column holds what. */
function findColumns(rows: Cell[][]) {
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const header = rows[r].map(norm);
    const found: Partial<Record<Column, number>> = {};
    for (const col of Object.keys(HEADERS) as Column[]) {
      const candidates = header.map((h, i) => (HEADERS[col].test(h) ? i : -1)).filter((i) => i >= 0);
      if (!candidates.length) continue;
      // Money Manager has two "Account" columns (the second holds amounts) and
      // both "INR" and "Amount": prefer the column whose values look right.
      const sample = rows.slice(r + 1, r + 30);
      const numeric = (i: number) => sample.filter((row) => toNumber(row[i] ?? null) !== null).length;
      const filled = (i: number) => sample.filter((row) => row[i] !== null && row[i] !== undefined && row[i] !== '').length;
      if (col === 'account' || col === 'category' || col === 'note') {
        found[col] = candidates.find((i) => numeric(i) < filled(i) / 2) ?? candidates[0];
      } else if (col === 'amount' || col === 'debit' || col === 'credit') {
        found[col] = candidates.slice().sort((a, b) => numeric(b) - numeric(a))[0];
      } else {
        found[col] = candidates[0];
      }
    }
    const hasAmount = found.amount !== undefined || found.debit !== undefined || found.credit !== undefined;
    if (found.date !== undefined && hasAmount) return { headerRow: r, found, header: rows[r] };
  }
  return null;
}

function kindFrom(typeText: string): TxnKind | 'transfer-in' | null {
  const t = typeText.toLowerCase();
  if (!t) return null;
  if (/transfer.?in|^in$/.test(t)) return 'transfer-in';
  if (/transfer/.test(t)) return 'transfer';
  if (/^(income|inc\.?|credit|cr|received|deposit)/.test(t)) return 'income';
  if (/^(expense|exp\.?|debit|dr|spent|paid|withdrawal)/.test(t)) return 'expense';
  return null;
}

export function parseSheet(rows: Cell[][]): ParsedSheet {
  const cols = findColumns(rows);
  if (!cols) throw new Error('Couldn’t find a header row with a date and an amount column. The first row should have column names like Date, Category, Note and Amount.');
  const { headerRow, found, header } = cols;
  const get = (row: Cell[], col: Column) => (found[col] === undefined ? null : (row[found[col]!] ?? null));

  const typed = rows.slice(headerRow + 1).map((row) => kindFrom(norm(get(row, 'type'))));
  const hasTransferOut = typed.includes('transfer');

  const records: ImportRecord[] = [];
  const skipped: ParsedSheet['skipped'] = [];
  const seen = new Map<string, number>();

  rows.slice(headerRow + 1).forEach((row, i) => {
    const rowNumber = headerRow + i + 2;
    if (!row.some((v) => v !== null && v !== '')) return;
    const date = parseDate(get(row, 'date'));
    let kind = typed[i];
    let amount = toNumber(get(row, 'amount'));
    if (found.debit !== undefined || found.credit !== undefined) {
      const debit = toNumber(get(row, 'debit'));
      const credit = toNumber(get(row, 'credit'));
      if (debit) {
        amount = Math.abs(debit);
        kind = kind ?? 'expense';
      } else if (credit) {
        amount = Math.abs(credit);
        kind = kind ?? 'income';
      }
    }
    if (!date) {
      skipped.push({ row: rowNumber, reason: 'date not recognised' });
      return;
    }
    if (amount === null || amount === 0) {
      skipped.push({ row: rowNumber, reason: 'no amount' });
      return;
    }
    if (!kind) kind = amount < 0 ? 'expense' : 'income';
    // Money Manager writes each transfer twice (out of one account, into the other); keep one.
    if (kind === 'transfer-in' && hasTransferOut) return;

    const account = cleanLabel(get(row, 'account')) || 'Imported';
    const rawCategory = cleanLabel(get(row, 'category'));
    const sub = cleanLabel(get(row, 'subcategory'));
    const isTransfer = kind === 'transfer' || kind === 'transfer-in';
    const record: Omit<ImportRecord, 'key'> = {
      date,
      kind: kind === 'transfer-in' ? 'transfer' : kind,
      amount: Math.round(Math.abs(amount) * 100),
      // For transfers, Money Manager puts the other account in the Category column.
      account: kind === 'transfer-in' ? rawCategory || 'Imported' : account,
      toAccount: kind === 'transfer' ? rawCategory || null : kind === 'transfer-in' ? account : null,
      category: isTransfer ? '' : sub && rawCategory ? `${rawCategory} / ${sub}` : rawCategory || sub,
      note: String(get(row, 'note') ?? '').trim(),
      description: String(get(row, 'description') ?? '').trim(),
    };
    const raw = get(row, 'date');
    const base = hash([raw, record.kind, record.amount, record.account, record.toAccount, record.category, record.note].join('|'));
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    records.push({ ...record, key: `imp-${base}-${n}` });
  });

  const columns: ParsedSheet['columns'] = {};
  for (const [col, i] of Object.entries(found) as [Column, number][]) columns[col] = String(header[i] ?? '');
  return { records, skipped, columns };
}
