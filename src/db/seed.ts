import type { CategoryKind } from '@/lib/types';

type Seed = { id: string; name: string; kind: CategoryKind; icon: string; color: string };

/**
 * The categories a new install starts with (all editable). Ids are fixed so
 * entries logged by the app itself (EMIs, premiums) can point at them, and so
 * two phones restoring each other's backups agree on them.
 */
export const DEFAULT_CATEGORIES: Seed[] = [
  { id: 'exp-food', name: 'Food & groceries', kind: 'expense', icon: 'basket', color: '#16A34A' },
  { id: 'exp-eatout', name: 'Eating out', kind: 'expense', icon: 'restaurant', color: '#EA580C' },
  { id: 'exp-housing', name: 'Housing', kind: 'expense', icon: 'home', color: '#7C3AED' },
  { id: 'exp-utilities', name: 'Utilities', kind: 'expense', icon: 'flash', color: '#CA8A04' },
  { id: 'exp-transport', name: 'Transport', kind: 'expense', icon: 'car', color: '#0891B2' },
  { id: 'exp-education', name: 'Education', kind: 'expense', icon: 'school', color: '#4F46E5' },
  { id: 'exp-health', name: 'Health', kind: 'expense', icon: 'medkit', color: '#DC2626' },
  { id: 'exp-shopping', name: 'Shopping', kind: 'expense', icon: 'bag-handle', color: '#DB2777' },
  { id: 'exp-help', name: 'Household help', kind: 'expense', icon: 'people', color: '#059669' },
  { id: 'exp-entertainment', name: 'Entertainment & subscriptions', kind: 'expense', icon: 'film', color: '#9333EA' },
  { id: 'exp-travel', name: 'Travel', kind: 'expense', icon: 'airplane', color: '#0284C7' },
  { id: 'exp-gifts', name: 'Gifts & festivals', kind: 'expense', icon: 'gift', color: '#E11D48' },
  { id: 'exp-personal', name: 'Personal care', kind: 'expense', icon: 'cut', color: '#C026D3' },
  { id: 'exp-family', name: 'Family support', kind: 'expense', icon: 'heart', color: '#BE123C' },
  { id: 'exp-insurance', name: 'Insurance premiums', kind: 'expense', icon: 'shield-checkmark', color: '#2563EB' },
  { id: 'exp-loan-interest', name: 'Loan interest', kind: 'expense', icon: 'trending-down', color: '#B45309' },
  { id: 'exp-donations', name: 'Donations', kind: 'expense', icon: 'hand-left', color: '#65A30D' },
  { id: 'exp-taxes', name: 'Taxes', kind: 'expense', icon: 'document-text', color: '#475569' },
  { id: 'exp-bank', name: 'Bank charges', kind: 'expense', icon: 'card', color: '#64748B' },
  { id: 'exp-other', name: 'Other', kind: 'expense', icon: 'ellipsis-horizontal-circle', color: '#94A3B8' },
  { id: 'inc-salary', name: 'Salary', kind: 'income', icon: 'briefcase', color: '#16A34A' },
  { id: 'inc-business', name: 'Business/freelance', kind: 'income', icon: 'storefront', color: '#0891B2' },
  { id: 'inc-rent', name: 'Rent received', kind: 'income', icon: 'key', color: '#7C3AED' },
  { id: 'inc-interest', name: 'Interest', kind: 'income', icon: 'trending-up', color: '#CA8A04' },
  { id: 'inc-dividends', name: 'Dividends', kind: 'income', icon: 'pie-chart', color: '#4F46E5' },
  { id: 'inc-bonus', name: 'Bonus', kind: 'income', icon: 'star', color: '#EA580C' },
  { id: 'inc-gifts', name: 'Gifts received', kind: 'income', icon: 'gift', color: '#DB2777' },
  { id: 'inc-refunds', name: 'Refunds/cashback', kind: 'income', icon: 'return-down-back', color: '#059669' },
  { id: 'inc-loan-return', name: 'Money returned', kind: 'income', icon: 'cash', color: '#0D9488' },
  { id: 'inc-other', name: 'Other income', kind: 'income', icon: 'ellipsis-horizontal-circle', color: '#94A3B8' },
];

export const CATEGORY_IDS = {
  insurance: 'exp-insurance',
  loanInterest: 'exp-loan-interest',
  interestIncome: 'inc-interest',
  loanReturn: 'inc-loan-return',
};
