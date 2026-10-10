import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { AmountField, confirmDelete, SwitchRow } from '@/components/forms';
import { Button, ChipSelect, Field, styles } from '@/components/ui';
import { getById, remove, save } from '@/db/repo';
import { t } from '@/i18n';
import { dueFor, statementFor } from '@/lib/cards';
import { monthTitle } from '@/lib/dates';
import { formatDate, todayIso } from '@/lib/format';
import { accountKindLabel } from '@/lib/labels';
import type { Account, AccountKind } from '@/lib/types';
import { showError } from '@/lib/useQuery';

const KINDS: AccountKind[] = ['bank', 'cash', 'wallet', 'card'];

export default function EditAccount() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [original, setOriginal] = useState<Account | null>(null);
  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const [opening, setOpening] = useState<number | null>(0);
  const [limit, setLimit] = useState<number | null>(null);
  const [dueDayText, setDueDayText] = useState('');
  const [statementDayText, setStatementDayText] = useState('');
  const [billMonth, setBillMonth] = useState(false);
  const [archived, setArchived] = useState(false);

  useEffect(() => {
    if (!id) return;
    getById<Account>(db, 'accounts', id)
      .then((a) => {
        if (!a) return;
        setOriginal(a);
        setName(a.name);
        setKind(a.kind);
        // Cards store what is owed as a negative balance; the form asks for the amount owed.
        setOpening(a.kind === 'card' ? -a.openingBalance : a.openingBalance);
        setLimit(a.cardLimit);
        setDueDayText(a.dueDay ? String(a.dueDay) : '');
        setStatementDayText(a.statementDay ? String(a.statementDay) : '');
        setBillMonth(!!a.billMonth);
        setArchived(!!a.archived);
      })
      .catch((e) => showError(t('Could not load data'), e));
  }, [db, id]);

  // A worked example for the hint, from today's date.
  const sDay = Number(statementDayText);
  const dDay = Number(dueDayText);
  const example =
    sDay >= 1 && sDay <= 31 && dDay >= 1 && dDay <= 31
      ? (() => {
          const statement = statementFor(todayIso(), sDay);
          const due = dueFor(statement, dDay);
          return { statement: formatDate(statement), due: formatDate(due), month: monthTitle(due) };
        })()
      : null;

  async function onSave() {
    if (!name.trim()) return Alert.alert(t('Give the account a name'));
    const dueDay = dueDayText.trim() ? Number(dueDayText) : null;
    if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) return Alert.alert(t('The due day is a day of the month, 1 to 31'));
    const statementDay = statementDayText.trim() ? Number(statementDayText) : null;
    if (statementDay !== null && (!Number.isInteger(statementDay) || statementDay < 1 || statementDay > 31)) return Alert.alert(t('The statement day is a day of the month, 1 to 31'));
    if (kind === 'card' && billMonth && (!statementDay || !dueDay)) return Alert.alert(t('Enter the statement day and the due day to count spends in the bill’s month.'));
    try {
      await save(db, 'accounts', {
        id: original?.id,
        name: name.trim(),
        kind,
        openingBalance: kind === 'card' ? -(opening ?? 0) : (opening ?? 0),
        cardLimit: kind === 'card' ? limit : null,
        dueDay: kind === 'card' ? dueDay : null,
        statementDay: kind === 'card' ? statementDay : null,
        billMonth: kind === 'card' && billMonth ? 1 : 0,
        archived: archived ? 1 : 0,
        createdAt: original?.createdAt,
      });
      router.back();
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  async function onDelete() {
    if (!id) return;
    const used = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM transactions WHERE accountId = ? OR toAccountId = ?', id, id);
    if (used?.n) return Alert.alert(t('This account has entries'), t('Archive it instead, so the entries keep their account.'));
    confirmDelete(name, () =>
      remove(db, 'accounts', id)
        .then(() => router.dismissTo('/accounts'))
        .catch((e) => showError(t('Could not delete'), e))
    );
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: id ? t('Edit account') : t('New account') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <ChipSelect label={t('Kind')} options={KINDS} value={kind} onChange={(v) => v && setKind(v)} renderLabel={accountKindLabel} />
        <Field label={t('Name')} value={name} onChangeText={setName} placeholder={kind === 'card' ? t('e.g. HDFC Millennia') : kind === 'wallet' ? t('e.g. PhonePe, Paytm') : t('e.g. SBI savings')} />
        <AmountField
          label={kind === 'card' ? t('Amount owed when you start') : t('Balance when you start')}
          value={opening}
          onChange={setOpening}
          hint={t('The app adds and subtracts entries from here.')}
        />
        {kind === 'card' ? (
          <>
            <AmountField label={t('Credit limit')} value={limit} onChange={setLimit} />
            <Field
              label={t('Statement (bill) day (1–31)')}
              value={statementDayText}
              onChangeText={setStatementDayText}
              keyboardType="number-pad"
              hint={t('The day the bill is made, e.g. 18: spends up to and on the 18th are on that bill.')}
            />
            <Field label={t('Bill due day (1–31)')} value={dueDayText} onChangeText={setDueDayText} keyboardType="number-pad" hint={t('The last day to pay, e.g. 6 (of the next month).')} />
            <SwitchRow
              label={t('Count spends in the month the bill is paid')}
              hint={
                example
                  ? t('A spend today goes on the {statement} bill, paid by {due}, so it counts in {month}. Applies to spends you add from now on; entries already in the app stay where they are.', example)
                  : t('Needs the statement day and due day. Applies to spends you add from now on.')
              }
              value={billMonth}
              onChange={setBillMonth}
            />
          </>
        ) : null}
        {id ? <SwitchRow label={t('Archived')} hint={t('Hidden from pickers; old entries keep it.')} value={archived} onChange={setArchived} /> : null}
        <Button title={t('Save')} onPress={onSave} style={{ marginTop: 8 }} />
        {id ? <Button title={t('Delete account')} variant="danger" icon="trash-outline" onPress={() => onDelete().catch((e) => showError(t('Could not delete'), e))} /> : null}
      </ScrollView>
    </View>
  );
}
