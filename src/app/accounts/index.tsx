import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, View } from 'react-native';

import { CategoryIcon, ListRow } from '@/components/forms';
import { Button, Card, colors, SectionTitle, styles } from '@/components/ui';
import { listAccounts } from '@/db/queries';
import { t } from '@/i18n';
import { ACCOUNT_ICONS, accountKindLabel } from '@/lib/labels';
import { formatMoney } from '@/lib/money';
import { useQuery } from '@/lib/useQuery';

export default function Accounts() {
  const db = useSQLiteContext();
  const load = useCallback(() => listAccounts(db, true), [db]);
  const { data } = useQuery(load);
  const active = data?.filter((a) => !a.archived) ?? [];
  const archived = data?.filter((a) => a.archived) ?? [];
  const total = active.reduce((s, a) => s + a.balance, 0);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('Accounts') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          {active.map((a) => (
            <ListRow
              key={a.id}
              onPress={() => router.push({ pathname: '/accounts/[id]', params: { id: a.id } })}
              left={<CategoryIcon icon={ACCOUNT_ICONS[a.kind]} color={colors.primary} size={36} />}
              title={a.name}
              subtitle={accountKindLabel(a.kind)}
              right={a.kind === 'card' ? formatMoney(Math.max(0, -a.balance)) : formatMoney(a.balance)}
              rightSub={a.kind === 'card' ? t('outstanding') : null}
              rightColor={a.balance < 0 ? colors.danger : undefined}
            />
          ))}
          <ListRow title={t('Total')} right={formatMoney(total)} rightColor={total < 0 ? colors.danger : undefined} />
        </Card>
        <Button title={t('Add an account')} icon="add" onPress={() => router.push('/accounts/edit')} />
        {archived.length ? (
          <>
            <SectionTitle>{t('Archived')}</SectionTitle>
            <Card>
              {archived.map((a) => (
                <ListRow key={a.id} onPress={() => router.push({ pathname: '/accounts/[id]', params: { id: a.id } })} title={a.name} subtitle={accountKindLabel(a.kind)} right={formatMoney(a.balance)} />
              ))}
            </Card>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}
