import * as Crypto from 'expo-crypto';
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import { DATA_TABLES, notifyChange } from '@/db/repo';
import { concatBytes, fromBase64, toBase64, utf8Decode, utf8Encode } from './bytes';
import { todayIso } from './format';

/**
 * Backup: every table (not this phone's settings) as JSON, encrypted with
 * AES-256-GCM under a key made from the family's password. The file can be
 * shared anywhere (Drive, WhatsApp, email); without the password it is noise.
 * Restoring merges: a row is taken from the file only if it is newer.
 */

const FORMAT = 'budget-logger-backup';
const ROUNDS = 20000;

type BackupFile = { format: string; version: 1; createdAt: string; salt: string; rounds: number; data: string };
type Payload = { tables: Record<string, Record<string, SQLiteBindValue>[]>; deleted: { tableName: string; id: string; deletedAt: string }[] };

/** Stretches the password with many rounds of SHA-256 so guessing it is slow. */
async function deriveKey(password: string, salt: Uint8Array, rounds: number) {
  const pw = utf8Encode(password);
  let h = new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, concatBytes(salt, pw)));
  for (let i = 1; i < rounds; i++) {
    h = new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, concatBytes(h, salt, pw)));
  }
  return Crypto.AESEncryptionKey.import(h);
}

export async function exportBackup(db: SQLiteDatabase, password: string) {
  const tables: Payload['tables'] = {};
  for (const table of DATA_TABLES) tables[table] = await db.getAllAsync(`SELECT * FROM ${table}`);
  const deleted = await db.getAllAsync<Payload['deleted'][number]>('SELECT * FROM deleted');
  const payload: Payload = { tables, deleted };

  const salt = Crypto.getRandomBytes(16);
  const key = await deriveKey(password, salt, ROUNDS);
  const sealed = await Crypto.aesEncryptAsync(utf8Encode(JSON.stringify(payload)), key);
  const combined = await sealed.combined('bytes');
  const file: BackupFile = { format: FORMAT, version: 1, createdAt: new Date().toISOString(), salt: toBase64(salt), rounds: ROUNDS, data: toBase64(combined) };

  const out = new File(Paths.cache, `budget-logger-backup-${todayIso()}.blbackup`);
  if (out.exists) out.delete();
  out.create();
  out.write(JSON.stringify(file));
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(out.uri, { mimeType: 'application/octet-stream', dialogTitle: 'Save the backup' });
  }
  return out.uri;
}

/** Lets the user choose a backup file. Returns its text, or null if they cancelled. */
export async function pickBackupFile() {
  const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  return new File(result.assets[0].uri).text();
}

export class WrongPasswordError extends Error {}

export async function restoreBackup(db: SQLiteDatabase, text: string, password: string) {
  let file: BackupFile;
  try {
    file = JSON.parse(text);
  } catch {
    throw new Error('This is not a Budget Logger backup file.');
  }
  if (file?.format !== FORMAT) throw new Error('This is not a Budget Logger backup file.');

  const key = await deriveKey(password, fromBase64(file.salt), file.rounds);
  let payload: Payload;
  try {
    const sealed = Crypto.AESSealedData.fromCombined(fromBase64(file.data));
    const plain = await Crypto.aesDecryptAsync(sealed, key, { output: 'bytes' });
    payload = JSON.parse(utf8Decode(plain));
  } catch {
    throw new WrongPasswordError('Wrong password, or the file is damaged.');
  }

  const counts = { added: 0, updated: 0, removed: 0 };
  await db.withTransactionAsync(async () => {
    const tx = db;
    for (const table of DATA_TABLES) {
      const rows = payload.tables[table] ?? [];
      if (table === 'policy_members') continue;
      for (const row of rows) {
        const keys = Object.keys(row);
        const existing = await tx.getFirstAsync<{ stamp: string | null }>(
          `SELECT ${table === 'attachments' ? 'createdAt' : 'updatedAt'} AS stamp FROM ${table} WHERE id = ?`,
          row.id as string
        );
        const incoming = String((table === 'attachments' ? row.createdAt : row.updatedAt) ?? '');
        if (existing && (existing.stamp ?? '') >= incoming) continue;
        await tx.runAsync(
          `INSERT OR REPLACE INTO ${table} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
          keys.map((k) => row[k])
        );
        if (existing) counts.updated++;
        else counts.added++;
      }
    }
    // Insured members go with their policy: take the file's list for policies the file had newer.
    const policies = new Set((payload.tables.policies ?? []).map((p) => p.id as string));
    const byPolicy = new Map<string, string[]>();
    for (const pm of payload.tables.policy_members ?? []) {
      const list = byPolicy.get(pm.policyId as string) ?? [];
      list.push(pm.memberId as string);
      byPolicy.set(pm.policyId as string, list);
    }
    for (const policyId of policies) {
      const local = await tx.getFirstAsync<{ updatedAt: string }>('SELECT updatedAt FROM policies WHERE id = ?', policyId);
      const fromFile = (payload.tables.policies ?? []).find((p) => p.id === policyId);
      if (!local || local.updatedAt !== fromFile?.updatedAt) continue;
      await tx.runAsync('DELETE FROM policy_members WHERE policyId = ?', policyId);
      for (const m of byPolicy.get(policyId) ?? []) await tx.runAsync('INSERT OR IGNORE INTO policy_members (policyId, memberId) VALUES (?, ?)', policyId, m);
    }
    // Deletions made on the other phone.
    for (const d of payload.deleted ?? []) {
      if (!(DATA_TABLES as readonly string[]).includes(d.tableName) || d.tableName === 'policy_members') continue;
      const stampCol = d.tableName === 'attachments' ? 'createdAt' : 'updatedAt';
      const row = await tx.getFirstAsync<{ stamp: string }>(`SELECT ${stampCol} AS stamp FROM ${d.tableName} WHERE id = ?`, d.id);
      if (row && row.stamp <= d.deletedAt) {
        await tx.runAsync(`DELETE FROM ${d.tableName} WHERE id = ?`, d.id);
        counts.removed++;
      }
      await tx.runAsync('INSERT OR REPLACE INTO deleted (tableName, id, deletedAt) VALUES (?, ?, ?)', d.tableName, d.id, d.deletedAt);
    }
  });
  notifyChange();
  return counts;
}
