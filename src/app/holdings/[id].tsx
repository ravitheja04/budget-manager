import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { AmountField, confirmDelete, Divider, RecordPicker } from '@/components/forms';
import { TxnRow } from '@/components/rows';
import { TermProgress } from '@/components/TermProgress';
import { Button, Card, colors, InfoRow, SectionTitle, styles } from '@/components/ui';
import { payContribution, skipContribution } from '@/db/actions';
import { listAccounts, listTransactions } from '@/db/queries';
import { getById, remove, save } from '@/db/repo';
import { t } from '@/i18n';
import { formatDate, todayIso } from '@/lib/format';
import { HOLDING_LABELS, holdingValue, maturityValue } from '@/lib/holdings';
import { frequencyLabel } from '@/lib/labels';
import { formatMoney } from '@/lib/money';
import { scheduleProgress } from '@/lib/terms';
import type { Holding, Member } from '@/lib/types';
import { showError, useQuery } from '@/lib/useQuery';

export default function HoldingDetail() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [paying, setPaying] = useState(false);
  const [payAmount, setPayAmount] = useState<number | null>(null);
  const [payAccount, setPayAccount] = useState<string | null>(null);
  const [newValue, setNewValue] = useState<number | null>(null);
  const [updatingValue, setUpdatingValue] = useState(false);

  const load = useCallback(async () => {
    const h = await getById<Holding>(db, 'holdings', id);
    if (!h) return null;
    const [member, accounts, txns] = await Promise.all([
      h.memberId ? getById<Member>(db, 'members', h.memberId) : null,
      listAccounts(db),
      listTransactions(db, { sourceType: 'holding', sourceId: id, limit: 50 }),
    ]);
    return { h, member, accounts, txns };
  }, [db, id]);
  const { data, refresh } = useQuery(load);

  if (data === undefined) return <View style={styles.screen} />;
  if (data === null) return <View style={styles.screen}><Stack.Screen options={{ title: t('Not found') }} /></View>;
  const { h, member, accounts, txns } = data;
  const today = todayIso();
  const value = holdingValue(h, today);
  const maturity = maturityValue(h);

  async function confirmPay() {
    if (!payAmount) return Alert.alert(t('Enter the amount'));
    try {
      await payContribution(db, h, { date: h.nextContributionDate ?? today, amount: payAmount, accountId: payAccount });
      setPaying(false);
      refresh();
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  async function saveValue() {
    if (newValue === null) return Alert.alert(t('Enter the amount'));
    try {
      await save(db, 'holdings', { ...h, currentValue: newValue });
      setUpdatingValue(false);
      refresh();
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: h.name }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        <Card>
          <Text style={styles.hint}>{t(HOLDING_LABELS[h.type])}</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text }}>{formatMoney(value)}</Text>
          <Text style={styles.hint}>
            {h.currentValue === null && h.type === 'fd' ? t('Worked out with quarterly compounding') : h.currentValue !== null ? t('Value you entered') : t('What was put in')}
          </Text>
          {h.currentValue !== null || h.type !== 'fd' ? (
            updatingValue ? (
              <View style={{ gap: 8, marginTop: 10 }}>
                <AmountField label={t('Current value')} value={newValue} onChange={setNewValue} hint={t('From the passbook, statement or app.')} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title={t('Cancel')} variant="secondary" onPress={() => setUpdatingValue(false)} style={{ flex: 1 }} />
                  <Button title={t('Save')} onPress={saveValue} style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <Button
                title={t('Update value')}
                variant="secondary"
                icon="create-outline"
                onPress={() => {
                  setNewValue(value);
                  setUpdatingValue(true);
                }}
                style={{ marginTop: 10 }}
              />
            )
          ) : null}
        </Card>

        {h.contribution && h.startDate && h.contributionFrequency ? (
          <TermProgress
            p={scheduleProgress({ start: h.startDate, frequency: h.contributionFrequency, next: h.nextContributionDate, payYears: h.payYears, amount: h.contribution, end: h.maturityDate }, today)}
            paidLabel={t('Deposits')}
            paidAmount={h.invested}
            endLabel={t('Matures')}
            end={h.maturityDate}
          />
        ) : null}

        {h.contribution && h.nextContributionDate && !h.closed ? (
          <Card>
            <Text style={styles.title}>{t('Next contribution: {amount} on {date}', { amount: formatMoney(h.contribution), date: formatDate(h.nextContributionDate) })}</Text>
            {paying ? (
              <View style={{ gap: 10, marginTop: 10 }}>
                <AmountField label={t('Amount')} value={payAmount} onChange={setPayAmount} />
                <RecordPicker label={t('Paid from')} items={accounts} value={payAccount} onChange={setPayAccount} getLabel={(a) => a.name} allowNone noneLabel={t('Not tracked')} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title={t('Cancel')} variant="secondary" onPress={() => setPaying(false)} style={{ flex: 1 }} />
                  <Button title={t('Mark paid')} onPress={confirmPay} style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Button title={t('Skip')} variant="secondary" onPress={() => skipContribution(db, h).then(refresh).catch((e) => showError(t('Could not save'), e))} style={{ flex: 1 }} />
                <Button
                  title={t('Mark paid')}
                  onPress={() => {
                    setPayAmount(h.contribution);
                    setPayAccount(h.accountId);
                    setPaying(true);
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            )}
          </Card>
        ) : null}

        <Card>
          <InfoRow icon="business-outline" label={t('Institution')} value={h.institution} />
          <InfoRow icon="person-outline" label={t('Belongs to')} value={member?.name} />
          <InfoRow icon="people-outline" label={t('Nominee')} value={h.nominee} />
          <InfoRow icon="wallet-outline" label={t('Put in')} value={formatMoney(h.invested)} />
          <InfoRow icon="trending-up-outline" label={t('Rate')} value={h.rate !== null ? `${h.rate}%` : null} />
          <InfoRow icon="calendar-outline" label={t('Started')} value={h.startDate ? formatDate(h.startDate) : null} />
          <InfoRow icon="hourglass-outline" label={t('Matures')} value={h.maturityDate ? formatDate(h.maturityDate) : null} />
          <InfoRow icon="cash-outline" label={t('At maturity')} value={maturity !== null ? `${formatMoney(maturity)} ${t('(estimate)')}` : null} />
          <InfoRow icon="repeat-outline" label={t('Contribution')} value={h.contribution ? `${formatMoney(h.contribution)} · ${h.contributionFrequency ? frequencyLabel(h.contributionFrequency) : ''}` : null} />
          <InfoRow icon="document-text-outline" label={t('Notes')} value={h.notes} />
        </Card>

        {txns.length ? (
          <>
            <SectionTitle>{t('Contributions logged')}</SectionTitle>
            <Card>
              {txns.map((txn) => (
                <TxnRow key={txn.id} txn={txn} showDate />
              ))}
            </Card>
          </>
        ) : null}

        <Divider />
        <Button title={t('Edit')} icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/holdings/edit', params: { id } })} />
        <Button
          title={h.closed ? t('Reopen') : t('Mark as closed / redeemed')}
          variant="secondary"
          onPress={() => save(db, 'holdings', { ...h, closed: h.closed ? 0 : 1 }).then(refresh).catch((e) => showError(t('Could not save'), e))}
        />
        <Button
          title={t('Delete')}
          variant="danger"
          icon="trash-outline"
          onPress={() =>
            confirmDelete(h.name, () =>
              remove(db, 'holdings', id)
                .then(() => router.back())
                .catch((e) => showError(t('Could not delete'), e))
            )
          }
        />
      </ScrollView>
    </View>
  );
}
