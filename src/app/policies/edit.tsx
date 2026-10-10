import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { AmountField, MultiPicker, RecordPicker, SwitchRow } from '@/components/forms';
import { Button, ChipSelect, Field, SectionTitle, styles } from '@/components/ui';
import { savePolicyMembers } from '@/db/actions';
import { listAccounts, listMembers, policyMemberIds, type AccountWithBalance } from '@/db/queries';
import { getById, notifyChange, save } from '@/db/repo';
import { t } from '@/i18n';
import { isValidDate } from '@/lib/format';
import { frequencyLabel, HEALTH_COVER_TYPES, POLICY_KINDS, policyKindLabel } from '@/lib/labels';
import type { Member, Policy, PolicyDetails, PolicyKind, PremiumFrequency } from '@/lib/types';
import { showError } from '@/lib/useQuery';

const PREMIUM_FREQUENCIES: PremiumFrequency[] = ['yearly', 'halfyearly', 'quarterly', 'monthly', 'single'];

export default function EditPolicy() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [original, setOriginal] = useState<Policy | null>(null);
  const [kind, setKind] = useState<PolicyKind>('health');
  const [insurer, setInsurer] = useState('');
  const [planName, setPlanName] = useState('');
  const [policyNumber, setPolicyNumber] = useState('');
  const [holderId, setHolderId] = useState<string | null>(null);
  const [insured, setInsured] = useState<string[]>([]);
  const [nominees, setNominees] = useState('');
  const [sumAssured, setSumAssured] = useState<number | null>(null);
  const [premium, setPremium] = useState<number | null>(null);
  const [frequency, setFrequency] = useState<PremiumFrequency>('yearly');
  const [nextDue, setNextDue] = useState<string | null>(null);
  const [graceText, setGraceText] = useState('30');
  const [startDate, setStartDate] = useState<string | null>(null);
  const [endDate, setEndDate] = useState<string | null>(null);
  const [agentName, setAgentName] = useState('');
  const [agentPhone, setAgentPhone] = useState('');
  const [helpline, setHelpline] = useState('');
  const [accountId, setAccountId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [details, setDetails] = useState<PolicyDetails>({});
  const [members, setMembers] = useState<Member[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);

  const setDetail = <K extends keyof PolicyDetails>(key: K, value: PolicyDetails[K]) => setDetails((d) => ({ ...d, [key]: value }));

  useEffect(() => {
    (async () => {
      const [mems, accs] = await Promise.all([listMembers(db), listAccounts(db)]);
      setMembers(mems);
      setAccounts(accs);
      if (!id) return;
      const p = await getById<Policy>(db, 'policies', id);
      if (!p) return;
      setOriginal(p);
      setKind(p.kind);
      setInsurer(p.insurer);
      setPlanName(p.planName);
      setPolicyNumber(p.policyNumber);
      setHolderId(p.holderId);
      setInsured(await policyMemberIds(db, id));
      setNominees(p.nominees);
      setSumAssured(p.sumAssured);
      setPremium(p.premium);
      setFrequency(p.frequency);
      setNextDue(p.nextDue);
      setGraceText(String(p.graceDays));
      setStartDate(p.startDate);
      setEndDate(p.endDate);
      setAgentName(p.agentName);
      setAgentPhone(p.agentPhone);
      setHelpline(p.helpline);
      setAccountId(p.accountId);
      setNotes(p.notes);
      try {
        setDetails(JSON.parse(p.details || '{}'));
      } catch {}
    })().catch((e) => showError(t('Could not load data'), e));
  }, [db, id]);

  async function onSave() {
    if (!insurer.trim()) return Alert.alert(t('Enter the insurer'));
    for (const d of [nextDue, startDate, endDate, details.waitingPeriodEnds ?? null]) if (d && !isValidDate(d)) return Alert.alert(t('Enter a valid date'));
    const keep: PolicyDetails =
      kind === 'health'
        ? { coverType: details.coverType, deductible: details.deductible, noClaimBonus: details.noClaimBonus, roomRent: details.roomRent, copay: details.copay, waitingPeriodEnds: details.waitingPeriodEnds, tpa: details.tpa, tpaPhone: details.tpaPhone }
        : kind === 'term'
          ? { riders: details.riders, mwpa: details.mwpa }
          : kind === 'life'
            ? { maturityAmount: details.maturityAmount }
            : {};
    try {
      const savedId = await save(
        db,
        'policies',
        {
          id: original?.id,
          kind,
          insurer: insurer.trim(),
          planName: planName.trim(),
          policyNumber: policyNumber.trim(),
          holderId,
          nominees: nominees.trim(),
          sumAssured: sumAssured ?? 0,
          premium: premium ?? 0,
          frequency,
          nextDue,
          graceDays: Number(graceText) || 0,
          startDate,
          endDate,
          agentName: agentName.trim(),
          agentPhone: agentPhone.trim(),
          helpline: helpline.trim(),
          details: JSON.stringify(keep),
          accountId,
          notes: notes.trim(),
          active: original?.active ?? 1,
          createdAt: original?.createdAt,
        },
        { silent: true }
      );
      await savePolicyMembers(db, savedId, insured);
      notifyChange();
      if (original) router.back();
      else router.replace({ pathname: '/policies/[id]', params: { id: savedId } });
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  const life = kind === 'term' || kind === 'life';

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: id ? t('Edit policy') : t('New policy') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <ChipSelect label={t('Kind')} options={POLICY_KINDS} value={kind} onChange={(v) => v && setKind(v)} renderLabel={policyKindLabel} />
        <Field label={t('Insurer')} value={insurer} onChangeText={setInsurer} placeholder={t('e.g. Star Health, LIC, HDFC Life')} />
        <Field label={t('Plan name')} value={planName} onChangeText={setPlanName} />
        <Field label={t('Policy number')} value={policyNumber} onChangeText={setPolicyNumber} autoCapitalize="characters" />
        {members.length ? (
          <>
            <RecordPicker label={t('Policy holder')} items={members} value={holderId} onChange={setHolderId} getLabel={(m) => m.name} allowNone noneLabel={t('Not set')} />
            <MultiPicker label={life ? t('Life assured') : t('Who is covered')} items={members} value={insured} onChange={setInsured} getLabel={(m) => m.name} />
          </>
        ) : (
          <Text style={styles.hint}>{t('Add family members in Settings to record who each policy covers.')}</Text>
        )}
        <AmountField label={kind === 'health' ? t('Sum insured') : kind === 'vehicle' ? t('IDV') : t('Sum assured')} value={sumAssured} onChange={setSumAssured} />
        <AmountField label={t('Premium')} value={premium} onChange={setPremium} />
        <ChipSelect label={t('Premium paid')} options={PREMIUM_FREQUENCIES} value={frequency} onChange={(v) => v && setFrequency(v)} renderLabel={frequencyLabel} />
        {frequency !== 'single' ? <DateField label={t('Next due date')} value={nextDue} onChange={setNextDue} hint={t('Reminders go out 30, 15, 7 and 1 day before.')} /> : null}
        <Field label={t('Grace period (days)')} value={graceText} onChangeText={setGraceText} keyboardType="number-pad" />
        <DateField label={t('Start date')} value={startDate} onChange={setStartDate} />
        <DateField label={kind === 'life' ? t('Maturity date') : t('Cover ends on')} value={endDate} onChange={setEndDate} />
        <Field label={t('Nominee(s) and share')} value={nominees} onChangeText={setNominees} placeholder={t('e.g. Lakshmi (wife) 100%')} />

        {kind === 'health' ? (
          <>
            <SectionTitle>{t('Health cover details')}</SectionTitle>
            <ChipSelect label={t('Cover type')} options={HEALTH_COVER_TYPES} value={details.coverType ?? null} onChange={(v) => setDetail('coverType', v ?? undefined)} renderLabel={(v) => t(v)} />
            {details.coverType === 'Top-up / super top-up' ? <AmountField label={t('Deductible')} value={details.deductible ?? null} onChange={(v) => setDetail('deductible', v)} /> : null}
            <AmountField label={t('No-claim bonus built up')} value={details.noClaimBonus ?? null} onChange={(v) => setDetail('noClaimBonus', v)} />
            <Field label={t('Room rent limit')} value={details.roomRent ?? ''} onChangeText={(v) => setDetail('roomRent', v)} placeholder={t('e.g. Single private room, 1% of SI')} />
            <Field label={t('Co-pay')} value={details.copay ?? ''} onChangeText={(v) => setDetail('copay', v)} placeholder={t('e.g. 20% above age 60')} />
            <DateField label={t('Pre-existing disease waiting ends')} value={details.waitingPeriodEnds ?? null} onChange={(v) => setDetail('waitingPeriodEnds', v)} />
            <Field label={t('TPA name')} value={details.tpa ?? ''} onChangeText={(v) => setDetail('tpa', v)} />
            <Field label={t('TPA helpline')} value={details.tpaPhone ?? ''} onChangeText={(v) => setDetail('tpaPhone', v)} keyboardType="phone-pad" />
          </>
        ) : null}
        {kind === 'term' ? (
          <>
            <SectionTitle>{t('Term cover details')}</SectionTitle>
            <Field label={t('Riders')} value={details.riders ?? ''} onChangeText={(v) => setDetail('riders', v)} placeholder={t('Accidental death, critical illness, waiver of premium')} />
            <SwitchRow label={t('Under MWPA (Married Women’s Property Act)')} value={!!details.mwpa} onChange={(v) => setDetail('mwpa', v)} />
          </>
        ) : null}
        {kind === 'life' ? <AmountField label={t('Expected maturity amount')} value={details.maturityAmount ?? null} onChange={(v) => setDetail('maturityAmount', v)} /> : null}

        <SectionTitle>{t('Contacts')}</SectionTitle>
        <Field label={t('Insurer helpline')} value={helpline} onChangeText={setHelpline} keyboardType="phone-pad" />
        <Field label={t('Agent / advisor')} value={agentName} onChangeText={setAgentName} />
        <Field label={t('Agent phone')} value={agentPhone} onChangeText={setAgentPhone} keyboardType="phone-pad" />
        <RecordPicker label={t('Premium paid from')} items={accounts} value={accountId} onChange={setAccountId} getLabel={(a) => a.name} allowNone noneLabel={t('Not set')} />
        <Field label={t('Notes')} value={notes} onChangeText={setNotes} multiline placeholder={t('Network hospitals, where the papers are, how to claim…')} />
        <Button title={t('Save')} onPress={onSave} style={{ marginTop: 8 }} />
      </ScrollView>
    </View>
  );
}
