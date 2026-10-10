import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { CategoryIcon, ProgressBar } from '@/components/forms';
import { Button, Card, colors, EmptyState, Icon, SectionTitle, styles } from '@/components/ui';
import { listBudgets, monthSpendByCategory, listCategories, type BudgetRow } from '@/db/queries';
import { t } from '@/i18n';
import { budgetProgress } from '@/lib/budget';
import { monthTitle } from '@/lib/dates';
import { todayIso } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useQuery } from '@/lib/useQuery';

export default function Budgets() {
  const db = useSQLiteContext();
  const load = useCallback(async () => {
    const today = todayIso();
    const [budgets, spend, categories] = await Promise.all([listBudgets(db, today), monthSpendByCategory(db, today), listCategories(db, 'expense')]);
    const budgeted = new Set(budgets.map((b) => b.categoryId));
    const unbudgeted = categories.filter((c) => !budgeted.has(c.id) && (spend.get(c.id) ?? 0) > 0).map((c) => ({ ...c, spent: spend.get(c.id) ?? 0 }));
    return { today, budgets, unbudgeted };
  }, [db]);
  const { data } = useQuery(load);
  if (!data) return <View style={styles.screen} />;
  const { today, budgets, unbudgeted } = data;
  const overall = budgets.find((b) => b.categoryId === null);
  const perCategory = budgets.filter((b) => b.categoryId !== null);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        <Text style={[styles.title, { fontSize: 18 }]}>{monthTitle(today)}</Text>
        {overall ? (
          <BudgetCard b={overall} today={today} />
        ) : (
          <Card onPress={() => router.push({ pathname: '/budgets/edit', params: { overall: '1' } })}>
            <View style={styles.row}>
              <Icon name="add-circle" color={colors.primary} size={28} />
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{t('Set an overall monthly budget')}</Text>
                <Text style={styles.subtitle}>{t('One limit for everything the family spends in a month.')}</Text>
              </View>
            </View>
          </Card>
        )}

        <SectionTitle>{t('By category')}</SectionTitle>
        {perCategory.length === 0 ? (
          <EmptyState icon="pie-chart-outline" title={t('No category budgets')} message={t('Give groceries, eating out or shopping their own limit, and get a nudge at 80% and 100%.')} />
        ) : (
          perCategory.map((b) => <BudgetCard key={b.id} b={b} today={today} />)
        )}
        <Button title={t('Add a category budget')} icon="add" variant="secondary" onPress={() => router.push('/budgets/edit')} />

        {unbudgeted.length ? (
          <>
            <SectionTitle>{t('Spending without a budget')}</SectionTitle>
            <Card>
              {unbudgeted.map((c) => (
                <Pressable key={c.id} onPress={() => router.push({ pathname: '/budgets/edit', params: { categoryId: c.id } })} style={[styles.row, { paddingVertical: 8 }]}>
                  <CategoryIcon icon={c.icon} color={c.color} size={34} />
                  <Text style={[styles.body, { flex: 1 }]}>{t(c.name)}</Text>
                  <Text style={styles.title}>{formatMoney(c.spent)}</Text>
                </Pressable>
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function BudgetCard({ b, today }: { b: BudgetRow; today: string }) {
  const p = budgetProgress(b.spent, b.amount, today);
  const color = p.level === 'over' ? colors.danger : p.level === 'warn' ? colors.warnStrong : colors.primary;
  const name = b.categoryId ? t(b.categoryName ?? '') : t('Overall');
  return (
    <Card onPress={() => router.push({ pathname: '/budgets/edit', params: { id: b.id } })}>
      <View style={styles.row}>
        {b.categoryId ? <CategoryIcon icon={b.categoryIcon} color={b.categoryColor} size={34} /> : <CategoryIcon icon="wallet" color={colors.primary} size={34} />}
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{name}</Text>
          <Text style={styles.subtitle}>{t('{spent} of {budget}', { spent: formatMoney(b.spent), budget: formatMoney(b.amount) })}</Text>
        </View>
        <Text style={[styles.title, { color }]}>{Math.round(p.ratio * 100)}%</Text>
      </View>
      <ProgressBar ratio={p.ratio} marker={p.pace} color={color} />
      <Text style={[styles.hint, { marginTop: 6 }]}>
        {p.remaining >= 0
          ? t('{left} left · {days} days to go', { left: formatMoney(p.remaining), days: p.daysLeft })
          : t('{over} over budget', { over: formatMoney(-p.remaining) })}
      </Text>
    </Card>
  );
}
