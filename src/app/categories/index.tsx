import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { CategoryIcon, ListRow, Segmented } from '@/components/forms';
import { Button, Card, styles } from '@/components/ui';
import { listCategories } from '@/db/queries';
import { t } from '@/i18n';
import type { CategoryKind } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

export default function Categories() {
  const db = useSQLiteContext();
  const [kind, setKind] = useState<CategoryKind>('expense');
  const load = useCallback(() => listCategories(db, kind), [db, kind]);
  const { data } = useQuery(load);
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('Categories') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Segmented
          options={[
            { value: 'expense', label: t('Expense') },
            { value: 'income', label: t('Income') },
          ]}
          value={kind}
          onChange={setKind}
        />
        <Card>
          {data?.map((c) => (
            <ListRow key={c.id} onPress={() => router.push({ pathname: '/categories/edit', params: { id: c.id } })} left={<CategoryIcon icon={c.icon} color={c.color} size={36} />} title={t(c.name)} />
          ))}
        </Card>
        <Button title={t('Add a category')} icon="add" onPress={() => router.push({ pathname: '/categories/edit', params: { kind } })} />
      </ScrollView>
    </View>
  );
}
