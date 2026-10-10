import { Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { FlatList, Text, View } from 'react-native';

import { TxnRow } from '@/components/rows';
import { EmptyState, styles } from '@/components/ui';
import { listTransactions } from '@/db/queries';
import { t, tn } from '@/i18n';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { TxnKind } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

/** Entries of one category between two dates (opened from Stats). An empty categoryId means uncategorised. */
export default function CategoryEntries() {
  const db = useSQLiteContext();
  const { categoryId, kind, from, to, title } = useLocalSearchParams<{ categoryId?: string; kind?: TxnKind; from: string; to: string; title?: string }>();
  const load = useCallback(
    () => listTransactions(db, { from, to, kind: kind ?? null, categoryId: categoryId || null, uncategorised: !categoryId, limit: 5000 }),
    [db, categoryId, kind, from, to]
  );
  const { data } = useQuery(load);
  const total = data?.reduce((s, r) => s + r.amount, 0) ?? 0;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: title || t('Entries') }} />
      <FlatList
        data={data ?? []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.content, { paddingBottom: 40 }]}
        ListHeaderComponent={
          <View style={{ marginBottom: 4 }}>
            <Text style={styles.hint}>
              {formatDate(from)} – {formatDate(to)}
            </Text>
            <Text style={[styles.title, { fontSize: 20, marginTop: 2 }]}>{formatMoney(total)}</Text>
            <Text style={styles.hint}>{tn(data?.length ?? 0, '{n} entry', '{n} entries')}</Text>
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ backgroundColor: styles.card.backgroundColor, borderRadius: 12, paddingHorizontal: 12 }}>
            <TxnRow txn={item} showDate />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        ListEmptyComponent={data ? <EmptyState icon="receipt-outline" title={t('Nothing here')} message={t('No entries in this period.')} /> : null}
      />
    </View>
  );
}
