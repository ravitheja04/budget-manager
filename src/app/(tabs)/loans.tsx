import { router } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback } from 'react';
import { ScrollView, Text, View } from 'react-native';

import { ProgressBar, Stat } from '@/components/forms';
import { Button, Card, colors, EmptyState, SectionTitle, styles } from '@/components/ui';
import { listLoans, type LoanWithStatus } from '@/db/queries';
import { t } from '@/i18n';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import { useQuery } from '@/lib/useQuery';

export default function Loans() {
  const db = useSQLiteContext();
  const load = useCallback(() => listLoans(db), [db]);
  const { data } = useQuery(load);
  if (!data) return <View style={styles.screen} />;

  const borrowed = data.filter((l) => l.loan.direction === 'borrowed' && !l.loan.closed);
  const lent = data.filter((l) => l.loan.direction === 'lent' && !l.loan.closed);
  const closed = data.filter((l) => l.loan.closed);
  const owed = borrowed.reduce((s, l) => s + l.status.outstanding, 0);
  const monthlyEmi = borrowed.reduce((s, l) => s + (l.loan.emi ?? 0), 0);
  const toCome = lent.reduce((s, l) => s + l.status.outstanding, 0);

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        {data.length === 0 ? (
          <EmptyState icon="cash-outline" title={t('No loans')} message={t('Home, car, personal or gold loans, and money lent to family or friends. See the EMI split, what’s left and when it ends.')} />
        ) : (
          <Card>
            <View style={styles.row}>
              <Stat label={t('Still owed')} value={formatMoney(owed)} color={owed ? colors.danger : undefined} />
              <Stat label={t('EMIs a month')} value={formatMoney(monthlyEmi)} />
              <Stat label={t('To get back')} value={formatMoney(toCome)} color={toCome ? colors.okText : undefined} align="right" />
            </View>
          </Card>
        )}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Button title={t('Add a loan')} icon="add" onPress={() => router.push({ pathname: '/loans/edit', params: { direction: 'borrowed' } })} style={{ flex: 1 }} />
          <Button title={t('Money lent')} icon="add" variant="secondary" onPress={() => router.push({ pathname: '/loans/edit', params: { direction: 'lent' } })} style={{ flex: 1 }} />
        </View>

        {borrowed.length ? <SectionTitle>{t('Borrowed')}</SectionTitle> : null}
        {borrowed.map((l) => (
          <LoanCard key={l.loan.id} l={l} />
        ))}
        {lent.length ? <SectionTitle>{t('Lent')}</SectionTitle> : null}
        {lent.map((l) => (
          <LoanCard key={l.loan.id} l={l} />
        ))}
        {closed.length ? <SectionTitle>{t('Closed')}</SectionTitle> : null}
        {closed.map((l) => (
          <LoanCard key={l.loan.id} l={l} />
        ))}
      </ScrollView>
    </View>
  );
}

function LoanCard({ l }: { l: LoanWithStatus }) {
  const { loan, status } = l;
  const line =
    loan.closed
      ? t('Closed')
      : loan.direction === 'borrowed'
        ? [status.nextEmiDate ? t('Next EMI {date}', { date: formatDate(status.nextEmiDate) }) : null, status.emisLeft !== null ? t('{n} EMIs left', { n: status.emisLeft }) : null].filter(Boolean).join(' · ')
        : loan.dueDate
          ? t('Due back {date}', { date: formatDate(loan.dueDate) })
          : t('No return date');
  return (
    <Card onPress={() => router.push({ pathname: '/loans/[id]', params: { id: loan.id } })}>
      <View style={[styles.row, { alignItems: 'flex-start' }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{loan.party}</Text>
          <Text style={styles.subtitle}>{[t(loan.type), l.memberName].filter(Boolean).join(' · ')}</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={styles.title}>{formatMoney(status.outstanding)}</Text>
          <Text style={styles.subtitle}>{loan.direction === 'borrowed' ? t('outstanding') : t('to get back')}</Text>
        </View>
      </View>
      <ProgressBar ratio={status.progress} color={loan.direction === 'borrowed' ? colors.primary : colors.okText} />
      <Text style={[styles.hint, { marginTop: 6 }]}>{line}</Text>
    </Card>
  );
}
