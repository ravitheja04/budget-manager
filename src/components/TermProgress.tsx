import { Text, View } from 'react-native';

import { t, tn } from '@/i18n';
import { formatDate } from '@/lib/format';
import { formatMoney } from '@/lib/money';
import type { Progress } from '@/lib/terms';
import { ProgressBar, Stat } from './forms';
import { Card, colors, styles } from './ui';

const yrs = (n: number) => (Number.isInteger(n) ? tn(n, '{n} year', '{n} years') : t('{n} years', { n }));

/**
 * Payments made against the paying term, what's left to pay, and how long
 * the cover (or the plan, until maturity) still runs.
 */
export function TermProgress({
  p,
  paidLabel,
  paidAmount,
  endLabel,
  end,
}: {
  p: Progress;
  /** "Premiums" or "Deposits". */
  paidLabel: string;
  /** Actual amount paid in, when known (holdings); otherwise payments × amount. */
  paidAmount?: number;
  /** "Cover ends" or "Matures". */
  endLabel: string;
  end: string | null;
}) {
  const ratio = p.totalCount ? p.paidCount / p.totalCount : 0;
  const perYear = p.perYear;
  const countText = perYear === 1 || p.totalCount === 1 ? null : p.totalCount ? t('{paid} of {total} payments', { paid: p.paidCount, total: p.totalCount }) : t('{paid} payments made', { paid: p.paidCount });
  return (
    <Card style={{ gap: 10 }}>
      <Text style={styles.title}>{paidLabel}</Text>
      {p.totalCount !== null ? (
        <>
          <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>
            {p.totalCount === 1 ? (p.finished ? t('Paid in one go') : t('Not paid yet')) : t('{paid} of {total} years paid', { paid: p.yearsPaid, total: p.yearsToPay ?? 0 })}
          </Text>
          {p.totalCount > 1 ? <ProgressBar ratio={ratio} color={p.finished ? colors.okText : colors.primary} /> : null}
          {countText ? <Text style={styles.hint}>{countText}</Text> : null}
        </>
      ) : (
        <Text style={styles.body}>{t('{n} paid so far. Add the paying term (years) to see what’s left.', { n: perYear === 1 ? yrs(p.paidCount) : tn(p.paidCount, '{n} payment', '{n} payments') })}</Text>
      )}
      <View style={styles.row}>
        <Stat label={t('Paid so far')} value={formatMoney(paidAmount ?? p.paidAmount)} />
        {p.leftAmount !== null ? <Stat label={p.finished ? t('Left to pay') : t('Still to pay (about)')} value={formatMoney(p.leftAmount)} align="right" /> : null}
      </View>
      {p.totalCount !== null && p.totalCount > 1 ? (
        <Text style={styles.hint}>
          {p.finished
            ? t('All payments done.')
            : t('{left} left to pay · last payment {date}', { left: yrs(p.yearsLeftToPay ?? 0), date: p.lastPayment ? formatDate(p.lastPayment) : '—' })}
        </Text>
      ) : null}
      {end ? (
        <View style={[styles.row, { borderTopWidth: 1, borderTopColor: colors.subtle, paddingTop: 10 }]}>
          <Stat label={endLabel} value={formatDate(end)} />
          <Stat label={t('Years left')} value={p.coverYearsLeft !== null ? yrs(p.coverYearsLeft) : '—'} align="right" />
        </View>
      ) : null}
      {end && p.coverYearsTotal ? <Text style={styles.hint}>{t('{total} in all, from the start date.', { total: yrs(p.coverYearsTotal) })}</Text> : null}
    </Card>
  );
}
