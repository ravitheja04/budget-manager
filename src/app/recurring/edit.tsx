import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { AmountField, CategoryGrid, confirmDelete, RecordPicker, Segmented, SwitchRow } from '@/components/forms';
import { Button, ChipSelect, colors, Field, Icon, styles } from '@/components/ui';
import { listAccounts, listCategories, listMembers, type AccountWithBalance } from '@/db/queries';
import { getById, remove, save } from '@/db/repo';
import { t } from '@/i18n';
import { addDays, FREQUENCIES, nextOccurrenceAfter, type Frequency } from '@/lib/dates';
import { isValidDate, todayIso } from '@/lib/format';
import { frequencyLabel, txnKindLabel } from '@/lib/labels';
import type { Category, Member, Recurring, TxnKind } from '@/lib/types';
import { showError } from '@/lib/useQuery';

const REMINDER_OPTIONS = ['-1', '0', '1', '3', '7'] as const;

export default function EditRecurring() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [original, setOriginal] = useState<Recurring | null>(null);
  const [title, setTitle] = useState('');
  const [kind, setKind] = useState<TxnKind>('expense');
  const [amount, setAmount] = useState<number | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [toAccountId, setToAccountId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [nextDate, setNextDate] = useState<string | null>(todayIso());
  const [autoLog, setAutoLog] = useState(false);
  const [reminder, setReminder] = useState<(typeof REMINDER_OPTIONS)[number]>('1');
  const [active, setActive] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [members, setMembers] = useState<Member[]>([]);

  useEffect(() => {
    (async () => {
      const [cats, accs, mems] = await Promise.all([listCategories(db), listAccounts(db), listMembers(db)]);
      setCategories(cats);
      setAccounts(accs);
      setMembers(mems);
      if (id) {
        const r = await getById<Recurring>(db, 'recurring', id);
        if (!r) return;
        setOriginal(r);
        setTitle(r.title);
        setKind(r.kind);
        setAmount(r.amount);
        setCategoryId(r.categoryId);
        setAccountId(r.accountId);
        setToAccountId(r.toAccountId);
        setMemberId(r.memberId);
        setFrequency(r.frequency);
        setNextDate(r.nextDate);
        setAutoLog(!!r.autoLog);
        setReminder(String(r.reminderDays) as (typeof REMINDER_OPTIONS)[number]);
        setActive(!!r.active);
      } else if (accs[0]) {
        setAccountId(accs[0].id);
      }
    })().catch((e) => showError(t('Could not load data'), e));
  }, [db, id]);

  async function onSave() {
    if (!title.trim()) return Alert.alert(t('Give it a name, like “Rent” or “Salary”'));
    if (!amount) return Alert.alert(t('Enter the amount'));
    if (!nextDate || !isValidDate(nextDate)) return Alert.alert(t('Enter a valid date'));
    if (kind !== 'transfer' && !categoryId) return Alert.alert(t('Choose a category'));
    try {
      // The schedule is anchored on its start date so the 31st doesn't drift to the 28th.
      const keepStart = original && original.frequency === frequency && nextOccurrenceAfter(original.startDate, frequency, addDays(nextDate, -1)) === nextDate;
      await save(db, 'recurring', {
        id: original?.id,
        title: title.trim(),
        kind,
        amount,
        accountId,
        toAccountId: kind === 'transfer' ? toAccountId : null,
        categoryId: kind === 'transfer' ? null : categoryId,
        memberId,
        frequency,
        startDate: keepStart ? original!.startDate : nextDate,
        nextDate,
        autoLog: autoLog ? 1 : 0,
        reminderDays: Number(reminder),
        active: active ? 1 : 0,
        createdAt: original?.createdAt,
      });
      router.back();
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: id ? t('Edit recurring entry') : t('New recurring entry'),
          headerRight: id
            ? () => (
                <Pressable
                  hitSlop={12}
                  onPress={() =>
                    confirmDelete(t('this recurring entry'), () =>
                      remove(db, 'recurring', id)
                        .then(() => router.back())
                        .catch((e) => showError(t('Could not delete'), e))
                    )
                  }>
                  <Icon name="trash-outline" color={colors.danger} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <Field label={t('Name')} value={title} onChangeText={setTitle} placeholder={t('e.g. Rent, Salary, School fees, Netflix')} />
        <Segmented options={(['expense', 'income', 'transfer'] as TxnKind[]).map((k) => ({ value: k, label: txnKindLabel(k) }))} value={kind} onChange={setKind} />
        <AmountField label={t('Amount')} value={amount} onChange={setAmount} />
        {kind !== 'transfer' ? <CategoryGrid label={t('Category')} categories={categories.filter((c) => c.kind === kind)} value={categoryId} onChange={setCategoryId} /> : null}
        <RecordPicker label={kind === 'income' ? t('Received in') : kind === 'transfer' ? t('From') : t('Paid from')} items={accounts} value={accountId} onChange={setAccountId} getLabel={(a) => a.name} allowNone noneLabel={t('Not set')} />
        {kind === 'transfer' ? <RecordPicker label={t('To')} items={accounts} value={toAccountId} onChange={setToAccountId} getLabel={(a) => a.name} allowNone noneLabel={t('Outside (not tracked)')} /> : null}
        {members.length ? <RecordPicker label={t('Family member')} items={members} value={memberId} onChange={setMemberId} getLabel={(m) => m.name} allowNone noneLabel={t('Family')} /> : null}
        <ChipSelect label={t('How often')} options={FREQUENCIES} value={frequency} onChange={(v) => v && setFrequency(v)} renderLabel={frequencyLabel} />
        <DateField label={t('Next date')} value={nextDate} onChange={setNextDate} />
        <SwitchRow label={t('Log it by itself')} hint={t('Off: it shows as due until you mark it paid.')} value={autoLog} onChange={setAutoLog} />
        {!autoLog ? (
          <ChipSelect
            label={t('Remind me')}
            options={REMINDER_OPTIONS}
            value={reminder}
            onChange={(v) => v && setReminder(v)}
            renderLabel={(v) => (v === '-1' ? t('No reminder') : v === '0' ? t('On the day') : t('{n} days before', { n: v }))}
          />
        ) : null}
        {id ? <SwitchRow label={t('Active')} value={active} onChange={setActive} /> : null}
        <Button title={t('Save')} onPress={onSave} style={{ marginTop: 8 }} />
      </ScrollView>
    </View>
  );
}
