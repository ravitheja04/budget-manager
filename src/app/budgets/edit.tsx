import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { AmountField, CategoryGrid, confirmDelete, SwitchRow } from '@/components/forms';
import { Button, colors, Icon, styles } from '@/components/ui';
import { listCategories } from '@/db/queries';
import { getById, remove, save } from '@/db/repo';
import { t } from '@/i18n';
import type { Budget, Category } from '@/lib/types';
import { showError } from '@/lib/useQuery';

export default function EditBudget() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string; overall?: string; categoryId?: string }>();
  const [original, setOriginal] = useState<Budget | null>(null);
  const [overall, setOverall] = useState(params.overall === '1');
  const [categoryId, setCategoryId] = useState<string | null>(params.categoryId ?? null);
  const [amount, setAmount] = useState<number | null>(null);
  const [alerts, setAlerts] = useState(true);
  const [categories, setCategories] = useState<Category[]>([]);
  const [taken, setTaken] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      const [cats, budgets] = await Promise.all([listCategories(db, 'expense'), db.getAllAsync<Budget>('SELECT * FROM budgets')]);
      setCategories(cats);
      setTaken(new Set(budgets.filter((b) => b.id !== params.id).map((b) => b.categoryId ?? '')));
      if (params.id) {
        const b = await getById<Budget>(db, 'budgets', params.id);
        if (b) {
          setOriginal(b);
          setOverall(b.categoryId === null);
          setCategoryId(b.categoryId);
          setAmount(b.amount);
          setAlerts(!!b.alerts);
        }
      }
    })().catch((e) => showError(t('Could not load data'), e));
  }, [db, params.id]);

  async function onSave() {
    if (!amount) return Alert.alert(t('Enter the amount'));
    if (!overall && !categoryId) return Alert.alert(t('Choose a category'));
    const key = overall ? '' : categoryId!;
    if (taken.has(key)) return Alert.alert(t('There is already a budget for this. Edit that one instead.'));
    try {
      await save(db, 'budgets', { id: original?.id, categoryId: overall ? null : categoryId, amount, alerts: alerts ? 1 : 0, createdAt: original?.createdAt });
      router.back();
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: overall ? t('Monthly budget') : t('Category budget'),
          headerRight: params.id
            ? () => (
                <Pressable
                  hitSlop={12}
                  onPress={() =>
                    confirmDelete(t('this budget'), () =>
                      remove(db, 'budgets', params.id!)
                        .then(() => router.back())
                        .catch((e) => showError(t('Could not delete'), e))
                    )
                  }>
                  <Icon name="trash-outline" color={colors.danger} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        {overall ? <Text style={styles.body}>{t('A limit for all the family’s spending each month. Transfers, savings contributions and loan principal don’t count.')}</Text> : null}
        <AmountField label={t('Budget per month')} value={amount} onChange={setAmount} large />
        {!overall ? <CategoryGrid label={t('Category')} categories={categories.filter((c) => !taken.has(c.id) || c.id === categoryId)} value={categoryId} onChange={setCategoryId} /> : null}
        <SwitchRow label={t('Alert at 80% and 100%')} hint={t('Uses phone notifications when reminders are on in Settings.')} value={alerts} onChange={setAlerts} />
        <Button title={t('Save')} onPress={onSave} style={{ marginTop: 8 }} />
      </ScrollView>
    </View>
  );
}
