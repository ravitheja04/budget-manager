import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { AmountField, confirmDelete, SwitchRow } from '@/components/forms';
import { Button, ChipSelect, Field, styles } from '@/components/ui';
import { getById, remove, save } from '@/db/repo';
import { t } from '@/i18n';
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
        setArchived(!!a.archived);
      })
      .catch((e) => showError(t('Could not load data'), e));
  }, [db, id]);

  async function onSave() {
    if (!name.trim()) return Alert.alert(t('Give the account a name'));
    const dueDay = dueDayText.trim() ? Number(dueDayText) : null;
    if (dueDay !== null && (!Number.isInteger(dueDay) || dueDay < 1 || dueDay > 31)) return Alert.alert(t('The due day is a day of the month, 1 to 31'));
    try {
      await save(db, 'accounts', {
        id: original?.id,
        name: name.trim(),
        kind,
        openingBalance: kind === 'card' ? -(opening ?? 0) : (opening ?? 0),
        cardLimit: kind === 'card' ? limit : null,
        dueDay: kind === 'card' ? dueDay : null,
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
            <Field label={t('Bill due day (1–31)')} value={dueDayText} onChangeText={setDueDayText} keyboardType="number-pad" hint={t('You’ll be reminded before it while something is owed.')} />
          </>
        ) : null}
        {id ? <SwitchRow label={t('Archived')} hint={t('Hidden from pickers; old entries keep it.')} value={archived} onChange={setArchived} /> : null}
        <Button title={t('Save')} onPress={onSave} style={{ marginTop: 8 }} />
        {id ? <Button title={t('Delete account')} variant="danger" icon="trash-outline" onPress={() => onDelete().catch((e) => showError(t('Could not delete'), e))} /> : null}
      </ScrollView>
    </View>
  );
}
