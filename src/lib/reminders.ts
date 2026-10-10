import * as Notifications from 'expo-notifications';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Platform } from 'react-native';

import { loadDues } from '@/db/queries';
import { t } from '@/i18n';
import { addDays } from './dates';
import type { DueItem } from './dues';
import { todayIso } from './format';
import { formatMoney } from './money';
import { getSetting, setSetting } from './settings';

/**
 * Phone notifications before each due date (EMIs, premiums, bills, SIPs,
 * maturities). Everything is scheduled on the phone; nothing leaves it.
 * The whole set is rebuilt after each change, which keeps it simple and right.
 */

const CHANNEL = 'dues';
/** iOS keeps at most 64 pending notifications; leave room for budget alerts. */
const MAX_SCHEDULED = 60;
const LOOKAHEAD_DAYS = 45;
const REMIND_HOUR = 9;

Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

export async function remindersEnabled(db: SQLiteDatabase) {
  return (await getSetting(db, 'reminders.enabled')) === '1';
}

/** Asks for permission when turning reminders on. Returns false if the phone said no. */
export async function setRemindersEnabled(db: SQLiteDatabase, enabled: boolean) {
  if (enabled) {
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current : await Notifications.requestPermissionsAsync();
    if (!status.granted) return false;
  }
  await setSetting(db, 'reminders.enabled', enabled ? '1' : '0');
  await rescheduleReminders(db);
  return true;
}

async function ensureChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL, {
    name: t('Due dates and budgets'),
    importance: Notifications.AndroidImportance.HIGH,
  });
}

export function dueTitle(item: DueItem) {
  switch (item.kind) {
    case 'emi':
      return t('EMI due: {name}', { name: item.title });
    case 'premium':
      return t('Premium due: {name}', { name: item.title });
    case 'contribution':
      return t('Contribution due: {name}', { name: item.title });
    case 'card':
      return t('Card bill due: {name}', { name: item.title });
    case 'maturity':
      return t('Maturing: {name}', { name: item.title });
    case 'policyEnd':
      return t('Policy ends: {name}', { name: item.title });
    case 'lent':
      return t('Money due back from {name}', { name: item.title });
    default:
      return t('Due: {name}', { name: item.title });
  }
}

function whenText(days: number) {
  if (days === 0) return t('Today');
  if (days === 1) return t('Tomorrow');
  return t('In {n} days', { n: days });
}

let running: Promise<void> | null = null;
let again = false;

/** Rebuilds all scheduled reminders. Calls made while one is running are folded into one more run. */
export function rescheduleReminders(db: SQLiteDatabase): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await rebuild(db);
      } while (again);
    } catch {
      // Reminders are a convenience; never let them break saving.
    } finally {
      running = null;
    }
  })();
  return running;
}

async function rebuild(db: SQLiteDatabase) {
  if (Platform.OS === 'web') return;
  await Notifications.cancelAllScheduledNotificationsAsync();
  if (!(await remindersEnabled(db))) return;
  await ensureChannel();
  const today = todayIso();
  const items = await loadDues(db, today, LOOKAHEAD_DAYS);
  const now = Date.now();
  const planned: { at: Date; title: string; body: string }[] = [];
  for (const item of items) {
    for (const before of item.remindDays) {
      const day = addDays(item.date, -before);
      const [y, m, d] = day.split('-').map(Number);
      const at = new Date(y, m - 1, d, REMIND_HOUR, 0, 0);
      if (at.getTime() <= now) continue;
      const amount = item.amount ? ` · ${formatMoney(item.amount)}` : '';
      planned.push({ at, title: dueTitle(item), body: `${whenText(before)}${amount}` });
    }
  }
  planned.sort((a, b) => a.at.getTime() - b.at.getTime());
  for (const p of planned.slice(0, MAX_SCHEDULED)) {
    await Notifications.scheduleNotificationAsync({
      content: { title: p.title, body: p.body },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.at, channelId: CHANNEL },
    });
  }
}

/** Shows a notification straight away (budget alerts). */
export async function notifyNow(db: SQLiteDatabase, title: string, body: string) {
  if (Platform.OS === 'web' || !(await remindersEnabled(db))) return;
  await ensureChannel();
  await Notifications.scheduleNotificationAsync({ content: { title, body }, trigger: Platform.OS === 'android' ? { channelId: CHANNEL } : null });
}
