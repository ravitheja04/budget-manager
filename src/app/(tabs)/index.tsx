import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ProgressBar, Stat } from '@/components/forms';
import { DueRow, QuickAddButton, TxnRow } from '@/components/rows';
import { Button, Card, colors, EmptyState, Icon, SectionTitle, styles } from '@/components/ui';
import { listBudgets, listTransactions, loadDues, monthTotals, netWorth } from '@/db/queries';
import { t } from '@/i18n';
import { budgetProgress } from '@/lib/budget';
import { monthTitle } from '@/lib/dates';
import { todayIso } from '@/lib/format';
import { formatMoney, formatMoneyShort } from '@/lib/money';
import { setHideAmounts, useHideAmounts } from '@/lib/prefs';
import { useQuery } from '@/lib/useQuery';

export default function Home() {
  const db = useSQLiteContext();
  const hidden = useHideAmounts();
  const load = useCallback(async () => {
    const today = todayIso();
    const [totals, budgets, dues, worth, recent] = await Promise.all([monthTotals(db, today), listBudgets(db, today), loadDues(db, today, 7), netWorth(db, today), listTransactions(db, { limit: 10 })]);
    return { today, totals, budgets, dues, worth, recent };
  }, [db]);
  const { data, refresh } = useQuery(load);

  if (!data) return <View style={styles.screen} />;
  const { today, totals, budgets, dues, worth, recent } = data;
  const money = (p: number) => (hidden ? '₹••••' : formatMoney(p));
  const overall = budgets.find((b) => b.categoryId === null);
  const progress = overall ? budgetProgress(totals.expense, overall.amount, today) : null;
  const overBudgets = budgets.filter((b) => b.categoryId && b.amount > 0 && b.spent / b.amount >= 0.8);
  const saved = totals.income - totals.expense;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 96 }]}>
        <Card>
          <View style={[styles.row, { justifyContent: 'space-between' }]}>
            <Text style={styles.sectionTitle}>{monthTitle(today)}</Text>
            <Pressable
              onPress={() => setHideAmounts(db, !hidden)}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel={hidden ? t('Show amounts') : t('Hide amounts')}>
              <Icon name={hidden ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
            </Pressable>
          </View>
          <View style={[styles.row, { marginTop: 10 }]}>
            <Stat label={t('Income')} value={money(totals.income)} color={colors.okText} />
            <Stat label={t('Spent')} value={money(totals.expense)} />
            <Stat label={t('Saved')} value={money(saved)} color={saved < 0 ? colors.danger : undefined} align="right" />
          </View>
          {progress ? (
            <>
              <ProgressBar ratio={progress.ratio} marker={progress.pace} color={progress.level === 'over' ? colors.danger : progress.level === 'warn' ? colors.warnStrong : colors.primary} />
              <Text style={[styles.hint, { marginTop: 6 }]}>
                {progress.remaining >= 0
                  ? t('{left} left of {budget} · {days} days to go', { left: money(progress.remaining), budget: money(progress.budget), days: progress.daysLeft })
                  : t('{over} over the {budget} budget', { over: money(-progress.remaining), budget: money(progress.budget) })}
              </Text>
            </>
          ) : (
            <Pressable onPress={() => router.push({ pathname: '/budgets/edit', params: { overall: '1' } })}>
              <Text style={[styles.hint, { marginTop: 10, color: colors.primary }]}>{t('Set a monthly budget to see what’s left')}</Text>
            </Pressable>
          )}
        </Card>

        <SectionTitle
          action={
            <Pressable onPress={() => router.push('/upcoming')} hitSlop={8}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('All upcoming')}</Text>
            </Pressable>
          }>
          {t('Needs attention')}
        </SectionTitle>
        <Card>
          {dues.length === 0 && overBudgets.length === 0 ? (
            <View style={[styles.row, { paddingVertical: 6 }]}>
              <Icon name="checkmark-circle" color={colors.okText} />
              <Text style={styles.body}>{t('Nothing due in the next 7 days.')}</Text>
            </View>
          ) : null}
          {dues.map((d) => (
            <DueRow key={d.key} item={d} onChanged={refresh} />
          ))}
          {overBudgets.map((b) => (
            <Pressable key={b.id} onPress={() => router.push('/budgets')} style={[styles.row, { paddingVertical: 8 }]}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.warnBg, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="pie-chart" size={20} color={colors.warnStrong} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{t('{name} budget', { name: t(b.categoryName ?? '') })}</Text>
                <Text style={styles.subtitle}>{t('{pct}% used', { pct: Math.round((b.spent / b.amount) * 100) })}</Text>
              </View>
              <Text style={[styles.title, { color: b.spent >= b.amount ? colors.danger : colors.warnStrong }]}>{money(b.spent)}</Text>
            </Pressable>
          ))}
        </Card>

        <SectionTitle>{t('Net worth')}</SectionTitle>
        <Card onPress={() => router.push('/networth')}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: worth.total < 0 ? colors.danger : colors.text }}>{hidden ? '₹••••' : formatMoneyShort(worth.total)}</Text>
          <Text style={styles.hint}>
            {t('Accounts {a} + savings {s} − loans {l}', {
              a: hidden ? '••' : formatMoneyShort(worth.accounts),
              s: hidden ? '••' : formatMoneyShort(worth.holdings + worth.lent),
              l: hidden ? '••' : formatMoneyShort(worth.borrowed),
            })}
          </Text>
        </Card>

        <SectionTitle
          action={
            <Pressable onPress={() => router.push('/transactions')} hitSlop={8}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('See all')}</Text>
            </Pressable>
          }>
          {t('Recent entries')}
        </SectionTitle>
        <Card>
          {recent.length === 0 ? (
            <EmptyState icon="receipt-outline" title={t('No entries yet')} message={t('Tap + to log an expense or income. It takes a few seconds.')} />
          ) : (
            recent.map((txn) => (hidden ? null : <TxnRow key={txn.id} txn={txn} showDate />))
          )}
          {hidden && recent.length ? <Text style={styles.hint}>{t('Amounts are hidden. Tap the eye to show them.')}</Text> : null}
        </Card>
        {recent.length === 0 ? <Button title={t('Set up accounts and family')} variant="secondary" icon="settings-outline" onPress={() => router.push('/settings')} /> : null}
      </ScrollView>
      <QuickAddButton />
    </View>
  );
}
