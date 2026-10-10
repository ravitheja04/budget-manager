import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ListRow } from '@/components/forms';
import { Card, colors, styles } from '@/components/ui';
import { netWorth } from '@/db/queries';
import { t } from '@/i18n';
import { todayIso } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useQuery } from '@/lib/useQuery';

export default function NetWorth() {
  const db = useSQLiteContext();
  const load = useCallback(() => netWorth(db, todayIso()), [db]);
  const { data } = useQuery(load);
  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('Net worth') }} />
      {data ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <Text style={styles.hint}>{t('What the family owns minus what it owes')}</Text>
            <Text style={{ fontSize: 30, fontWeight: '800', color: data.total < 0 ? colors.danger : colors.text }}>{formatMoney(data.total)}</Text>
          </Card>
          <Card>
            <ListRow title={t('Accounts (bank, cash, wallets, cards)')} right={formatMoney(data.accounts)} onPress={() => router.push('/accounts')} />
            <ListRow title={t('Savings and investments')} right={formatMoney(data.holdings)} onPress={() => router.push('/savings')} />
            <ListRow title={t('Money lent, to come back')} right={formatMoney(data.lent)} onPress={() => router.push('/loans')} />
            <ListRow title={t('Loans outstanding')} right={`−${formatMoney(data.borrowed)}`} rightColor={colors.danger} onPress={() => router.push('/loans')} />
          </Card>
          <Text style={styles.hint}>{t('Values you enter by hand (funds, stocks, gold, property) are only as current as your last update.')}</Text>
        </ScrollView>
      ) : null}
    </View>
  );
}
