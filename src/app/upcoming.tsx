import { Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { DueRow } from '@/components/rows';
import { Card, EmptyState, SectionTitle, styles } from '@/components/ui';
import { loadDues } from '@/db/queries';
import { t } from '@/i18n';
import { monthKey, monthTitle } from '@/lib/dates';
import { todayIso } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useQuery } from '@/lib/useQuery';

/** Everything due in the next 60 days (and anything overdue), month by month. */
export default function Upcoming() {
  const db = useSQLiteContext();
  const load = useCallback(() => loadDues(db, todayIso(), 60), [db]);
  const { data, refresh } = useQuery(load);
  const overdue = data?.filter((d) => d.overdue && d.kind !== 'maturity' && d.kind !== 'policyEnd') ?? [];
  const ahead = data?.filter((d) => !overdue.includes(d)) ?? [];
  const months = [...new Set(ahead.map((d) => monthKey(d.date)))];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('Upcoming') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        {data && data.length === 0 ? <EmptyState icon="calendar-outline" title={t('Nothing coming up')} message={t('EMIs, premiums, bills, SIPs and maturities in the next 60 days show here.')} /> : null}
        {overdue.length ? (
          <>
            <SectionTitle>{t('Overdue')}</SectionTitle>
            <Card>
              {overdue.map((d) => (
                <DueRow key={d.key} item={d} onChanged={refresh} />
              ))}
            </Card>
          </>
        ) : null}
        {months.map((m) => {
          const items = ahead.filter((d) => monthKey(d.date) === m);
          const total = items.reduce((s, d) => s + (d.kind === 'maturity' || d.kind === 'policyEnd' || d.kind === 'lent' ? 0 : (d.amount ?? 0)), 0);
          return (
            <View key={m} style={{ gap: 8 }}>
              <SectionTitle action={total ? <Text style={styles.hint}>{t('{amount} to pay', { amount: formatMoney(total) })}</Text> : null}>{monthTitle(`${m}-01`)}</SectionTitle>
              <Card>
                {items.map((d) => (
                  <DueRow key={d.key} item={d} onChanged={refresh} />
                ))}
              </Card>
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}
