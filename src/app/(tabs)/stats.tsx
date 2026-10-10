import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { Donut } from '@/components/Donut';
import { CategoryIcon } from '@/components/forms';
import { Card, colors, EmptyState, Icon, styles } from '@/components/ui';
import { categoryTotals, firstEntryDate, movedOut } from '@/db/queries';
import { t, tn } from '@/i18n';
import { isValidDate, todayIso } from '@/lib/format';
import { formatMoney, formatMoneyShort } from '@/lib/money';
import { PERIOD_MODES, periodFor, periodLabel, shiftPeriod, topWithOther, type Period, type PeriodMode } from '@/lib/period';
import { useQuery } from '@/lib/useQuery';

type Kind = 'income' | 'expense';

const OTHER_COLOR = '#94A3B8';

const modeLabel = (m: PeriodMode) => ({ week: t('Week'), month: t('Month'), year: t('Year'), fy: t('FY'), custom: t('Period') })[m];

export default function Stats() {
  const db = useSQLiteContext();
  const [period, setPeriod] = useState<Period>(() => periodFor('month', todayIso()));
  const [kind, setKind] = useState<Kind>('expense');
  const [draftFrom, setDraftFrom] = useState<string | null>(null);
  const [draftTo, setDraftTo] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [income, expense, moved] = await Promise.all([categoryTotals(db, 'income', period.from, period.to), categoryTotals(db, 'expense', period.from, period.to), movedOut(db, period.from, period.to)]);
    return { income, expense, moved };
  }, [db, period]);
  const { data } = useQuery(load);

  async function chooseMode(mode: PeriodMode) {
    if (mode === 'custom') {
      const first = (await firstEntryDate(db)) ?? period.from;
      const next = { mode, from: first, to: todayIso() } as Period;
      setDraftFrom(next.from);
      setDraftTo(next.to);
      setPeriod(next);
    } else {
      // Keep looking at roughly the same time: the period of the new kind containing the current end date (or today).
      const anchor = period.to > todayIso() ? todayIso() : period.to;
      setPeriod(periodFor(mode, anchor));
    }
  }

  function applyCustom(from: string | null, to: string | null) {
    setDraftFrom(from);
    setDraftTo(to);
    if (from && to && isValidDate(from) && isValidDate(to) && from <= to) setPeriod({ mode: 'custom', from, to });
  }

  const rows = data ? data[kind] : [];
  const total = rows.reduce((s, r) => s + r.total, 0);
  const keyOf = (categoryId: string | null) => categoryId ?? 'none';
  const slices = topWithOther(
    rows.map((r) => ({ key: keyOf(r.categoryId), value: r.total, item: r })),
    6
  ).map((s) => ({
    key: s.key,
    value: s.value,
    color: s.item ? (s.item.color ?? OTHER_COLOR) : OTHER_COLOR,
    label: s.item ? t(s.item.name ?? 'Uncategorised') : t('Other'),
  }));
  const inPie = new Set(slices.map((s) => s.key));

  function openCategory(categoryId: string | null, name: string) {
    router.push({ pathname: '/txn/list', params: { categoryId: categoryId ?? '', kind, from: period.from, to: period.to, title: name } });
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        <View style={styles.chips}>
          {PERIOD_MODES.map((m) => (
            <Pressable key={m} onPress={() => chooseMode(m)} style={[styles.chip, period.mode === m && styles.chipSelected]} accessibilityRole="button" accessibilityState={{ selected: period.mode === m }}>
              <Text style={[styles.chipText, period.mode === m && styles.chipTextSelected]}>{modeLabel(m)}</Text>
            </Pressable>
          ))}
        </View>

        {period.mode === 'custom' ? (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}>
              <DateField label={t('From')} value={draftFrom} onChange={(v) => applyCustom(v, draftTo)} />
            </View>
            <View style={{ flex: 1 }}>
              <DateField label={t('To')} value={draftTo} onChange={(v) => applyCustom(draftFrom, v)} />
            </View>
          </View>
        ) : (
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Pressable onPress={() => setPeriod(shiftPeriod(period, -1))} hitSlop={12} accessibilityLabel={t('Previous')}>
              <Icon name="chevron-back" color={colors.primary} />
            </Pressable>
            <Text style={styles.title}>{periodLabel(period)}</Text>
            <Pressable onPress={() => setPeriod(shiftPeriod(period, 1))} hitSlop={12} accessibilityLabel={t('Next')}>
              <Icon name="chevron-forward" color={colors.primary} />
            </Pressable>
          </View>
        )}

        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: colors.border }}>
          {(['income', 'expense'] as Kind[]).map((k) => {
            const selected = kind === k;
            const sum = data ? data[k].reduce((s, r) => s + r.total, 0) : 0;
            return (
              <Pressable
                key={k}
                onPress={() => setKind(k)}
                accessibilityRole="tab"
                accessibilityState={{ selected }}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 10, borderBottomWidth: 3, borderBottomColor: selected ? colors.primary : 'transparent', marginBottom: -1 }}>
                <Text style={{ fontSize: 13, color: selected ? colors.text : colors.muted, fontWeight: selected ? '700' : '500' }}>{k === 'income' ? t('Income') : t('Expenses')}</Text>
                <Text style={{ fontSize: 16, color: selected ? (k === 'income' ? colors.okText : colors.text) : colors.muted, fontWeight: '700', marginTop: 2 }}>{formatMoney(sum)}</Text>
              </Pressable>
            );
          })}
        </View>

        {data && rows.length === 0 ? (
          <EmptyState icon="pie-chart-outline" title={t('Nothing in this period')} message={kind === 'income' ? t('No income was logged between these dates.') : t('No spending was logged between these dates.')} />
        ) : null}

        {rows.length ? (
          <Card style={{ paddingHorizontal: 4 }}>
            <Donut
              slices={slices}
              centerTop={formatMoneyShort(total)}
              centerBottom={kind === 'income' ? t('income') : t('spent')}
              onSlicePress={(key) => {
                const r = rows.find((x) => keyOf(x.categoryId) === key);
                if (r) openCategory(r.categoryId, t(r.name ?? 'Uncategorised'));
              }}
            />
          </Card>
        ) : null}

        {kind === 'expense' && data?.moved ? (
          <Text style={styles.hint}>{t('Also {amount} moved to savings or loan principal (chits, SSY, EMIs…), not counted as spending.', { amount: formatMoney(data.moved) })}</Text>
        ) : null}

        {rows.length ? (
          <Card>
            {rows.map((r) => {
              const share = total ? r.total / total : 0;
              const color = inPie.has(keyOf(r.categoryId)) ? (r.color ?? OTHER_COLOR) : OTHER_COLOR;
              const name = t(r.name ?? 'Uncategorised');
              return (
                <Pressable key={keyOf(r.categoryId)} onPress={() => openCategory(r.categoryId, name)} style={({ pressed }) => [styles.row, { paddingVertical: 9 }, pressed && styles.pressed]}>
                  <View style={{ width: 52, paddingVertical: 4, borderRadius: 6, borderLeftWidth: 4, borderLeftColor: color, backgroundColor: colors.subtle, alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.text }}>{Math.round(share * 100)}%</Text>
                  </View>
                  <CategoryIcon icon={r.icon} color={r.color} size={30} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.body} numberOfLines={1}>
                      {name}
                    </Text>
                    <Text style={styles.hint}>{tn(r.count, '{n} entry', '{n} entries')}</Text>
                  </View>
                  <Text style={[styles.title, { fontSize: 15 }]}>{formatMoney(r.total)}</Text>
                </Pressable>
              );
            })}
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}
