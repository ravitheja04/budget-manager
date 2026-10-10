import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { AmountField, confirmDelete, Divider, ListRow, ProgressBar, RecordPicker, Segmented, Stat } from '@/components/forms';
import { Button, Card, colors, InfoRow, SectionTitle, styles } from '@/components/ui';
import { addLoanPayment, deleteLoan, deleteLoanPayment, payEmi } from '@/db/actions';
import { listAccounts, listLoans, loanPayments } from '@/db/queries';
import { getById } from '@/db/repo';
import { t } from '@/i18n';
import { addMonths } from '@/lib/dates';
import { prepaymentEffect, schedule } from '@/lib/finance';
import { formatDate, isValidDate, todayIso } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { LoanPayment, Member } from '@/lib/types';
import { showError, useQuery } from '@/lib/useQuery';

type Mode = null | 'emi' | 'extra' | 'calc';

export default function LoanDetail() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [mode, setMode] = useState<Mode>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [interest, setInterest] = useState<number | null>(null);
  const [date, setDate] = useState<string | null>(todayIso());
  const [calcAmount, setCalcAmount] = useState<number | null>(null);
  const [calcMode, setCalcMode] = useState<'tenure' | 'emi'>('tenure');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const entry = (await listLoans(db)).find((l) => l.loan.id === id);
    if (!entry) return null;
    const [payments, accounts, member] = await Promise.all([
      loanPayments(db, id),
      listAccounts(db),
      entry.loan.memberId ? getById<Member>(db, 'members', entry.loan.memberId) : null,
    ]);
    return { ...entry, payments, accounts, member };
  }, [db, id]);
  const { data, refresh } = useQuery(load);

  if (data === undefined) return <View style={styles.screen} />;
  if (data === null) return <View style={styles.screen}><Stack.Screen options={{ title: t('Not found') }} /></View>;
  const { loan, status, payments, accounts, member } = data;
  const borrowed = loan.direction === 'borrowed';
  const rows = borrowed && loan.emi && status.outstanding > 0 ? schedule(status.outstanding, loan.rate, loan.emi) : [];
  const effect = calcAmount && loan.emi ? prepaymentEffect(status.outstanding, loan.rate, loan.emi, calcAmount) : null;

  function open(next: Mode) {
    setAccountId(loan.accountId);
    setAmount(null);
    setInterest(null);
    setDate(todayIso());
    setMode(next);
  }

  async function confirmEmi() {
    if (!status.nextEmiDate || !status.nextEmi) return;
    setBusy(true);
    try {
      await payEmi(db, loan, status.nextEmiDate, status.nextEmi, accountId);
      setMode(null);
      refresh();
    } catch (e) {
      showError(t('Could not save'), e);
    } finally {
      setBusy(false);
    }
  }

  async function confirmExtra() {
    if (!amount) return Alert.alert(t('Enter the amount'));
    if (!date || !isValidDate(date)) return Alert.alert(t('Enter a valid date'));
    const principal = Math.min(amount, status.outstanding);
    setBusy(true);
    try {
      await addLoanPayment(db, loan, { kind: borrowed ? 'prepayment' : 'repayment', date, principal, interest: interest ?? 0, accountId, log: true });
      setMode(null);
      refresh();
    } catch (e) {
      showError(t('Could not save'), e);
    } finally {
      setBusy(false);
    }
  }

  function paymentTap(p: LoanPayment) {
    if (p.kind === 'opening') return Alert.alert(t('EMIs before tracking'), t('{n} EMIs paid before the loan was added. Edit the loan to change this.', { n: p.emiCount ?? 0 }));
    confirmDelete(t('this payment (and its entries)'), () =>
      deleteLoanPayment(db, p)
        .then(refresh)
        .catch((e) => showError(t('Could not delete'), e))
    );
  }

  const paymentLabel = (p: LoanPayment) =>
    ({ emi: t('EMI'), prepayment: t('Prepayment'), repayment: t('Repayment'), opening: t('{n} EMIs before tracking', { n: p.emiCount ?? 0 }) })[p.kind];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: loan.party }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <Card>
          <Text style={styles.hint}>{borrowed ? t('Principal outstanding') : t('Still to get back')}</Text>
          <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text }}>{formatMoney(status.outstanding)}</Text>
          <ProgressBar ratio={status.progress} color={borrowed ? colors.primary : colors.okText} />
          <Text style={[styles.hint, { marginTop: 6 }]}>{t('{pct}% of {principal} repaid', { pct: Math.round(status.progress * 100), principal: formatMoney(loan.principal) })}</Text>
          <View style={[styles.row, { marginTop: 12 }]}>
            <Stat label={t('Paid so far')} value={formatMoney(status.totalPaid)} />
            <Stat label={borrowed ? t('Interest paid') : t('Interest received')} value={formatMoney(status.interestPaid)} align="right" />
          </View>
          {borrowed && loan.emi ? (
            <View style={[styles.row, { marginTop: 12 }]}>
              <Stat label={t('EMIs left')} value={status.emisLeft === null ? '—' : String(status.emisLeft)} />
              <Stat label={t('Ends')} value={status.closureDate ? formatDate(status.closureDate) : '—'} align="right" />
            </View>
          ) : null}
          {borrowed && status.interestLeft !== null ? <Text style={[styles.hint, { marginTop: 8 }]}>{t('Interest still to pay at this EMI: {amount}', { amount: formatMoney(status.interestLeft) })}</Text> : null}
          {borrowed && loan.emi && status.emisLeft === null && status.outstanding > 0 ? (
            <Text style={[styles.hint, { marginTop: 8, color: colors.danger }]}>{t('The EMI doesn’t cover the monthly interest, so the loan never ends. Check the EMI and rate.')}</Text>
          ) : null}
        </Card>

        {!loan.closed && borrowed && status.nextEmiDate && status.nextEmi ? (
          <Card>
            <Text style={styles.title}>{t('Next EMI: {amount} on {date}', { amount: formatMoney(status.nextEmi.amount), date: formatDate(status.nextEmiDate) })}</Text>
            <Text style={styles.subtitle}>{t('Principal {p} + interest {i}', { p: formatMoney(status.nextEmi.principal), i: formatMoney(status.nextEmi.interest) })}</Text>
            {mode === 'emi' ? (
              <View style={{ gap: 10, marginTop: 10 }}>
                <RecordPicker label={t('Paid from')} items={accounts} value={accountId} onChange={setAccountId} getLabel={(a) => a.name} allowNone noneLabel={t('Not tracked')} />
                <Text style={styles.hint}>{t('Interest is logged as an expense; the principal part as a transfer (it isn’t spending).')}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <Button title={t('Cancel')} variant="secondary" onPress={() => setMode(null)} style={{ flex: 1 }} />
                  <Button title={t('Mark paid')} onPress={confirmEmi} loading={busy} style={{ flex: 1 }} />
                </View>
              </View>
            ) : (
              <Button title={t('Mark EMI paid')} icon="checkmark" onPress={() => open('emi')} style={{ marginTop: 10 }} />
            )}
          </Card>
        ) : null}

        {!loan.closed ? (
          mode === 'extra' ? (
            <Card style={{ gap: 10 }}>
              <Text style={styles.title}>{borrowed ? t('Prepayment') : t('Money received back')}</Text>
              <AmountField label={t('Principal amount')} value={amount} onChange={setAmount} />
              <AmountField label={t('Interest part (optional)')} value={interest} onChange={setInterest} />
              <DateField label={t('Date')} value={date} onChange={setDate} />
              <RecordPicker label={borrowed ? t('Paid from') : t('Received in')} items={accounts} value={accountId} onChange={setAccountId} getLabel={(a) => a.name} allowNone noneLabel={t('Not tracked')} />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Button title={t('Cancel')} variant="secondary" onPress={() => setMode(null)} style={{ flex: 1 }} />
                <Button title={t('Save')} onPress={confirmExtra} loading={busy} style={{ flex: 1 }} />
              </View>
            </Card>
          ) : (
            <Button title={borrowed ? t('Log a prepayment') : t('Log money received back')} variant="secondary" icon="add" onPress={() => open('extra')} />
          )
        ) : null}

        {!loan.closed && borrowed && loan.emi && status.outstanding > 0 ? (
          <Card style={{ gap: 10 }}>
            <Pressable onPress={() => setMode(mode === 'calc' ? null : 'calc')}>
              <Text style={styles.title}>{t('Prepayment calculator')}</Text>
              <Text style={styles.subtitle}>{t('What would paying extra now save?')}</Text>
            </Pressable>
            {mode === 'calc' ? (
              <>
                <AmountField label={t('If I prepay')} value={calcAmount} onChange={setCalcAmount} />
                <Segmented
                  options={[
                    { value: 'tenure', label: t('Keep EMI, finish sooner') },
                    { value: 'emi', label: t('Keep tenure, lower EMI') },
                  ]}
                  value={calcMode}
                  onChange={setCalcMode}
                />
                {effect ? (
                  calcMode === 'tenure' ? (
                    <View style={styles.row}>
                      <Stat label={t('Interest saved')} value={formatMoney(effect.tenure.interestSaved)} color={colors.okText} />
                      <Stat label={t('Months saved')} value={String(effect.tenure.monthsSaved)} align="right" />
                    </View>
                  ) : (
                    <View style={styles.row}>
                      <Stat label={t('New EMI')} value={formatMoney(effect.emi.newEmi)} />
                      <Stat label={t('Interest saved')} value={formatMoney(effect.emi.interestSaved)} color={colors.okText} align="right" />
                    </View>
                  )
                ) : null}
                <Text style={styles.hint}>{t('An estimate on the reducing balance. Your bank’s figures may differ slightly.')}</Text>
              </>
            ) : null}
          </Card>
        ) : null}

        <Card>
          <InfoRow icon="pricetag-outline" label={t('Type')} value={t(loan.type)} />
          <InfoRow icon="person-outline" label={t('In the name of')} value={member?.name} />
          <InfoRow icon="keypad-outline" label={t('Account no.')} value={loan.accountNumber} />
          <InfoRow icon="wallet-outline" label={t('Principal')} value={formatMoney(loan.principal)} />
          <InfoRow icon="trending-up-outline" label={t('Rate')} value={loan.rate ? `${loan.rate}%` : null} />
          <InfoRow icon="cash-outline" label={t('EMI')} value={loan.emi ? formatMoney(loan.emi) : null} />
          <InfoRow icon="time-outline" label={t('Tenure')} value={loan.tenureMonths ? t('{n} months', { n: loan.tenureMonths }) : null} />
          <InfoRow icon="calendar-outline" label={borrowed ? t('First EMI') : t('Given on')} value={formatDate(loan.startDate)} />
          <InfoRow icon="calendar-outline" label={t('Due back')} value={loan.dueDate ? formatDate(loan.dueDate) : null} />
          <InfoRow icon="document-text-outline" label={t('Notes')} value={loan.notes} />
        </Card>

        {payments.length ? (
          <>
            <SectionTitle>{t('Payments')}</SectionTitle>
            <Card>
              {payments.map((p) => (
                <ListRow
                  key={p.id}
                  onPress={() => paymentTap(p)}
                  title={paymentLabel(p)}
                  subtitle={`${formatDate(p.date)}${p.interest ? ' · ' + t('interest {i}', { i: formatMoney(p.interest) }) : ''}`}
                  right={formatMoney(p.amount)}
                />
              ))}
              <Text style={styles.hint}>{t('Tap a payment to delete it.')}</Text>
            </Card>
          </>
        ) : null}

        {rows.length && status.nextEmiDate ? (
          <>
            <SectionTitle>{t('Repayment schedule')}</SectionTitle>
            <Card>
              <View style={[styles.row, { paddingBottom: 6 }]}>
                <Text style={[styles.hint, { flex: 1.3 }]}>{t('Date')}</Text>
                <Text style={[styles.hint, { flex: 1, textAlign: 'right' }]}>{t('Principal')}</Text>
                <Text style={[styles.hint, { flex: 1, textAlign: 'right' }]}>{t('Interest')}</Text>
                <Text style={[styles.hint, { flex: 1.2, textAlign: 'right' }]}>{t('Balance')}</Text>
              </View>
              <Divider />
              {(showAll ? rows : rows.slice(0, 12)).map((r) => (
                <View key={r.n} style={[styles.row, { paddingVertical: 4 }]}>
                  <Text style={{ flex: 1.3, fontSize: 13, color: colors.text }}>{formatDate(addMonths(status.nextEmiDate!, r.n - 1))}</Text>
                  <Text style={{ flex: 1, fontSize: 13, color: colors.text, textAlign: 'right' }}>{formatMoney(r.principal)}</Text>
                  <Text style={{ flex: 1, fontSize: 13, color: colors.muted, textAlign: 'right' }}>{formatMoney(r.interest)}</Text>
                  <Text style={{ flex: 1.2, fontSize: 13, color: colors.text, textAlign: 'right' }}>{formatMoney(r.balance)}</Text>
                </View>
              ))}
              {rows.length > 12 ? (
                <Pressable onPress={() => setShowAll((v) => !v)} style={{ paddingTop: 8 }}>
                  <Text style={{ color: colors.primary, fontWeight: '600' }}>{showAll ? t('Show less') : t('Show all {n} months', { n: rows.length })}</Text>
                </Pressable>
              ) : null}
            </Card>
          </>
        ) : null}

        <Divider />
        <Button title={t('Edit loan')} icon="create-outline" variant="secondary" onPress={() => router.push({ pathname: '/loans/edit', params: { id } })} />
        <Button
          title={t('Delete loan')}
          variant="danger"
          icon="trash-outline"
          onPress={() =>
            confirmDelete(t('this loan and its payments'), () =>
              deleteLoan(db, loan)
                .then(() => router.back())
                .catch((e) => showError(t('Could not delete'), e))
            )
          }
        />
      </ScrollView>
    </View>
  );
}
