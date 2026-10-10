/**
 * A small reader for .xlsx files: unzips the workbook and returns the first
 * sheet as rows of cell values. Numbers stay numbers (dates arrive as Excel
 * serial numbers); everything else is text. Old binary .xls files are not
 * supported; Excel or Google Sheets can save them as .xlsx.
 */

import { strFromU8, unzipSync } from 'fflate';

export type Cell = string | number | null;

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

function decodeXml(text: string) {
  return text.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e: string) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

/** All the text inside <t> elements of a fragment (shared strings can be split into rich-text runs). */
function textOf(fragment: string) {
  let out = '';
  for (const m of fragment.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)) out += m[1];
  return decodeXml(out);
}

/** "AB12" -> 27 (zero-based column index). */
function columnIndex(ref: string) {
  let n = 0;
  for (const ch of ref) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

export function isXlsx(bytes: Uint8Array) {
  // Zip files start with "PK\3\4".
  return bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 3 && bytes[3] === 4;
}

export function isOldXls(bytes: Uint8Array) {
  // OLE2 compound document signature used by .xls.
  return bytes.length > 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
}

export function readXlsx(bytes: Uint8Array): Cell[][] {
  const files = unzipSync(bytes, { filter: (f) => (f.name.startsWith('xl/') && f.name.endsWith('.xml')) || f.name.endsWith('.rels') });
  const read = (path: string) => (files[path] ? strFromU8(files[path]) : null);

  // The first sheet in the workbook, found through its relationship id.
  let sheetPath = 'xl/worksheets/sheet1.xml';
  const workbook = read('xl/workbook.xml');
  const rels = read('xl/_rels/workbook.xml.rels');
  const firstSheet = workbook ? /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook) : null;
  if (firstSheet && rels) {
    const rel = new RegExp(`<Relationship\\b[^>]*\\bId="${firstSheet[1]}"[^>]*>`).exec(rels)?.[0];
    const target = rel ? /\bTarget="([^"]+)"/.exec(rel)?.[1] : null;
    if (target) sheetPath = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
  }
  const sheet = read(sheetPath);
  if (!sheet) throw new Error('This spreadsheet has no sheets to read.');

  const shared: string[] = [];
  const sst = read('xl/sharedStrings.xml');
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textOf(m[1]));

  const rows: Cell[][] = [];
  for (const rowMatch of sheet.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
    const rowNumber = Number(/\br="(\d+)"/.exec(rowMatch[1])?.[1] ?? rows.length + 1);
    const row: Cell[] = [];
    let next = 0;
    for (const c of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const body = c[2] ?? '';
      const ref = /\br="([A-Z]+)\d+"/.exec(attrs)?.[1];
      const col = ref ? columnIndex(ref) : next;
      next = col + 1;
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? 'n';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value: Cell = null;
      if (type === 's') value = v !== undefined ? (shared[Number(v)] ?? '') : null;
      else if (type === 'inlineStr') value = textOf(body);
      else if (type === 'str' || type === 'e') value = v !== undefined ? decodeXml(v) : null;
      else if (type === 'b') value = v === '1' ? 'TRUE' : 'FALSE';
      else if (v !== undefined && v !== '') value = Number(v);
      row[col] = value;
    }
    for (let i = 0; i < row.length; i++) if (row[i] === undefined) row[i] = null;
    rows[rowNumber - 1] = row;
  }
  for (let i = 0; i < rows.length; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** Comma, semicolon or tab separated text, with "quoted, values". */
export function readCsv(text: string): Cell[][] {
  const clean = text.replace(/^﻿/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = [',', ';', '\t'].map((d) => ({ d, n: firstLine.split(d).length })).sort((a, b) => b.n - a.n)[0].d;
  const rows: Cell[][] = [];
  let row: Cell[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.map((r) => r.map((v) => (v === '' ? null : v)));
}
