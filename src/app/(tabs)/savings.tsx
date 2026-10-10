import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { CategoryIcon, ListRow } from '@/components/forms';
import { Button, Card, colors, EmptyState, SectionTitle, styles } from '@/components/ui';
import { listHoldings } from '@/db/queries';
import { t } from '@/i18n';
import { addMonths } from '@/lib/dates';
import { formatDate, todayIso } from '@/lib/format';
import { ASSET_CLASS, HOLDING_ICONS, HOLDING_LABELS, HOLDING_TYPES, holdingValue, type AssetClass } from '@/lib/holdings';
import { formatMoney, formatMoneyShort } from '@/lib/money';
import type { Holding } from '@/lib/types';
import { scheduleProgress } from '@/lib/terms';
import { useQuery } from '@/lib/useQuery';

/** "6 of 15 yrs paid" for schemes with a deposit term (SSY, PPF, RD…). */
function depositLine(h: Holding, today: string) {
  if (!h.startDate || !h.payYears || !h.contribution || !h.contributionFrequency) return null;
  const p = scheduleProgress({ start: h.startDate, frequency: h.contributionFrequency, next: h.nextContributionDate, payYears: h.payYears, amount: h.contribution, end: h.maturityDate }, today);
  return p.finished ? t('deposits done') : t('{paid} of {total} yrs paid', { paid: p.yearsPaid, total: h.payYears });
}

const CLASS_COLORS: Record<AssetClass, string> = { equity: '#2563EB', debt: '#16A34A', gold: '#CA8A04', cash: '#0891B2', property: '#7C3AED', other: '#94A3B8' };
const classLabel = (c: AssetClass) => ({ equity: t('Equity'), debt: t('Debt'), gold: t('Gold'), cash: t('Cash'), property: t('Property'), other: t('Other') })[c];

export default function Savings() {
  const db = useSQLiteContext();
  const load = useCallback(() => listHoldings(db), [db]);
  const { data } = useQuery(load);
  if (!data) return <View style={styles.screen} />;

  const today = todayIso();
  const open = data.filter((h) => !h.closed);
  const closed = data.filter((h) => h.closed);
  const value = (h: Holding) => holdingValue(h, today);
  const total = open.reduce((s, h) => s + value(h), 0);
  const invested = open.reduce((s, h) => s + h.invested, 0);

  const byClass = new Map<AssetClass, number>();
  for (const h of open) byClass.set(ASSET_CLASS[h.type], (byClass.get(ASSET_CLASS[h.type]) ?? 0) + value(h));
  const classes = [...byClass.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);

  const yearAhead = addMonths(today, 12);
  const maturing = open.filter((h) => h.maturityDate && h.maturityDate >= today && h.maturityDate <= yearAhead).sort((a, b) => (a.maturityDate! < b.maturityDate! ? -1 : 1));

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        {open.length === 0 ? (
          <EmptyState icon="trending-up-outline" title={t('No savings or investments yet')} message={t('FDs, RDs, PPF, EPF, NPS, mutual funds, gold, chit funds: keep them all in one list with maturity reminders.')} />
        ) : (
          <Card>
            <Text style={styles.hint}>{t('Total value')}</Text>
            <Text style={{ fontSize: 26, fontWeight: '800', color: colors.text }}>{formatMoney(total)}</Text>
            <Text style={styles.hint}>{t('Put in {invested}', { invested: formatMoney(invested) })}</Text>
            {classes.length ? (
              <>
                <View style={{ flexDirection: 'row', height: 10, borderRadius: 5, overflow: 'hidden', marginTop: 12 }}>
                  {classes.map(([c, v]) => (
                    <View key={c} style={{ flex: v, backgroundColor: CLASS_COLORS[c] }} />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 8 }}>
                  {classes.map(([c, v]) => (
                    <View key={c} style={[styles.row, { gap: 6 }]}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: CLASS_COLORS[c] }} />
                      <Text style={styles.hint}>
                        {classLabel(c)} {Math.round((v / total) * 100)}%
                      </Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
          </Card>
        )}
        <Button title={t('Add a holding')} icon="add" onPress={() => router.push('/holdings/edit')} />

        {HOLDING_TYPES.map((type) => {
          const list = open.filter((h) => h.type === type);
          if (!list.length) return null;
          return (
            <View key={type} style={{ gap: 8 }}>
              <SectionTitle action={<Text style={styles.hint}>{formatMoneyShort(list.reduce((s, h) => s + value(h), 0))}</Text>}>{t(HOLDING_LABELS[type])}</SectionTitle>
              <Card>
                {list.map((h) => (
                  <ListRow
                    key={h.id}
                    onPress={() => router.push({ pathname: '/holdings/[id]', params: { id: h.id } })}
                    left={<CategoryIcon icon={HOLDING_ICONS[h.type]} color={colors.primary} size={36} />}
                    title={h.name}
                    subtitle={[h.institution, h.memberName, depositLine(h, today), h.maturityDate ? t('matures {date}', { date: formatDate(h.maturityDate) }) : null].filter(Boolean).join(' · ')}
                    right={formatMoney(value(h))}
                  />
                ))}
              </Card>
            </View>
          );
        })}

        {maturing.length ? (
          <>
            <SectionTitle>{t('Maturing in the next 12 months')}</SectionTitle>
            <Card>
              {maturing.map((h) => (
                <ListRow key={h.id} onPress={() => router.push({ pathname: '/holdings/[id]', params: { id: h.id } })} title={h.name} subtitle={formatDate(h.maturityDate)} right={formatMoney(value(h))} />
              ))}
            </Card>
          </>
        ) : null}

        {closed.length ? (
          <>
            <SectionTitle>{t('Closed')}</SectionTitle>
            <Card>
              {closed.map((h) => (
                <ListRow key={h.id} onPress={() => router.push({ pathname: '/holdings/[id]', params: { id: h.id } })} title={h.name} subtitle={t(HOLDING_LABELS[h.type])} />
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
