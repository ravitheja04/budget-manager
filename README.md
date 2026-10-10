# Budget Logger

A private, offline money app for Indian families (Android and iOS, built with Expo). It keeps expenses and income, budgets, savings and investments, loans and insurance policies in one place, and reminds you before anything is due. All data stays on the phone in SQLite: no accounts, no bank logins, no servers.

The full feature plan is in [docs/features.md](docs/features.md).

## What's in this version (phase 1)

- **Home**: this month's income, spending and savings against the budget (with a marker for where you should be by today), items needing attention in the next 7 days, net worth, recent entries, and a quick-add button. A "hide amounts" eye icon covers the numbers when others are looking.
- **Stats**: income and spending by category for a week, month, calendar year, financial year (April–March) or any date range, as a donut chart (top six categories plus "Other") with a full list of shares, amounts and entry counts. Tap a category to see its entries. Money moved to savings or loan principal is shown separately, not as spending.
- **Transactions**: quick add (amount, then category, then save), with expense, income and transfer types. Optional payee, family member, notes and receipt photos or PDFs. Grouped by day with daily totals. You can search, filter by category, account or member, and step through months.
- **Recurring entries**: rent, salary, fees, subscriptions. Each one either logs itself on the day or stays "due" until you confirm it, with a reminder.
- **Accounts**: bank, cash, wallets/UPI and credit cards, each with a running balance. Cards track the limit, statement day, due day and amount outstanding. A card with a statement day shows what's billed (and when it's due) separately from unbilled spends, and "pay the bill" fills in the billed amount. Optionally a card's spends count in the month their bill is paid: with a statement on the 18th and a due date on the 6th, a spend on 25 Sep counts in November in budgets and Stats while keeping its real date. "Match with the bank balance" records the difference as an adjustment.
- **Budgets**: an overall monthly budget plus per-category budgets, with progress against the month's pace. Alerts at 80% and 100%.
- **Savings and investments**: FD, RD, PPF, SSY, EPF, NPS, mutual funds/SIP, stocks, gold, post-office schemes, chit funds, property. FD values are worked out with quarterly compounding; FD/RD maturity amounts are estimated. Also covers contributions (mark paid or skip), nominees, the next 12 months of maturities and an asset-allocation bar.
- **Loans**: borrowed money (with EMI) and money lent. The EMI is worked out on the reducing balance. You get outstanding principal, interest paid, EMIs left and the closure date, a full repayment schedule, and a prepayment calculator. Marking an EMI paid logs the interest as an expense and the principal as a transfer. A loan added part-way through can count its earlier EMIs as already paid.
- **Premium and deposit terms**: for policies (term, LIC, health) and schemes (Sukanya Samriddhi, PPF, RD) whose payments run for fewer years than the cover or maturity, the policy or holding screen shows years paid out of the paying term, years left to pay, the amount paid so far and still to pay, and years of cover or until maturity left. Reminders stop after the last payment. For Sukanya Samriddhi the app fills in 15 years of deposits and maturity at 21 years; for PPF, 15 years.
- **Policies** (the Insurance tab): every policy, with extra fields for health cover (cover type, deductible, NCB, room rent, co-pay, waiting period, TPA) and term cover (riders, MWPA). It also shows cover per person, premiums per year, the grace period, call buttons for the insurer, agent and TPA, and attached policy documents. Marking a premium paid logs it and moves the due date on.
- **Upcoming**: one list of everything due in the next 60 days (bills, EMIs, premiums, contributions, card bills, maturities, policy end dates, lent money), plus anything overdue.
- **Reminders**: opt-in phone notifications before each due date (premiums at 30, 15, 7 and 1 day before), plus budget alerts.
- **Import from a spreadsheet** (Settings → Import): bring in history from a Money Manager export, any Excel sheet (.xlsx) or a CSV, including bank statements with Debit/Credit columns. You see everything before it's saved. Each of your categories is matched to an app category, kept under its own name, or treated as a transfer (chits, SSY, PPF and SIPs, so savings aren't counted as spending). "CC bill" rows can be logged as card bill payments. Importing the same file again skips what's already there. Afterwards the app offers to set up monthly regulars it spots (rent, salary, chits, EMIs) as recurring entries. Old binary .xls files need to be saved as .xlsx or .csv first.
- **Guide** (its own tab): a step-by-step walkthrough of every feature, from the first entry to credit-card cycles, loans, policies, import and backup. Each topic shows screenshots of the real screens (with made-up example data), tips, and a button that opens the screen it describes.
- **Settings**: family members, editable categories, app lock (fingerprint, face or phone PIN), light/dark theme, English/Telugu, and an encrypted backup and restore (AES-256-GCM with a password). Restore merges with what's on the phone: the newer version of each row wins, and deletions carry over.

Not yet built (planned for phase 2 and later): trend charts and other reports, CSV/PDF export, financial-year tax view, savings goals and sinking funds, claims log, split transactions and tags, budget rollover, SMS import, PDF statement import, receipt OCR, family sync, and the home-screen widget. Backups don't include attached receipt files.

## Development

```bash
npm ci
npx expo start          # dev server (needs a development build for native modules)
npx tsc --noEmit        # typecheck
npx expo lint           # lint
npm test                # unit tests for money, dates, EMI, deposits, loans, budgets, dues, backup encoding, spreadsheet import
```

Code layout:

- `src/app/`: screens (Expo Router). The tabs are in `src/app/(tabs)/`.
- `src/db/`: schema and migrations, seed categories, queries, and actions (mark paid, skip, reconcile).
- `src/lib/`: pure logic (money, dates, EMI/FD/RD maths, loan status, due items, budgets, spreadsheet import in `src/lib/import/`) plus reminders, backup and attachments.
- `src/components/`: shared UI. The guide text is in `src/components/guideContent.ts` and its screenshots in `assets/guide/`.

Amounts are stored as integer paise and dates as `YYYY-MM-DD`.

To build an installable Android APK, run the **Android APK** workflow from the Actions tab.
