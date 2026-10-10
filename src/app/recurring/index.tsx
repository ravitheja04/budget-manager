import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';

import { CategoryIcon, ListRow } from '@/components/forms';
import { Button, Card, colors, EmptyState, styles } from '@/components/ui';
import { listRecurring } from '@/db/queries';
import { t } from '@/i18n';
import { formatDate } from '@/lib/format';
import { frequencyLabel } from '@/lib/labels';
import { formatMoney } from '@/lib/money';
import { useQuery } from '@/lib/useQuery';

export default function RecurringList() {
  const db = useSQLiteContext();
  const load = useCallback(() => listRecurring(db), [db]);
  const { data } = useQuery(load);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('Recurring entries') }} />
      <ScrollView contentContainerStyle={styles.content}>
        {data && data.length === 0 ? (
          <EmptyState icon="repeat" title={t('No recurring entries')} message={t('Rent, salary, school fees, subscriptions, milk, maid’s salary: add them once and the app reminds you or logs them by itself.')} />
        ) : null}
        {data?.length ? (
          <Card>
            {data.map((r) => (
              <ListRow
                key={r.id}
                onPress={() => router.push({ pathname: '/recurring/edit', params: { id: r.id } })}
                left={<CategoryIcon icon={r.kind === 'transfer' ? 'swap-horizontal' : r.categoryIcon} color={r.kind === 'transfer' ? colors.muted : r.categoryColor} />}
                title={r.title}
                subtitle={
                  r.active
                    ? `${frequencyLabel(r.frequency)} · ${t('next {date}', { date: formatDate(r.nextDate) })} · ${r.autoLog ? t('logs by itself') : t('confirm when paid')}`
                    : t('Paused')
                }
                right={formatMoney(r.amount, { sign: r.kind === 'income' })}
                rightColor={r.kind === 'income' ? colors.okText : r.active ? undefined : colors.muted}
              />
            ))}
          </Card>
        ) : null}
        <Button title={t('Add recurring entry')} icon="add" onPress={() => router.push('/recurring/edit')} />
      </ScrollView>
    </View>
  );
}
