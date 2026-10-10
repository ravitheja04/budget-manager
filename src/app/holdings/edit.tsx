import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { AmountField, RecordPicker, SwitchRow } from '@/components/forms';
import { Button, ChipSelect, Field, styles } from '@/components/ui';
import { listAccounts, listMembers, type AccountWithBalance } from '@/db/queries';
import { getById, save } from '@/db/repo';
import { t } from '@/i18n';
import { FREQUENCIES, type Frequency } from '@/lib/dates';
import { isValidDate } from '@/lib/format';
import { HOLDING_FIELDS, HOLDING_LABELS, HOLDING_TYPES } from '@/lib/holdings';
import { frequencyLabel } from '@/lib/labels';
import { parseRate } from '@/lib/money';
import type { Holding, HoldingType, Member } from '@/lib/types';
import { showError } from '@/lib/useQuery';

const INVESTED_LABEL: Partial<Record<HoldingType, string>> = {
  savings: 'Balance',
  fd: 'Deposit amount (principal)',
  rd: 'Paid in so far',
  gold: 'Bought for',
  property: 'Bought for',
  stocks: 'Bought for',
};

const NAME_HINT: Partial<Record<HoldingType, string>> = {
  fd: 'e.g. SBI FD 2026',
  mf: 'e.g. Parag Parikh Flexi Cap',
  gold: 'e.g. 20 g jewellery, SGB 2024',
  chit: 'e.g. Margadarsi 5L group',
  epf: 'e.g. EPF (UAN 1001…)',
};

