import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { AmountField, confirmDelete, Divider, RecordPicker } from '@/components/forms';
import { TxnRow } from '@/components/rows';
import { TermProgress } from '@/components/TermProgress';
import { Button, Card, colors, Icon, InfoRow, SectionTitle, styles } from '@/components/ui';
import { deletePolicy, payPremium, skipPremium } from '@/db/actions';
import { attachmentsFor, listAccounts, listMembers, listTransactions, policyMemberIds } from '@/db/queries';
import { getById, save } from '@/db/repo';
import { t } from '@/i18n';
import { addAttachment, deleteAttachment, openAttachment, pickAttachment } from '@/lib/attachments';
import { addDays, daysBetween } from '@/lib/dates';
import { formatDate, isValidDate, todayIso } from '@/lib/format';
import { frequencyLabel, policyKindLabel } from '@/lib/labels';
import { formatMoney } from '@/lib/money';
import { scheduleProgress } from '@/lib/terms';
import type { Policy, PolicyDetails } from '@/lib/types';
import { showError, useQuery } from '@/lib/useQuery';

function CallButton({ label, phone }: { label: string; phone: string }) {
  if (!phone.trim()) return null;
  return (
    <Button title={label} icon="call" variant="secondary" onPress={() => Linking.openURL(`tel:${phone.replace(/[^\d+]/g, '')}`).catch(() => Alert.alert(phone))} style={{ flex: 1 }} />
  );
}

