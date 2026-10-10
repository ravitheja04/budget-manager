import type { Frequency } from './dates';

/** All amounts are paise (integers); dates are ISO YYYY-MM-DD. */

export type Member = { id: string; name: string; relation: string; color: string; createdAt: string; updatedAt: string };

export type AccountKind = 'bank' | 'cash' | 'wallet' | 'card';
export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  openingBalance: number;
  /** Credit cards only. */
  cardLimit: number | null;
  dueDay: number | null;
  /** Credit cards: the day the statement is made. */
  statementDay: number | null;
  /** Credit cards: 1 = spends count in the month their bill is paid. */
  billMonth: number;
  archived: number;
  createdAt: string;
  updatedAt: string;
};

export type CategoryKind = 'expense' | 'income';
export type Category = { id: string; name: string; kind: CategoryKind; icon: string; color: string; sort: number; updatedAt: string };

export type TxnKind = 'expense' | 'income' | 'transfer';
/** What an entry was logged for, so a loan or policy can list its own payments. */
export type SourceType = 'recurring' | 'loan' | 'policy' | 'holding' | 'adjustment';
export type Txn = {
  id: string;
  kind: TxnKind;
  amount: number;
  date: string;
  /** The date it counts on in budgets and Stats; the 1st of the bill month for cards set up that way, else the same as date. */
  bookDate: string | null;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  memberId: string | null;
  payee: string;
  notes: string;
  sourceType: SourceType | null;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Recurring = {
  id: string;
  title: string;
  kind: TxnKind;
  amount: number;
  accountId: string | null;
  toAccountId: string | null;
  categoryId: string | null;
  memberId: string | null;
  frequency: Frequency;
  startDate: string;
  nextDate: string;
  /** 1: logged by itself on the date; 0: shown as due until confirmed. */
  autoLog: number;
  /** Days before the date to send a reminder; -1 for none. */
  reminderDays: number;
  active: number;
  createdAt: string;
  updatedAt: string;
};

/** categoryId null is the overall monthly budget. */
export type Budget = { id: string; categoryId: string | null; amount: number; /** Notify at 80% and 100%. */ alerts: number; createdAt: string; updatedAt: string };

export type HoldingType =
  | 'savings'
  | 'fd'
  | 'rd'
  | 'ppf'
  | 'ssy'
  | 'epf'
  | 'nps'
  | 'mf'
  | 'stocks'
  | 'gold'
  | 'postoffice'
  | 'chit'
  | 'property'
  | 'other';

export type Holding = {
  id: string;
  type: HoldingType;
  name: string;
  institution: string;
  memberId: string | null;
  nominee: string;
  /** Principal (FD) or total put in so far. */
  invested: number;
  /** Value entered by hand; null lets the app work it out (FD) or use what was put in. */
  currentValue: number | null;
  rate: number | null;
  startDate: string | null;
  maturityDate: string | null;
  /** FD interest paid out instead of added to the deposit. */
  payout: number;
  /** Regular contribution (SIP, RD instalment, chit instalment, PPF deposit). */
  contribution: number | null;
  contributionFrequency: Frequency | null;
  nextContributionDate: string | null;
  accountId: string | null;
  notes: string;
  closed: number;
  createdAt: string;
  updatedAt: string;
};

export type LoanDirection = 'borrowed' | 'lent';
export type Loan = {
  id: string;
  direction: LoanDirection;
  type: string;
  /** Lender (borrowed) or person (lent). */
  party: string;
  accountNumber: string;
  principal: number;
  rate: number;
  tenureMonths: number | null;
  /** Date of the first EMI (borrowed) or the date the money was given (lent). */
  startDate: string;
  emi: number | null;
  /** Lent money: when it should come back. */
  dueDate: string | null;
  accountId: string | null;
  memberId: string | null;
  notes: string;
  closed: number;
  createdAt: string;
  updatedAt: string;
};

/** "opening" stands for the EMIs paid before the loan was added to the app. */
export type LoanPaymentKind = 'emi' | 'prepayment' | 'repayment' | 'opening';
export type LoanPayment = {
  id: string;
  loanId: string;
  kind: LoanPaymentKind;
  date: string;
  amount: number;
  principal: number;
  interest: number;
  transactionId: string | null;
  /** How many EMIs an "opening" record covers. */
  emiCount: number | null;
  createdAt: string;
  updatedAt: string;
};

export type PolicyKind = 'health' | 'term' | 'life' | 'vehicle' | 'home' | 'accident' | 'other';
export type PremiumFrequency = Exclude<Frequency, 'weekly'> | 'single';

/** Extra details kept as JSON, depending on the kind of policy. */
export type HealthDetails = {
  coverType?: string;
  deductible?: number | null;
  noClaimBonus?: number | null;
  roomRent?: string;
  copay?: string;
  waitingPeriodEnds?: string | null;
  tpa?: string;
  tpaPhone?: string;
};
export type TermDetails = { riders?: string; mwpa?: boolean };
export type LifeDetails = { maturityAmount?: number | null };
export type PolicyDetails = HealthDetails & TermDetails & LifeDetails;

export type Policy = {
  id: string;
  kind: PolicyKind;
  insurer: string;
  planName: string;
  policyNumber: string;
  holderId: string | null;
  nominees: string;
  sumAssured: number;
  premium: number;
  frequency: PremiumFrequency;
  nextDue: string | null;
  graceDays: number;
  startDate: string | null;
  /** When the cover ends (term) or the policy matures (life). */
  endDate: string | null;
  agentName: string;
  agentPhone: string;
  helpline: string;
  details: string;
  accountId: string | null;
  notes: string;
  active: number;
  createdAt: string;
  updatedAt: string;
};

export type Attachment = { id: string; ownerType: string; ownerId: string; name: string; uri: string; mime: string; createdAt: string };
