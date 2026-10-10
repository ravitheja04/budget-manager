import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { Alert, Pressable, Text, View } from 'react-native';

import { payRecurring, skipRecurring } from '@/db/actions';
import { getById } from '@/db/repo';
import type { TxnRow as TxnRowData } from '@/db/queries';
import { t } from '@/i18n';
import { daysBetween } from '@/lib/dates';
import type { DueItem } from '@/lib/dues';
import { formatDate, todayIso } from '@/lib/format';
import { relativeDue } from '@/lib/labels';
import { formatMoney } from '@/lib/money';
import { dueTitle } from '@/lib/reminders';
import type { Recurring } from '@/lib/types';
import { showError } from '@/lib/useQuery';
import { CategoryIcon, ListRow } from './forms';
import { colors, Icon, styles } from './ui';

export function TxnRow({ txn, showDate }: { txn: TxnRowData; showDate?: boolean }) {
  const isTransfer = txn.kind === 'transfer';
  const title = txn.payee || (isTransfer ? t('Transfer') : t(txn.categoryName ?? 'Uncategorised'));
  const accountText = isTransfer
    ? txn.accountName || txn.toAccountName
      ? [txn.accountName ?? t('Outside'), txn.toAccountName ?? t('Outside')].join(' → ')
      : t(txn.notes)
    : [txn.payee ? t(txn.categoryName ?? '') : null, txn.accountName].filter(Boolean).join(' · ');
  const sub = [showDate ? formatDate(txn.date) : null, accountText, txn.memberName].filter(Boolean).join(' · ');
  return (
    <ListRow
      onPress={() => router.push({ pathname: '/txn/edit', params: { id: txn.id } })}
      left={isTransfer ? <CategoryIcon icon="swap-horizontal" color={colors.muted} /> : <CategoryIcon icon={txn.categoryIcon} color={txn.categoryColor} />}
      title={title}
      subtitle={sub}
      right={formatMoney(txn.amount, { sign: txn.kind === 'income' })}
      rightColor={txn.kind === 'income' ? colors.okText : isTransfer ? colors.muted : colors.text}
    />
  );
}

const DUE_ICONS: Record<DueItem['kind'], string> = {
  recurring: 'repeat',
  emi: 'cash',
  lent: 'people',
  premium: 'shield-checkmark',
  contribution: 'trending-up',
  card: 'card',
  maturity: 'hourglass',
  policyEnd: 'alert-circle',
};

/** One due item; tapping it opens what it belongs to (recurring entries can be paid or skipped right here). */
export function DueRow({ item, onChanged }: { item: DueItem; onChanged?: () => void }) {
  const db = useSQLiteContext();
  const days = daysBetween(todayIso(), item.date);
  const late = item.overdue && !item.inGrace && item.kind !== 'maturity' && item.kind !== 'policyEnd';
  const color = late ? colors.danger : item.inGrace || days <= 1 ? colors.warnStrong : colors.primary;

  async function open() {
    switch (item.kind) {
      case 'recurring': {
        const r = await getById<Recurring>(db, 'recurring', item.ownerId);
        if (!r) return;
        Alert.alert(r.title, `${formatMoney(r.amount)} · ${formatDate(r.nextDate)}`, [
          { text: t('Cancel'), style: 'cancel' },
          { text: t('Edit'), onPress: () => router.push({ pathname: '/recurring/edit', params: { id: r.id } }) },
          { text: t('Skip this time'), onPress: () => skipRecurring(db, r).then(onChanged).catch((e) => showError(t('Could not save'), e)) },
          { text: t('Mark paid'), onPress: () => payRecurring(db, r).then(onChanged).catch((e) => showError(t('Could not save'), e)) },
        ]);
        return;
      }
      case 'emi':
      case 'lent':
        router.push({ pathname: '/loans/[id]', params: { id: item.ownerId } });
        return;
      case 'premium':
      case 'policyEnd':
        router.push({ pathname: '/policies/[id]', params: { id: item.ownerId } });
        return;
      case 'contribution':
      case 'maturity':
        router.push({ pathname: '/holdings/[id]', params: { id: item.ownerId } });
        return;
      case 'card':
        router.push({ pathname: '/accounts/[id]', params: { id: item.ownerId } });
    }
  }

  const when = item.inGrace ? t('in grace period') : relativeDue(days);
  return (
    <ListRow
      onPress={() => open().catch((e) => showError(t('Could not open'), e))}
      left={
        <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: color + '22', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name={DUE_ICONS[item.kind]} size={20} color={color} />
        </View>
      }
      title={dueTitle(item)}
      subtitle={`${formatDate(item.date)} · ${when}`}
      right={item.amount ? formatMoney(item.amount) : undefined}
      rightColor={late ? colors.danger : undefined}
    />
  );
}

/** Day heading with that day's total spend, for grouped lists. */
export function DayHeader({ date, spent, income }: { date: string; spent: number; income: number }) {
  return (
    <View style={[styles.sectionRow, { marginTop: 12 }]}>
      <Text style={styles.sectionTitle}>{formatDate(date)}</Text>
      <Text style={styles.hint}>
        {[spent ? `−${formatMoney(spent)}` : null, income ? `+${formatMoney(income)}` : null].filter(Boolean).join('  ')}
      </Text>
    </View>
  );
}

/** The round + button for quick add. */
export function QuickAddButton({ params }: { params?: Record<string, string> }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('Add an entry')}
      onPress={() => router.push({ pathname: '/txn/edit', params })}
      style={({ pressed }) => [
        {
          position: 'absolute',
          right: 20,
          bottom: 20,
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: colors.primary,
          alignItems: 'center',
          justifyContent: 'center',
          elevation: 6,
          shadowColor: '#000',
          shadowOpacity: 0.2,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 4 },
        },
        pressed && styles.pressed,
      ]}>
      <Icon name="add" size={32} color={colors.onPrimary} />
    </Pressable>
  );
}