export default function PolicyDetail() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [paying, setPaying] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(todayIso());
  const [accountId, setAccountId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const p = await getById<Policy>(db, 'policies', id);
    if (!p) return null;
    const [members, insuredIds, accounts, txns, files] = await Promise.all([
      listMembers(db),
      policyMemberIds(db, id),
      listAccounts(db),
      listTransactions(db, { sourceType: 'policy', sourceId: id, limit: 50 }),
      attachmentsFor(db, 'policy', id),
    ]);
    let details: PolicyDetails = {};
    try {
      details = JSON.parse(p.details || '{}');
    } catch {}
    return { p, details, members, insuredIds, accounts, txns, files };
  }, [db, id]);
  const { data, refresh } = useQuery(load);

  if (data === undefined) return <View style={styles.screen} />;
  if (data === null) return <View style={styles.screen}><Stack.Screen options={{ title: t('Not found') }} /></View>;
  const { p, details, members, insuredIds, accounts, txns, files } = data;
  const today = todayIso();
  const memberName = (mid: string | null) => members.find((m) => m.id === mid)?.name;
  const insured = insuredIds.map((m) => memberName(m)).filter(Boolean).join(', ');
  const days = p.nextDue ? daysBetween(today, p.nextDue) : null;
  const graceEnd = p.nextDue ? addDays(p.nextDue, p.graceDays) : null;

  async function confirmPay() {
    if (!amount) return Alert.alert(t('Enter the amount'));
    if (!date || !isValidDate(date)) return Alert.alert(t('Enter a valid date'));
    try {
      await payPremium(db, p, { date, amount, accountId });
      setPaying(false);
      refresh();
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  async function attach() {
    try {
      const picked = await pickAttachment();
      if (!picked) return;
      await addAttachment(db, 'policy', id, picked);
      refresh();
    } catch (e) {
      showError(t('Could not attach the file'), e);
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: p.insurer }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.hint}>{policyKindLabel(p.kind)}</Text>
          <Text style={[styles.title, { fontSize: 20 }]}>{p.planName || p.insurer}</Text>
          {p.policyNumber ? (
            <Text style={styles.subtitle} selectable>
              {t('Policy no. {n}', { n: p.policyNumber })}
            </Text>
          ) : null}
          <View style={[styles.row, { marginTop: 12 }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hint}>{p.kind === 'health' ? t('Sum insured') : t('Sum assured')}</Text>
              <Text style={[styles.title, { fontSize: 18 }]}>{formatMoney(p.sumAssured)}</Text>
            </View>
            <View style={{ flex: 1, alignItems: 'flex-end' }}>
              <Text style={styles.hint}>{t('Premium')}</Text>
              <Text style={[styles.title, { fontSize: 18 }]}>{formatMoney(p.premium)}</Text>
              <Text style={styles.hint}>{frequencyLabel(p.frequency)}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
            <CallButton label={t('Insurer')} phone={p.helpline} />
            <CallButton label={p.agentName || t('Agent')} phone={p.agentPhone} />
            {p.kind === 'health' && details.tpaPhone ? <CallButton label={details.tpa || t('TPA')} phone={details.tpaPhone} /> : null}
          </View>
        </Card>

        {p.startDate ? (
          <TermProgress
            p={scheduleProgress({ start: p.startDate, frequency: p.frequency, next: p.nextDue, payYears: p.payYears, amount: p.premium, end: p.endDate }, today)}
            paidLabel={t('Premiums')}
            endLabel={p.kind === 'life' ? t('Matures') : t('Cover ends')}
            end={p.endDate}
          />
        ) : (
          <Text style={styles.hint}>{t('Add the start date and premium paying term (Edit policy) to see premiums paid and left.')}</Text>
        )}

        {p.active && p.nextDue ? (
          <Card>
            <Text style={[styles.title, { color: days !== null && days < 0 ? colors.danger : colors.text }]}>
              {t('Next premium {amount} due {date}', { amount: formatMoney(p.premium), date: formatDate(p.nextDue) })}
            </Text>
            {days !== null && days < 0 && graceEnd ? (
              <Text style={[styles.subtitle, { color: graceEnd >= today ? colors.warnStrong : colors.danger }]}>
                {graceEnd >= today ? t('In the grace period until {date}', { date: formatDate(graceEnd) }) : t('Grace period ended {date}. Check with the insurer.', { date: formatDate(graceEnd) })}
              </Text>
            ) : null}
            {paying ? (
              <View style={{ gap: 10, marginTop: 10 }}>
                <AmountField label={t('Amount paid')} value={amount} onChange={setAmount} />
                <DateField label={t('Paid on')} value={date} onChange={setDate} />
                <RecordPicker label={t('Paid from')} items={accounts} value={accountId} onChange={setAccountId} getLabel={(a) => a.name} allowNone noneLabel={t('Not tracked')} />
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title={t('Cancel')} variant="secondary" onPress={() => setPaying(false)} style={{ flex: 1 }} />
                  <Button title={t('Mark paid')} onPress={confirmPay} style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                <Button title={t('Skip')} variant="secondary" onPress={() => skipPremium(db, p).then(refresh).catch((e) => showError(t('Could not save'), e))} style={{ flex: 1 }} />
                <Button
                  title={t('Mark paid')}
                  onPress={() => {
                    setAmount(p.premium);
                    setDate(today);
                    setAccountId(p.accountId);
                    setPaying(true);
                  }}
                  style={{ flex: 1 }}
                />
              </View>
            )}
            <Text style={[styles.hint, { marginTop: 8 }]}>{t('Reminders 30, 15, 7 and 1 day before, and on the day.')}</Text>
          </Card>
        ) : null}

        <Card>
          <InfoRow icon="person-outline" label={t('Policy holder')} value={memberName(p.holderId)} />
          <InfoRow icon="people-outline" label={p.kind === 'term' || p.kind === 'life' ? t('Life assured') : t('Insured')} value={insured} />
          <InfoRow icon="heart-outline" label={t('Nominees')} value={p.nominees} />
          <InfoRow icon="calendar-outline" label={t('Started')} value={p.startDate ? formatDate(p.startDate) : null} />
          <InfoRow icon="hourglass-outline" label={p.kind === 'life' ? t('Matures') : t('Cover ends')} value={p.endDate ? formatDate(p.endDate) : null} />
          <InfoRow icon="time-outline" label={t('Grace period')} value={p.graceDays ? t('{n} days', { n: p.graceDays }) : null} />
          <InfoRow icon="briefcase-outline" label={t('Agent')} value={[p.agentName, p.agentPhone].filter(Boolean).join(' · ')} />
          <InfoRow icon="call-outline" label={t('Helpline')} value={p.helpline} />
          {p.kind === 'health' ? (
            <>
              <InfoRow icon="layers-outline" label={t('Cover type')} value={details.coverType ? t(details.coverType) : null} />
              <InfoRow icon="remove-circle-outline" label={t('Deductible')} value={details.deductible ? formatMoney(details.deductible) : null} />
              <InfoRow icon="add-circle-outline" label={t('No-claim bonus')} value={details.noClaimBonus ? formatMoney(details.noClaimBonus) : null} />
              <InfoRow icon="bed-outline" label={t('Room rent limit')} value={details.roomRent} />
              <InfoRow icon="pie-chart-outline" label={t('Co-pay')} value={details.copay} />
              <InfoRow icon="hourglass-outline" label={t('Waiting period ends')} value={details.waitingPeriodEnds ? formatDate(details.waitingPeriodEnds) : null} />
              <InfoRow icon="business-outline" label={t('TPA')} value={[details.tpa, details.tpaPhone].filter(Boolean).join(' · ')} />
            </>
          ) : null}
          {p.kind === 'term' ? (
            <>
              <InfoRow icon="add-outline" label={t('Riders')} value={details.riders} />
              <InfoRow icon="shield-outline" label={t('MWPA')} value={details.mwpa ? t('Yes') : t('No')} />
            </>
          ) : null}
          {p.kind === 'life' ? <InfoRow icon="cash-outline" label={t('Maturity amount')} value={details.maturityAmount ? formatMoney(details.maturityAmount) : null} /> : null}
          <InfoRow icon="document-text-outline" label={t('Notes')} value={p.notes} />
        </Card>

        <SectionTitle>{t('Documents')}</SectionTitle>
        <Card>
          {files.map((a) => (
            <View key={a.id} style={[styles.row, { paddingVertical: 6 }]}>
              <Icon name={a.mime === 'application/pdf' ? 'document-text-outline' : 'image-outline'} color={colors.muted} />
              <Pressable style={{ flex: 1 }} onPress={() => openAttachment(a).catch((e) => showError(t('Could not open'), e))}>
                <Text style={[styles.body, { color: colors.primary }]} numberOfLines={1}>
                  {a.name}
                </Text>
              </Pressable>
              <Pressable hitSlop={8} onPress={() => confirmDelete(t('this file'), () => deleteAttachment(db, a).then(refresh).catch((e) => showError(t('Could not delete'), e)))}>
                <Icon name="close-circle" color={colors.muted} />
              </Pressable>
            </View>
          ))}
          <Button title={t('Attach policy document or health card')} icon="attach" variant="secondary" onPress={attach} style={{ marginTop: files.length ? 8 : 0 }} />
        </Card>

        {txns.length ? (
          <>
            <SectionTitle>{t('Premiums paid')}</SectionTitle>
            <Card>
              {txns.map((txn) => (
                <TxnRow key={txn.id} txn={txn} showDate />
              ))}
            </Card>
          </>
        ) : null}

        <Divider />
        <Button title={t('Edit policy')} icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/policies/edit', params: { id } })} />
        <Button
          title={p.active ? t('Mark as lapsed / ended') : t('Mark as active')}
          variant="secondary"
          onPress={() => save(db, 'policies', { ...p, active: p.active ? 0 : 1 }).then(refresh).catch((e) => showError(t('Could not save'), e))}
        />
        <Button
          title={t('Delete policy')}
          variant="danger"
          icon="trash-outline"
          onPress={() =>
            confirmDelete(t('this policy'), () =>
              deletePolicy(db, id)
                .then(() => router.back())
                .catch((e) => showError(t('Could not delete'), e))
            )
          }
        />
      </ScrollView>
    </View>
  );
}
