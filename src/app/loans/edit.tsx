import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { AmountField, RecordPicker, Segmented, SwitchRow } from '@/components/forms';
import { Button, ChipSelect, Field, styles } from '@/components/ui';
import { listAccounts, listMembers, loanPayments, type AccountWithBalance } from '@/db/queries';
import { getById, notifyChange, remove, save } from '@/db/repo';
import { t } from '@/i18n';
import { emiFor } from '@/lib/finance';
import { isValidDate, todayIso } from '@/lib/format';
import { LOAN_TYPES_BORROWED, LOAN_TYPES_LENT } from '@/lib/labels';
import { openingRecord } from '@/lib/loans';
import { formatMoney, parseRate } from '@/lib/money';
import type { Loan, LoanDirection, Member } from '@/lib/types';
import { showError } from '@/lib/useQuery';

export default function EditLoan() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string; direction?: LoanDirection }>();
  const [original, setOriginal] = useState<Loan | null>(null);
  const [direction, setDirection] = useState<LoanDirection>(params.direction ?? 'borrowed');
  const [type, setType] = useState<string>('Home');
  const [party, setParty] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [principal, setPrincipal] = useState<number | null>(null);
  const [rateText, setRateText] = useState('');
  const [tenureText, setTenureText] = useState('');
  const [startDate, setStartDate] = useState<string | null>(todayIso());
  const [emi, setEmi] = useState<number | null>(null);
  const [emiTouched, setEmiTouched] = useState(false);
  const [dueDate, setDueDate] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [countPast, setCountPast] = useState(true);
  const [hadOpening, setHadOpening] = useState(false);
  const [hasOtherPayments, setHasOtherPayments] = useState(false);
  const [members, setMembers] = useState<Member[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);

  useEffect(() => {
    (async () => {
      const [mems, accs] = await Promise.all([listMembers(db), listAccounts(db)]);
      setMembers(mems);
      setAccounts(accs.filter((a) => a.kind !== 'card'));
      if (!params.id) return;
      const l = await getById<Loan>(db, 'loans', params.id);
      if (!l) return;
      const payments = await loanPayments(db, l.id);
      setOriginal(l);
      setDirection(l.direction);
      setType(l.type);
      setParty(l.party);
      setAccountNumber(l.accountNumber);
      setPrincipal(l.principal);
      setRateText(l.rate ? String(l.rate) : '');
      setTenureText(l.tenureMonths ? String(l.tenureMonths) : '');
      setStartDate(l.startDate);
      setEmi(l.emi);
      setEmiTouched(true);
      setDueDate(l.dueDate);
      setAccountId(l.accountId);
      setMemberId(l.memberId);
      setNotes(l.notes);
      setHadOpening(payments.some((p) => p.kind === 'opening'));
      setCountPast(payments.some((p) => p.kind === 'opening'));
      setHasOtherPayments(payments.some((p) => p.kind !== 'opening'));
    })().catch((e) => showError(t('Could not load data'), e));
  }, [db, params.id]);

  const borrowed = direction === 'borrowed';
  const rate = rateText.trim() ? parseRate(rateText) : 0;
  const tenure = Number(tenureText) || null;
  const suggestedEmi = borrowed && principal && tenure && rate !== null ? emiFor(principal, rate, tenure) : null;

  // The EMI is worked out until the user types their bank's figure.
  const effectiveEmi = emiTouched ? emi : (suggestedEmi ?? emi);

  const startsInPast = !!startDate && isValidDate(startDate) && startDate < todayIso();

  async function onSave() {
    if (!party.trim()) return Alert.alert(borrowed ? t('Enter the lender’s name') : t('Enter the person’s name'));
    if (!principal) return Alert.alert(t('Enter the amount'));
    if (rate === null) return Alert.alert(t('Enter the rate as a percentage, like 8.5'));
    if (!startDate || !isValidDate(startDate)) return Alert.alert(t('Enter a valid date'));
    if (dueDate && !isValidDate(dueDate)) return Alert.alert(t('Enter a valid date'));
    try {
      const fields = {
        id: original?.id,
        direction,
        type,
        party: party.trim(),
        accountNumber: accountNumber.trim(),
        principal,
        rate: rate ?? 0,
        tenureMonths: borrowed ? tenure : null,
        startDate,
        emi: borrowed ? effectiveEmi : null,
        dueDate: borrowed ? null : dueDate,
        accountId,
        memberId,
        notes: notes.trim(),
        closed: original?.closed ?? 0,
        createdAt: original?.createdAt,
      };
      const id = await save(db, 'loans', fields, { silent: true });
      // EMIs that fell due before the loan was added: one summary record.
      if (borrowed) {
        const existing = (await loanPayments(db, id)).filter((p) => p.kind === 'opening');
        await remove(
          db,
          'loan_payments',
          existing.map((p) => p.id),
          { silent: true }
        );
        const rec = countPast && startsInPast && effectiveEmi ? openingRecord({ principal, rate: rate ?? 0, emi: effectiveEmi, startDate }, todayIso()) : null;
        if (rec) {
          await save(db, 'loan_payments', { loanId: id, kind: 'opening', date: rec.date, amount: rec.amount, principal: rec.principal, interest: rec.interest, transactionId: null, emiCount: rec.emiCount }, { silent: true });
        }
      }
      notifyChange();
      if (original) router.back();
      else router.replace({ pathname: '/loans/[id]', params: { id } });
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: params.id ? t('Edit loan') : borrowed ? t('New loan') : t('Money lent') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        {!params.id ? (
          <Segmented
            options={[
              { value: 'borrowed', label: t('We borrowed') },
              { value: 'lent', label: t('We lent') },
            ]}
            value={direction}
            onChange={(d) => {
              setDirection(d);
              setType(d === 'borrowed' ? 'Home' : 'Family');
            }}
          />
        ) : null}
        <ChipSelect label={t('Type')} options={borrowed ? LOAN_TYPES_BORROWED : LOAN_TYPES_LENT} value={type} onChange={(v) => v && setType(v)} renderLabel={(v) => t(v)} />
        <Field label={borrowed ? t('Lender') : t('Lent to')} value={party} onChangeText={setParty} placeholder={borrowed ? t('e.g. SBI Home Loan') : t('e.g. Ravi (cousin)')} />
        <AmountField label={borrowed ? t('Loan amount (principal)') : t('Amount lent')} value={principal} onChange={setPrincipal} />
        <Field label={t('Interest rate (% per year)')} value={rateText} onChangeText={setRateText} keyboardType="decimal-pad" placeholder={borrowed ? '8.5' : '0'} />
        {borrowed ? (
          <>
            <Field label={t('Tenure (months)')} value={tenureText} onChangeText={setTenureText} keyboardType="number-pad" placeholder="240" hint={tenure ? t('{y} years', { y: Math.round((tenure / 12) * 10) / 10 }) : undefined} />
            <DateField label={t('First EMI date')} value={startDate} onChange={setStartDate} hint={t('Later EMIs fall on the same day each month.')} />
            <AmountField
              label={t('EMI')}
              value={effectiveEmi}
              onChange={(v) => {
                setEmiTouched(true);
                setEmi(v);
              }}
              hint={suggestedEmi ? t('Worked out: {emi}. Change it to match your bank if different.', { emi: formatMoney(suggestedEmi) }) : t('Fill in amount, rate and tenure to work it out.')}
            />
            {startsInPast && effectiveEmi ? (
              <SwitchRow
                label={t('EMIs before today are already paid')}
                hint={hasOtherPayments || hadOpening ? t('Counts them in one entry; nothing is added to your spending.') : t('So the outstanding balance starts where it is today. Nothing is added to your spending.')}
                value={countPast}
                onChange={setCountPast}
              />
            ) : null}
            <Field label={t('Loan account number')} value={accountNumber} onChangeText={setAccountNumber} />
          </>
        ) : (
          <>
            <DateField label={t('Given on')} value={startDate} onChange={setStartDate} />
            <DateField label={t('Expected back by (optional)')} value={dueDate} onChange={setDueDate} hint={t('You’ll get a reminder on the day.')} />
          </>
        )}
        <RecordPicker label={borrowed ? t('EMIs paid from') : t('Paid from')} items={accounts} value={accountId} onChange={setAccountId} getLabel={(a) => a.name} allowNone noneLabel={t('Not set')} />
        {members.length ? <RecordPicker label={t('In the name of')} items={members} value={memberId} onChange={setMemberId} getLabel={(m) => m.name} allowNone noneLabel={t('Family')} /> : null}
        <Field label={t('Notes')} value={notes} onChangeText={setNotes} multiline placeholder={borrowed ? t('Co-borrower, collateral, documents…') : undefined} />
        {borrowed && original && original.rate !== rate ? <Text style={styles.hint}>{t('A new rate applies from the next EMI. Change the EMI too if the bank changed it.')}</Text> : null}
        <Button title={t('Save')} onPress={onSave} style={{ marginTop: 8 }} />
      </ScrollView>
    </View>
  );
}
