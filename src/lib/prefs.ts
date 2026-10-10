import type { SQLiteDatabase } from 'expo-sqlite';
import { useSyncExternalStore } from 'react';

import { getSetting, setSetting } from './settings';

/** "Hide amounts": shows ₹•••• on the dashboard for when others are looking. */

let hidden = false;
const listeners = new Set<() => void>();

export async function loadHideAmounts(db: SQLiteDatabase) {
  hidden = (await getSetting(db, 'hideAmounts')) === '1';
  listeners.forEach((l) => l());
}

export async function setHideAmounts(db: SQLiteDatabase, value: boolean) {
  hidden = value;
  listeners.forEach((l) => l());
  await setSetting(db, 'hideAmounts', value ? '1' : '0');
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useHideAmounts() {
  return useSyncExternalStore(
    subscribe,
    () => hidden,
    () => hidden
  );
}
