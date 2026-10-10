import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useMemo, useState } from 'react';
import { Pressable, SectionList, Text, TextInput, View } from 'react-native';

import { RecordPicker, Segmented, Stat } from '@/components/forms';
import { DayHeader, QuickAddButton, TxnRow } from '@/components/rows';
import { Card, colors, EmptyState, Icon, styles } from '@/components/ui';
import { listAccounts, listCategories, listMembers, listTransactions, type TxnRow as Row } from '@/db/queries';
import { t } from '@/i18n';
import { addMonths, monthRange, monthTitle } from '@/lib/dates';
import { todayIso } from '@/lib/format';
import { txnKindLabel } from '@/lib/labels';
import { formatMoney } from '@/lib/money';
import type { TxnKind } from '@/lib/types';
import { useQuery } from '@/lib/useQuery';

type KindFilter = 'all' | TxnKind;

export default function Transactions() {
  const db = useSQLiteContext();
  const [month, setMonth] = useState(todayIso().slice(0, 7) + '-01');
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<KindFilter>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const searching = search.trim().length > 0;
    const range = monthRange(month);
    const [txns, categories, accounts, members] = await Promise.all([
      listTransactions(db, {
        from: searching ? undefined : range.start,
        to: searching ? undefined : range.end,
        kind: kind === 'all' ? null : kind,
        categoryId,
        accountId,
        memberId,
        search,
        limit: searching ? 300 : 2000,
      }),
      listCategories(db),
      listAccounts(db, true),
      listMembers(db),
    ]);
    return { txns, categories, accounts, members };
  }, [db, month, search, kind, categoryId, accountId, memberId]);
  const { data } = useQuery(load);

  const sections = useMemo(() => {
    const byDay = new Map<string, Row[]>();
    for (const txn of data?.txns ?? []) {
      const list = byDay.get(txn.date) ?? [];
      list.push(txn);
      byDay.set(txn.date, list);
    }
    return [...byDay.entries()].map(([date, rows]) => ({
      date,
      data: rows,
      spent: rows.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0),
      income: rows.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0),
    }));
  }, [data]);

  const totals = useMemo(() => {
    const txns = data?.txns ?? [];
    return {
      income: txns.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0),
      expense: txns.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0),
    };
  }, [data]);

  const searching = search.trim().length > 0;
  const activeFilters = [categoryId, accountId, memberId].filter(Boolean).length;

  const header = (
    <View style={{ gap: 12 }}>
      <View style={[styles.input, styles.row, { paddingVertical: 0 }]}>
        <Icon name="search" color={colors.muted} size={18} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder={t('Search payee, notes, category or amount')}
          placeholderTextColor={colors.placeholder}
          style={{ flex: 1, minWidth: 0, paddingVertical: 11, color: colors.text, fontSize: 15 }}
        />
        {search ? (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Icon name="close-circle" color={colors.muted} size={18} />
          </Pressable>
        ) : null}
        <Pressable onPress={() => setShowFilters((v) => !v)} hitSlop={8} accessibilityLabel={t('Filters')}>
          <Icon name={activeFilters ? 'funnel' : 'funnel-outline'} color={activeFilters ? colors.primary : colors.muted} size={18} />
        </Pressable>
      </View>

      {!searching ? (
        <View style={[styles.row, { justifyContent: 'space-between' }]}>
          <Pressable onPress={() => setMonth(addMonths(month, -1))} hitSlop={12} accessibilityLabel={t('Previous month')}>
            <Icon name="chevron-back" color={colors.primary} />
          </Pressable>
          <Text style={styles.title}>{monthTitle(month)}</Text>
          <Pressable onPress={() => setMonth(addMonths(month, 1))} hitSlop={12} accessibilityLabel={t('Next month')}>
            <Icon name="chevron-forward" color={colors.primary} />
          </Pressable>
        </View>
      ) : null}

      <Segmented
        options={(['all', 'expense', 'income', 'transfer'] as KindFilter[]).map((k) => ({ value: k, label: k === 'all' ? t('All') : txnKindLabel(k) }))}
        value={kind}
        onChange={setKind}
      />

      {showFilters && data ? (
        <Card style={{ gap: 12 }}>
          <RecordPicker
            label={t('Category')}
            items={data.categories.filter((c) => kind === 'all' || c.kind === kind)}
            value={categoryId}
            onChange={setCategoryId}
            getLabel={(c) => t(c.name)}
            allowNone
            noneLabel={t('Any')}
          />
          <RecordPicker label={t('Account')} items={data.accounts} value={accountId} onChange={setAccountId} getLabel={(a) => a.name} allowNone noneLabel={t('Any')} />
          {data.members.length ? (
            <RecordPicker label={t('Family member')} items={data.members} value={memberId} onChange={setMemberId} getLabel={(m) => m.name} allowNone noneLabel={t('Anyone')} />
          ) : null}
        </Card>
      ) : null}

      <Card>
        <View style={styles.row}>
          <Stat label={t('Income')} value={formatMoney(totals.income)} color={colors.okText} />
          <Stat label={t('Spent')} value={formatMoney(totals.expense)} />
          <Stat label={t('Net')} value={formatMoney(totals.income - totals.expense)} align="right" />
        </View>
      </Card>

      <Pressable onPress={() => router.push('/recurring')} style={[styles.row, { paddingVertical: 2 }]}>
        <Icon name="repeat" color={colors.primary} size={18} />
        <Text style={{ color: colors.primary, fontWeight: '600', flex: 1 }}>{t('Recurring entries (rent, salary, fees…)')}</Text>
        <Icon name="chevron-forward" color={colors.muted} size={18} />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.screen}>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.content, { paddingBottom: 96 }]}
        ListHeaderComponent={header}
        renderSectionHeader={({ section }) => <DayHeader date={section.date} spent={section.spent} income={section.income} />}
        renderItem={({ item }) => (
          <View style={{ backgroundColor: colors.card, borderRadius: 12, paddingHorizontal: 12 }}>
            <TxnRow txn={item} />
          </View>
        )}
        ItemSeparatorComponent={() => <View style={{ height: 6 }} />}
        stickySectionHeadersEnabled={false}
        ListEmptyComponent={data ? <EmptyState icon="receipt-outline" title={t('Nothing here')} message={searching ? t('No entries match your search.') : t('No entries this month yet.')} /> : null}
      />
      <QuickAddButton />
    </View>
  );
}
