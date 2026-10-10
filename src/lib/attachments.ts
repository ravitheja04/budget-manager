import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';

import { remove, save } from '@/db/repo';
import { newId } from '@/db/util';
import type { Attachment } from './types';

/** Receipts and policy documents are copied into the app's own storage so they stay if the original is deleted. */
function folder() {
  const dir = new Directory(Paths.document, 'attachments');
  if (!dir.exists) dir.create({ intermediates: true });
  return dir;
}

/** Lets the user pick a photo or PDF. Returns what to attach, or null if cancelled. Nothing is saved yet. */
export async function pickAttachment() {
  const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets?.[0]) return null;
  const asset = result.assets[0];
  return { uri: asset.uri, name: asset.name, mime: asset.mimeType ?? '' };
}

export async function addAttachment(db: SQLiteDatabase, ownerType: string, ownerId: string, picked: { uri: string; name: string; mime: string }) {
  const id = newId();
  const ext = /\.[a-z0-9]{1,5}$/i.exec(picked.name)?.[0] ?? (picked.mime === 'application/pdf' ? '.pdf' : '.jpg');
  const dest = new File(folder(), `${id}${ext.toLowerCase()}`);
  new File(picked.uri).copySync(dest);
  await save(db, 'attachments', { id, ownerType, ownerId, name: picked.name, uri: dest.uri, mime: picked.mime }, { silent: true });
  return id;
}

export async function deleteAttachment(db: SQLiteDatabase, a: Attachment) {
  try {
    const f = new File(a.uri);
    if (f.exists) f.delete();
  } catch {
    // The file may already be gone; the record still goes.
  }
  await remove(db, 'attachments', a.id, { silent: true });
}

/** Opens the file in another app (viewer, WhatsApp, Drive). */
export async function openAttachment(a: Attachment) {
  const f = new File(a.uri);
  if (!f.exists) throw new Error('This file is no longer on the phone. Backups do not include attached files.');
  await Sharing.shareAsync(a.uri, { mimeType: a.mime || undefined, dialogTitle: a.name });
}
