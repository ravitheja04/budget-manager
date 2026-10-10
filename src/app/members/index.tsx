import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';

import { ListRow } from '@/components/forms';
import { Avatar, Button, Card, EmptyState, styles } from '@/components/ui';
import { listMembers } from '@/db/queries';
import { t } from '@/i18n';
import { useQuery } from '@/lib/useQuery';

export default function Members() {
  const db = useSQLiteContext();
  const load = useCallback(() => listMembers(db), [db]);
  const { data } = useQuery(load);
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('Family members') }} />
      <ScrollView contentContainerStyle={styles.content}>
        {data && data.length === 0 ? <EmptyState icon="people-outline" title={t('No family members yet')} message={t('Add the people in the family to tag who spent, whose policy it is and whose loan.')} /> : null}
        {data?.length ? (
          <Card>
            {data.map((m) => (
              <ListRow key={m.id} onPress={() => router.push({ pathname: '/members/edit', params: { id: m.id } })} left={<Avatar name={m.name} color={m.color} size={38} />} title={m.name} subtitle={t(m.relation)} />
            ))}
          </Card>
        ) : null}
        <Button title={t('Add a family member')} icon="person-add" onPress={() => router.push('/members/edit')} />
      </ScrollView>
    </View>
  );
}
