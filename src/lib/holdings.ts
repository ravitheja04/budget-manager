import { fdValue, rdMaturity, rdMonths } from './finance';
import type { Holding, HoldingType } from './types';

export type AssetClass = 'equity' | 'debt' | 'gold' | 'cash' | 'property' | 'other';

export const HOLDING_TYPES: HoldingType[] = ['savings', 'fd', 'rd', 'ppf', 'ssy', 'epf', 'nps', 'mf', 'stocks', 'gold', 'postoffice', 'chit', 'property', 'other'];

/** Display names (passed through t() by the screens). */
export const HOLDING_LABELS: Record<HoldingType, string> = {
  savings: 'Savings account',
  fd: 'Fixed deposit',
  rd: 'Recurring deposit',
  ppf: 'PPF',
  ssy: 'Sukanya Samriddhi',
  epf: 'EPF / VPF',
  nps: 'NPS',
  mf: 'Mutual funds / SIP',
  stocks: 'Stocks',
  gold: 'Gold',
  postoffice: 'Post office scheme',
  chit: 'Chit fund',
  property: 'Real estate',
  other: 'Other',
};

export const HOLDING_ICONS: Record<HoldingType, string> = {
  savings: 'wallet',
  fd: 'lock-closed',
  rd: 'repeat',
  ppf: 'shield',
  ssy: 'flower',
  epf: 'business',
  nps: 'umbrella',
  mf: 'stats-chart',
  stocks: 'trending-up',
  gold: 'diamond',
  postoffice: 'mail',
  chit: 'people-circle',
  property: 'home',
  other: 'cube',
};

export const ASSET_CLASS: Record<HoldingType, AssetClass> = {
  savings: 'cash',
  fd: 'debt',
  rd: 'debt',
  ppf: 'debt',
  ssy: 'debt',
  epf: 'debt',
  nps: 'debt',
  mf: 'equity',
  stocks: 'equity',
  gold: 'gold',
  postoffice: 'debt',
  chit: 'other',
  property: 'property',
  other: 'other',
};

/** Which fields the form asks for, per type. */
export const HOLDING_FIELDS: Record<HoldingType, { rate?: boolean; dates?: boolean; contribution?: boolean; value?: boolean; payout?: boolean }> = {
  savings: { rate: true, value: true },
  fd: { rate: true, dates: true, payout: true },
  rd: { rate: true, dates: true, contribution: true },
  ppf: { rate: true, dates: true, contribution: true, value: true },
  ssy: { rate: true, dates: true, contribution: true, value: true },
  epf: { rate: true, contribution: true, value: true },
  nps: { contribution: true, value: true },
  mf: { contribution: true, value: true },
  stocks: { value: true },
  gold: { value: true },
  postoffice: { rate: true, dates: true, value: true },
  chit: { dates: true, contribution: true, value: true },
  property: { value: true },
  other: { rate: true, dates: true, contribution: true, value: true },
};

/**
 * What a holding is worth on `on`: the value typed in when there is one,
 * otherwise worked out (FD and RD) or what was put in.
 */
export function holdingValue(h: Holding, on: string) {
  if (h.closed) return 0;
  if (h.currentValue !== null) return h.currentValue;
  if (h.type === 'fd' && h.rate !== null && h.startDate) {
    const until = h.maturityDate && h.maturityDate < on ? h.maturityDate : on;
    return fdValue(h.invested, h.rate, h.startDate, until, !!h.payout);
  }
  return h.invested;
}

/** Expected value at maturity, where the app can work it out. */
export function maturityValue(h: Holding) {
  if (h.rate === null || !h.startDate || !h.maturityDate) return null;
  if (h.type === 'fd') return fdValue(h.invested, h.rate, h.startDate, h.maturityDate, !!h.payout);
  if (h.type === 'rd' && h.contribution) return rdMaturity(h.contribution, h.rate, rdMonths(h.startDate, h.maturityDate));
  return null;
}