export default function EditHolding() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [original, setOriginal] = useState<Holding | null>(null);
  const [type, setType] = useState<HoldingType>('fd');
  const [name, setName] = useState('');
  const [institution, setInstitution] = useState('');
  const [memberId, setMemberId] = useState<string | null>(null);
  const [nominee, setNominee] = useState('');
  const [invested, setInvested] = useState<number | null>(null);
  const [currentValue, setCurrentValue] = useState<number | null>(null);
  const [rateText, setRateText] = useState('');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [maturityDate, setMaturityDate] = useState<string | null>(null);
  const [payout, setPayout] = useState(false);
  const [contribution, setContribution] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [nextContribution, setNextContribution] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [members, setMembers] = useState<Member[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);

  useEffect(() => {
    (async () => {
      const [mems, accs] = await Promise.all([listMembers(db), listAccounts(db)]);
      setMembers(mems);
      setAccounts(accs.filter((a) => a.kind !== 'card'));
      if (!id) return;
      const h = await getById<Holding>(db, 'holdings', id);
      if (!h) return;
      setOriginal(h);
      setType(h.type);
      setName(h.name);
      setInstitution(h.institution);
      setMemberId(h.memberId);
      setNominee(h.nominee);
      setInvested(h.invested);
      setCurrentValue(h.currentValue);
      setRateText(h.rate !== null ? String(h.rate) : '');
      setStartDate(h.startDate);
      setMaturityDate(h.maturityDate);
      setPayout(!!h.payout);
      setContribution(h.contribution);
      setFrequency(h.contributionFrequency ?? 'monthly');
      setNextContribution(h.nextContributionDate);
      setAccountId(h.accountId);
      setNotes(h.notes);
    })().catch((e) => showError(t('Could not load data'), e));
  }, [db, id]);

  const f = HOLDING_FIELDS[type];

  async function onSave() {
    if (!name.trim()) return Alert.alert(t('Give it a name'));
    const rate = rateText.trim() ? parseRate(rateText) : null;
    if (rateText.trim() && rate === null) return Alert.alert(t('Enter the rate as a percentage, like 7.1'));
    for (const d of [startDate, maturityDate, nextContribution]) if (d && !isValidDate(d)) return Alert.alert(t('Enter a valid date'));
    if (f.dates && startDate && maturityDate && maturityDate <= startDate) return Alert.alert(t('The maturity date must be after the start date'));
    try {
      const savedId = await save(db, 'holdings', {
        id: original?.id,
        type,
        name: name.trim(),
        institution: institution.trim(),
        memberId,
        nominee: nominee.trim(),
        invested: invested ?? 0,
        currentValue: f.value ? currentValue : null,
        rate: f.rate ? rate : null,
        startDate: f.dates ? startDate : null,
        maturityDate: f.dates ? maturityDate : null,
        payout: f.payout && payout ? 1 : 0,
        contribution: f.contribution ? contribution : null,
        contributionFrequency: f.contribution && contribution ? frequency : null,
        nextContributionDate: f.contribution && contribution ? nextContribution : null,
        accountId,
        notes: notes.trim(),
        closed: original?.closed ?? 0,
        createdAt: original?.createdAt,
      });
      if (original) router.back();
      else router.replace({ pathname: '/holdings/[id]', params: { id: savedId } });
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: id ? t('Edit holding') : t('New holding') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <ChipSelect label={t('Type')} options={HOLDING_TYPES} value={type} onChange={(v) => v && setType(v)} renderLabel={(v) => t(HOLDING_LABELS[v])} />
        {type === 'savings' ? <Text style={styles.hint}>{t('Already tracking this bank account under Accounts? Then there’s no need to add it here too.')}</Text> : null}
        <Field label={t('Name')} value={name} onChangeText={setName} placeholder={t(NAME_HINT[type] ?? 'A name you’ll recognise')} />
        <Field label={t('Bank / institution / fund house')} value={institution} onChangeText={setInstitution} />
        <AmountField label={t(INVESTED_LABEL[type] ?? 'Put in so far')} value={invested} onChange={setInvested} />
        {f.value ? <AmountField label={t('Current value (optional)')} value={currentValue} onChange={setCurrentValue} hint={t('Leave empty to use what was put in. Update it from your statement now and then.')} /> : null}
        {f.rate ? <Field label={t('Interest rate (% per year)')} value={rateText} onChangeText={setRateText} keyboardType="decimal-pad" placeholder="7.1" /> : null}
        {f.dates ? (
          <>
            <DateField label={t('Start date')} value={startDate} onChange={setStartDate} />
            <DateField label={t('Maturity date')} value={maturityDate} onChange={setMaturityDate} hint={t('You’ll get reminders 30 and 7 days before.')} />
          </>
        ) : null}
        {f.payout ? <SwitchRow label={t('Interest paid out')} hint={t('Off: interest is added to the deposit (cumulative).')} value={payout} onChange={setPayout} /> : null}
        {f.contribution ? (
          <>
            <AmountField label={t('Regular contribution (optional)')} value={contribution} onChange={setContribution} hint={t('SIP, RD instalment, PPF deposit, chit instalment…')} />
            {contribution ? (
              <>
                <ChipSelect label={t('How often')} options={FREQUENCIES} value={frequency} onChange={(v) => v && setFrequency(v)} renderLabel={frequencyLabel} />
                <DateField label={t('Next contribution date')} value={nextContribution} onChange={setNextContribution} />
                <RecordPicker label={t('Paid from')} items={accounts} value={accountId} onChange={setAccountId} getLabel={(a) => a.name} allowNone noneLabel={t('Not set')} />
              </>
            ) : null}
          </>
        ) : null}
        {members.length ? <RecordPicker label={t('Belongs to')} items={members} value={memberId} onChange={setMemberId} getLabel={(m) => m.name} allowNone noneLabel={t('Family')} /> : null}
        <Field label={t('Nominee')} value={nominee} onChangeText={setNominee} />
        <Field label={t('Notes')} value={notes} onChangeText={setNotes} multiline placeholder={t('Account / folio number, where the papers are…')} />
        <Button title={t('Save')} onPress={onSave} style={{ marginTop: 8 }} />
      </ScrollView>
    </View>
  );
}
