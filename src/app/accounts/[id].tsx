import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { AmountField, Divider, Stat } from '@/components/forms';
import { TxnRow } from '@/components/rows';
import { Button, Card, colors, EmptyState, SectionTitle, styles } from '@/components/ui';
import { reconcile } from '@/db/actions';
import { cardCycleFor, listAccounts, listTransactions } from '@/db/queries';
import { bookDateFor } from '@/lib/cards';
import { t } from '@/i18n';
import { monthTitle, nextDayOfMonth } from '@/lib/dates';
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
    const [txns, cycle] = await Promise.all([listTransactions(db, { accountId: id, limit: 100 }), cardCycleFor(db, account, todayIso())]);
    return { account, txns, cycle };
  }, [db, id]);
  const { data, refresh } = useQuery(load);
  if (data === undefined) return <View style={styles.screen} />;
  if (data === null) return <View style={styles.screen}><Stack.Screen options={{ title: t('Not found') }} /></View>;
  const { account: a, txns, cycle } = data;
  const today = todayIso();
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
              {cycle ? null : <Stat label={t('Due')} value={a.dueDay ? formatDate(nextDayOfMonth(a.dueDay, today)) : '—'} align="right" />}
            </View>
          ) : null}
        </Card>

        {cycle ? (
          <Card style={{ gap: 12 }}>
            <View style={[styles.row, { alignItems: 'flex-start' }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.hint}>{t('Billed on {date}', { date: formatDate(cycle.lastStatement) })}</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: cycle.billed > 0 && cycle.billedDue < today ? colors.danger : colors.text }}>{formatMoney(cycle.billed)}</Text>
                <Text style={[styles.hint, cycle.billed > 0 && cycle.billedDue < today ? { color: colors.danger } : null]}>
                  {cycle.billed <= 0 ? t('Paid. Nothing due now.') : cycle.billedDue < today ? t('Was due {date}', { date: formatDate(cycle.billedDue) }) : t('Pay by {date}', { date: formatDate(cycle.billedDue) })}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'flex-end' }}>
                <Text style={styles.hint}>{t('Unbilled')}</Text>
                <Text style={{ fontSize: 20, fontWeight: '800', color: colors.text }}>{formatMoney(cycle.unbilled)}</Text>
                <Text style={[styles.hint, { textAlign: 'right' }]}>{t('On the {date} bill', { date: formatDate(cycle.nextStatement) })}</Text>
              </View>
            </View>
            {a.billMonth ? (
              <Text style={styles.hint}>
                {t('Spends count in the month their bill is paid: a spend today counts in {month}.', { month: monthTitle(bookDateFor(today, a)) })}
              </Text>
            ) : null}
          </Card>
        ) : null}

        {isCard && (cycle ? cycle.billed > 0 : outstanding > 0) ? (
          <Button
            title={cycle ? t('Pay the bill ({amount})', { amount: formatMoney(cycle.billed) }) : t('Pay the card bill')}
            icon="card"
            onPress={() => router.push({ pathname: '/txn/edit', params: { kind: 'transfer', toAccountId: a.id, amount: String(cycle ? cycle.billed : outstanding), payee: t('Card bill') } })}
          />
        ) : null}
        {isCard && !cycle ? <Text style={styles.hint}>{t('Add the statement day in Edit account to see what is billed and what comes on the next bill.')}</Text> : null}

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
