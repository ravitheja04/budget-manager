import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { CategoryIcon, ListRow, Stat } from '@/components/forms';
import { Button, Card, colors, EmptyState, SectionTitle, styles } from '@/components/ui';
import { listMembers, listPolicies, type PolicyRow } from '@/db/queries';
import { t } from '@/i18n';
import { perYear } from '@/lib/dates';
import { formatDate, todayIso } from '@/lib/format';
import { POLICY_ICONS, POLICY_KINDS, policyKindLabel } from '@/lib/labels';
import { formatMoney, formatMoneyShort } from '@/lib/money';
import { scheduleProgress } from '@/lib/terms';
import { useQuery } from '@/lib/useQuery';

/** "7 of 10 yrs paid" for policies with a premium paying term. */
function termLine(p: { startDate: string | null; frequency: PolicyRow['frequency']; nextDue: string | null; payYears: number | null; premium: number; endDate: string | null }) {
  if (!p.startDate || !p.payYears || p.frequency === 'single') return null;
  const pr = scheduleProgress({ start: p.startDate, frequency: p.frequency, next: p.nextDue, payYears: p.payYears, amount: p.premium, end: p.endDate }, todayIso());
  return pr.finished ? t('premiums done') : t('{paid} of {total} yrs paid', { paid: pr.yearsPaid, total: p.payYears });
}

export default function Insurance() {
  const db = useSQLiteContext();
  const load = useCallback(async () => {
    const [policies, members, links] = await Promise.all([listPolicies(db), listMembers(db), db.getAllAsync<{ policyId: string; memberId: string }>('SELECT * FROM policy_members')]);
    return { policies, members, links };
  }, [db]);
  const { data } = useQuery(load);
  if (!data) return <View style={styles.screen} />;
  const { policies, members, links } = data;
  const active = policies.filter((p) => p.active);
  const inactive = policies.filter((p) => !p.active);
  const yearly = active.reduce((s, p) => s + (p.frequency === 'single' ? 0 : p.premium * perYear(p.frequency)), 0);

  // Cover per person: health policies they're insured under; life cover where they're the life assured.
  const cover = members.map((m) => {
    const insuredIn = new Set(links.filter((l) => l.memberId === m.id).map((l) => l.policyId));
    const health = active.filter((p) => p.kind === 'health' && insuredIn.has(p.id)).reduce((s, p) => s + p.sumAssured, 0);
    const life = active.filter((p) => (p.kind === 'term' || p.kind === 'life') && (insuredIn.has(p.id) || (insuredIn.size === 0 && p.holderId === m.id))).reduce((s, p) => s + p.sumAssured, 0);
    return { m, health, life };
  });

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        {policies.length === 0 ? (
          <EmptyState icon="shield-checkmark-outline" title={t('No policies yet')} message={t('Health, term, LIC, vehicle: keep every policy, who it covers and when it renews, with reminders before the premium is due.')} />
        ) : (
          <Card>
            <View style={styles.row}>
              <Stat label={t('Active policies')} value={String(active.length)} />
              <Stat label={t('Premiums a year')} value={formatMoney(yearly)} align="right" />
            </View>
          </Card>
        )}
        <Button title={t('Add a policy')} icon="add" onPress={() => router.push('/policies/edit')} />

        {cover.some((c) => c.health || c.life) ? (
          <>
            <SectionTitle>{t('Cover per person')}</SectionTitle>
            <Card>
              {cover.map(({ m, health, life }) => (
                <View key={m.id} style={[styles.row, { paddingVertical: 6 }]}>
                  <Text style={[styles.body, { flex: 1 }]}>{m.name}</Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.hint, { color: health ? colors.text : colors.danger }]}>{t('Health {amount}', { amount: health ? formatMoneyShort(health) : '—' })}</Text>
                    <Text style={styles.hint}>{t('Life {amount}', { amount: life ? formatMoneyShort(life) : '—' })}</Text>
                  </View>
                </View>
              ))}
            </Card>
          </>
        ) : null}

        {POLICY_KINDS.map((kind) => {
          const list = active.filter((p) => p.kind === kind);
          if (!list.length) return null;
          return (
            <View key={kind} style={{ gap: 8 }}>
              <SectionTitle>{policyKindLabel(kind)}</SectionTitle>
              <Card>
                {list.map((p) => (
                  <ListRow
                    key={p.id}
                    onPress={() => router.push({ pathname: '/policies/[id]', params: { id: p.id } })}
                    left={<CategoryIcon icon={POLICY_ICONS[p.kind]} color={colors.primary} size={36} />}
                    title={p.planName ? `${p.insurer} · ${p.planName}` : p.insurer}
                    subtitle={[p.insuredNames ?? p.holderName, termLine(p), p.nextDue ? t('due {date}', { date: formatDate(p.nextDue) }) : null].filter(Boolean).join(' · ')}
                    right={p.sumAssured ? formatMoneyShort(p.sumAssured) : undefined}
                    rightSub={p.premium ? formatMoney(p.premium) : null}
                  />
                ))}
              </Card>
            </View>
          );
        })}

        {inactive.length ? (
          <>
            <SectionTitle>{t('Lapsed or ended')}</SectionTitle>
            <Card>
              {inactive.map((p) => (
                <ListRow key={p.id} onPress={() => router.push({ pathname: '/policies/[id]', params: { id: p.id } })} title={p.insurer} subtitle={policyKindLabel(p.kind)} />
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
