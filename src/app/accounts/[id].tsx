import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { AmountField, Divider, Stat } from '@/components/forms';
import { TxnRow } from '@/components/rows';
import { Button, Card, colors, EmptyState, SectionTitle, styles } from '@/components/ui';
import { reconcile } from '@/db/actions';
import { listAccounts, listTransactions } from '@/db/queries';
import { t } from '@/i18n';
import { nextDayOfMonth } from '@/lib/dates';
import { formatDate, todayIso } from '@/lib/format';
import { accountKindLabel } from '@/lib/labels';
import { formatMoney } from '@/lib/money';
import { showError, useQuery } from '@/lib/useQuery';

export default function AccountDetail() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [reconciling, setReconciling] = useState(false);
  const [actual, setActual] = useState<number | null>(null);

  const load = useCallback(async () => {
    const account = (await listAccounts(db, true)).find((a) => a.id === id);
    if (!account) return null;
    const txns = await listTransactions(db, { accountId: id, limit: 100 });
    return { account, txns };
  }, [db, id]);
  const { data, refresh } = useQuery(load);
  if (data === undefined) return <View style={styles.screen} />;
  if (data === null) return <View style={styles.screen}><Stack.Screen options={{ title: t('Not found') }} /></View>;
  const { account: a, txns } = data;
  const isCard = a.kind === 'card';
  const outstanding = Math.max(0, -a.balance);
  // A card's balance is shown as what is owed (positive); others as money held.
  const shown = isCard ? outstanding : a.balance;

  async function saveReconcile() {
    if (actual === null) return Alert.alert(t('Enter the amount'));
    try {
      await reconcile(db, a.id, a.balance, isCard ? -actual : actual, todayIso());
      setReconciling(false);
      refresh();
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: a.name }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.hint}>{accountKindLabel(a.kind)}</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: !isCard && a.balance < 0 ? colors.danger : colors.text }}>{formatMoney(shown)}</Text>
          <Text style={styles.hint}>{isCard ? t('Outstanding on the card') : t('Balance in the app')}</Text>
          {isCard ? (
            <View style={[styles.row, { marginTop: 12 }]}>
              <Stat label={t('Limit')} value={a.cardLimit ? formatMoney(a.cardLimit) : '—'} />
              <Stat label={t('Available')} value={a.cardLimit ? formatMoney(Math.max(0, a.cardLimit - outstanding)) : '—'} />
              <Stat label={t('Due')} value={a.dueDay ? formatDate(nextDayOfMonth(a.dueDay, todayIso())) : '—'} align="right" />
            </View>
          ) : null}
        </Card>

        {isCard && outstanding > 0 ? (
          <Button
            title={t('Pay the card bill')}
            icon="card"
            onPress={() => router.push({ pathname: '/txn/edit', params: { kind: 'transfer', toAccountId: a.id, amount: String(outstanding), payee: t('Card bill') } })}
          />
        ) : null}

        {reconciling ? (
          <Card style={{ gap: 10 }}>
            <AmountField
              label={isCard ? t('Outstanding the bank shows') : t('Balance the bank shows')}
              value={actual}
              onChange={setActual}
              hint={t('The difference is recorded as an adjustment; it isn’t counted as income or spending.')}
            />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button title={t('Cancel')} variant="secondary" onPress={() => setReconciling(false)} style={{ flex: 1 }} />
              <Button title={t('Save')} onPress={saveReconcile} style={{ flex: 1 }} />
            </View>
          </Card>
        ) : (
          <Button
            title={t('Match with the bank balance')}
            icon="git-compare-outline"
            variant="secondary"
            onPress={() => {
              setActual(shown);
              setReconciling(true);
            }}
          />
        )}

        <SectionTitle>{t('Entries')}</SectionTitle>
        <Card>
          {txns.length ? txns.map((txn) => <TxnRow key={txn.id} txn={txn} showDate />) : <EmptyState icon="receipt-outline" title={t('No entries yet')} message={t('Entries paid from or into this account show here.')} />}
        </Card>
        <Divider />
        <Button title={t('Edit account')} icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/accounts/edit', params: { id } })} />
      </ScrollView>
    </View>
  );
}
