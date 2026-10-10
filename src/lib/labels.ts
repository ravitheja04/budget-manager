import { t } from '@/i18n';
import type { Frequency } from './dates';
import type { AccountKind, PolicyKind, PremiumFrequency, TxnKind } from './types';

/** Display text for the app's fixed choices, translated at the time they are shown. */

export const frequencyLabel = (f: Frequency | PremiumFrequency) =>
  ({
    weekly: t('Weekly'),
    monthly: t('Monthly'),
    quarterly: t('Quarterly'),
    halfyearly: t('Half-yearly'),
    yearly: t('Yearly'),
    single: t('Single premium'),
  })[f];

export const accountKindLabel = (k: AccountKind) => ({ bank: t('Bank account'), cash: t('Cash'), wallet: t('Wallet / UPI'), card: t('Credit card') })[k];

export const ACCOUNT_ICONS: Record<AccountKind, string> = { bank: 'business', cash: 'cash', wallet: 'phone-portrait', card: 'card' };

export const txnKindLabel = (k: TxnKind) => ({ expense: t('Expense'), income: t('Income'), transfer: t('Transfer') })[k];

export const POLICY_KINDS: PolicyKind[] = ['health', 'term', 'life', 'vehicle', 'home', 'accident', 'other'];

export const policyKindLabel = (k: PolicyKind) =>
  ({
    health: t('Health'),
    term: t('Term life'),
    life: t('Life / endowment / ULIP'),
    vehicle: t('Vehicle'),
    home: t('Home'),
    accident: t('Personal accident'),
    other: t('Other'),
  })[k];

export const POLICY_ICONS: Record<PolicyKind, string> = {
  health: 'medkit',
  term: 'umbrella',
  life: 'leaf',
  vehicle: 'car',
  home: 'home',
  accident: 'bandage',
  other: 'document',
};

export const HEALTH_COVER_TYPES = ['Individual', 'Family floater', 'Top-up / super top-up', 'Employer group', 'Senior citizen', 'Critical illness'];

export const LOAN_TYPES_BORROWED = ['Home', 'Car', 'Two-wheeler', 'Personal', 'Education', 'Gold', 'Credit-card EMI', 'Consumer durable', 'Family/friends', 'Other'];
export const LOAN_TYPES_LENT = ['Family', 'Friend', 'Other'];

/** "in 3 days", "today", "2 days late". */
export function relativeDue(days: number) {
  if (days === 0) return t('today');
  if (days === 1) return t('tomorrow');
  if (days === -1) return t('1 day late');
  if (days < 0) return t('{n} days late', { n: -days });
  return t('in {n} days', { n: days });
}
