/**
 * The in-app guide: one topic per feature, each a few short steps with a
 * screenshot of the real screen (taken with made-up demo data) and a button
 * that opens that screen. Text is passed through t() when shown.
 */

export type GuideStep = {
  title: string;
  body: string[];
  /** A key of GUIDE_IMAGES. */
  image?: string;
  tip?: string;
};

export type GuideTopic = {
  id: string;
  title: string;
  summary: string;
  icon: string;
  steps: GuideStep[];
  /** Where "Open this screen" goes. */
  link?: { label: string; path: string };
};

export const GUIDE: GuideTopic[] = [
  {
    id: 'start',
    title: 'Getting started',
    summary: 'What the Home screen shows, and the first things to set up.',
    icon: 'rocket',
    link: { label: 'Open Settings', path: '/settings' },
    steps: [
      {
        title: 'Home: where you stand this month',
        image: 'home',
        body: [
          'The top card shows this month’s income, what has been spent and what is saved. If you set a monthly budget, the bar shows how much of it is used; the thin mark on the bar is where you would be if you spent evenly through the month.',
          'Needs attention lists anything due in the next 7 days or already late: card bills, EMIs, premiums, recurring bills and budgets that are over 80%. Tap any item to deal with it.',
          'Net worth adds up your accounts and savings and takes away what you owe on loans. Recent entries shows the last ten things you logged.',
        ],
        tip: 'Tap the eye icon on the top card to hide all amounts when others are around.',
      },
      {
        title: 'Set up your accounts and family',
        image: 'settings',
        body: [
          'Open Settings with the gear at the top right of any tab.',
          'Accounts: add each bank account, credit card and wallet (PhonePe, Paytm…) with the balance it has today. The app keeps a running balance from there. A Cash account is already there.',
          'Family members: add the people in the family, so you can note who spent, whose policy it is and whose loan.',
          'Categories are ready to use and can be renamed or added to.',
        ],
        tip: 'Turn on App lock and Phone notifications here too. Reminders only arrive when notifications are on.',
      },
    ],
  },
  {
    id: 'entries',
    title: 'Adding expenses and income',
    summary: 'Quick add with the + button, transfers, receipts, and finding entries later.',
    icon: 'add-circle',
    link: { label: 'Add an entry', path: '/txn/edit' },
    steps: [
      {
        title: 'Quick add in three taps',
        image: 'quick-add',
        body: [
          'Tap the round + button on Home or Entries.',
          'Type the amount. You can write 450, 1,25,000, 1.5L or 2cr.',
          'Tap a category, check the account it was paid from (the last one you used is picked for you) and tap Save. The date is today unless you change it.',
        ],
        tip: 'Tap “Payee, family member, notes, receipt” to add who you paid, who spent it, a note, or a photo or PDF of the bill.',
      },
      {
        title: 'Expense, income or transfer',
        body: [
          'Use the switch at the top. Choose Income for salary, rent received, interest and refunds.',
          'Choose Transfer when money moves between your own accounts, for example cash taken out of the bank or paying the credit-card bill. Transfers are not counted as spending or income, so nothing is counted twice.',
        ],
      },
      {
        title: 'Find and change entries',
        image: 'transactions',
        body: [
          'The Entries tab lists one month at a time, grouped by day with each day’s total. Use ‹ › to move between months.',
          'Search by payee, note, category or amount. The funnel icon filters by category, account or family member.',
          'Tap any entry to change it, or to delete it with the bin icon.',
        ],
      },
    ],
  },
  {
    id: 'recurring',
    title: 'Recurring bills and salary',
    summary: 'Rent, salary, fees and chits that repeat every month.',
    icon: 'repeat',
    link: { label: 'Open Recurring entries', path: '/recurring' },
    steps: [
      {
        title: 'Add something that repeats',
        image: 'recurring',
        body: [
          'Entries → “Recurring entries (rent, salary, fees…)” → Add recurring entry.',
          'Give it a name, amount, category and how often it happens (weekly, monthly, quarterly, half-yearly or yearly), and the next date.',
          '“Log it by itself” adds the entry automatically on the day. Leave it off to get a reminder and confirm it yourself when it is paid.',
        ],
        tip: 'When it shows under Needs attention, tap it and choose Mark paid, or Skip this time.',
      },
    ],
  },
  {
    id: 'budgets',
    title: 'Budgets',
    summary: 'A monthly limit overall and per category, with alerts at 80% and 100%.',
    icon: 'pie-chart',
    link: { label: 'Open Budgets', path: '/budgets' },
    steps: [
      {
        title: 'Set a limit and watch the bar',
        image: 'budgets',
        body: [
          'Budgets → “Set an overall monthly budget” for one limit on everything, and “Add a category budget” for things like groceries or eating out.',
          'Each bar shows what is spent against the limit. The thin mark is where you would be at this point in the month if you spent evenly: if the bar is past it, you are spending faster than planned.',
          'Bars turn orange at 80% and red at 100%. With phone notifications on (Settings), you also get a notification the moment an entry crosses either.',
        ],
        tip: 'Spending without a budget lists categories you spend on but haven’t set a limit for. Tap one to add a limit.',
      },
    ],
  },
  {
    id: 'stats',
    title: 'Stats',
    summary: 'Where the money went, by category, for any week, month, year or dates you pick.',
    icon: 'stats-chart',
    link: { label: 'Open Stats', path: '/stats' },
    steps: [
      {
        title: 'Pick a period, see the split',
        image: 'stats',
        body: [
          'Choose Week, Month, Year, FY (April to March) or Period. Period lets you set any From and To dates. Use ‹ › to step back and forward.',
          'Switch between Income and Expenses. The chart shows the biggest categories, with the rest grouped as Other; the list below has every category with its share, amount and number of entries.',
          'Tap a category, or a slice of the chart, to see its entries for that period.',
        ],
        tip: 'Money moved to chits, SSY or loan principal is a transfer, not spending. It is shown in a line under the chart instead.',
      },
    ],
  },
  {
    id: 'cards',
    title: 'Credit cards',
    summary: 'Statement and due dates, billed vs unbilled, and counting spends in the month you pay.',
    icon: 'card',
    link: { label: 'Open Accounts', path: '/accounts' },
    steps: [
      {
        title: 'Tell the app your card’s dates',
        image: 'card-settings',
        body: [
          'Settings → Accounts → your card → Edit account (or Add an account → Credit card).',
          'Statement (bill) day: the day the bill is made, for example 18. Spends up to and on the 18th go on that bill.',
          'Bill due day: the last day to pay, for example 6 (of the next month).',
          'Turn on “Count spends in the month the bill is paid” if you plan your month around paying the card. A spend on 25 Sep goes on the 18 Oct bill, paid by 6 Nov, so it counts in November in budgets and Stats while keeping its real date.',
        ],
        tip: 'Log each card spend with the day you actually bought it; the app works out the month.',
      },
      {
        title: 'What is due now, and what comes next',
        image: 'card',
        body: [
          'Billed is the last statement less anything paid since, with the date to pay it by. It turns red once that date has passed.',
          'Unbilled is what you have spent since the last statement. It goes on the next bill and isn’t due yet.',
          '“Pay the bill” fills in the billed amount as a transfer from your bank account. Reminders before the due date use the billed amount too.',
        ],
        tip: 'If the app’s figure differs from the bank’s, use “Match with the bank balance” once.',
      },
    ],
  },
  {
    id: 'savings',
    title: 'Savings and investments',
    summary: 'FDs, RDs, PPF, Sukanya Samriddhi, EPF, NPS, funds, gold and chits in one list.',
    icon: 'trending-up',
    link: { label: 'Open Savings', path: '/savings' },
    steps: [
      {
        title: 'Everything the family has saved',
        image: 'savings',
        body: [
          'Savings → Add a holding, and pick the type. The form asks only for what that type needs: an FD needs the amount, rate and dates; a mutual fund needs the amount put in and, now and then, its current value.',
          'The total at the top adds up every holding, and the bar shows how it is split between equity, debt, gold, cash and property.',
          'Anything maturing in the next 12 months is listed at the bottom, and you get reminders 30 and 7 days before.',
        ],
      },
      {
        title: 'Plans you pay into for some years (SSY, PPF, RD)',
        image: 'ssy',
        body: [
          'Add the regular contribution, how often, the next date, and “Paid for how many years”. For Sukanya Samriddhi the app fills in 15 years of deposits and maturity 21 years after opening; for PPF, 15 years.',
          'The holding then shows how many years are paid out of the term, what you have put in, roughly how much is left to pay, the last deposit date and how long until maturity.',
          'When a deposit shows as due, open the holding and tap Mark paid. It is logged as a transfer from your bank and added to what you have put in. Reminders stop after the last deposit.',
        ],
      },
    ],
  },
  {
    id: 'loans',
    title: 'Loans and EMIs',
    summary: 'What’s left on each loan, the EMI split, prepayments, and money lent.',
    icon: 'cash',
    link: { label: 'Open Loans', path: '/loans' },
    steps: [
      {
        title: 'Add a loan',
        image: 'loans',
        body: [
          'Loans → Add a loan. Enter the lender, amount, interest rate and tenure in months; the EMI is worked out for you (change it if your bank’s figure is different).',
          'For a loan that started earlier, keep “EMIs before today are already paid” on, so the balance starts where it is today.',
          '“Money lent” is for money you gave to family or friends, with a date it should come back.',
        ],
      },
      {
        title: 'Follow it to the end',
        image: 'loan',
        body: [
          'Each loan shows the principal still owed, interest paid so far, EMIs left and when it will end, with the full month-by-month schedule further down.',
          'Mark EMI paid logs the interest part as an expense and the principal part as a transfer, so only the interest counts as spending.',
          'The prepayment calculator shows what paying extra now would save, either by finishing sooner or by lowering the EMI.',
        ],
      },
    ],
  },
  {
    id: 'insurance',
    title: 'Insurance policies',
    summary: 'Term, health and LIC policies: who is covered, premiums paid and years left.',
    icon: 'shield-checkmark',
    link: { label: 'Open Insurance', path: '/insurance' },
    steps: [
      {
        title: 'All the family’s cover in one place',
        image: 'insurance',
        body: [
          'Insurance → Add a policy. Pick the kind (health, term, life/LIC, vehicle…), the insurer, who is covered, the sum assured and the premium.',
          'Cover per person adds up each family member’s health and life cover across all their policies.',
        ],
      },
      {
        title: 'Premiums paid and years left',
        image: 'policy',
        body: [
          'Enter the start date (your first premium), the premium paying term in years, and the policy term in years. A term plan, for example, may take premiums for 10 years and cover you for 35.',
          'The policy then shows how many years of premiums are paid, what has been paid, roughly how much is left, the last premium date, and how many years of cover remain.',
          'Mark paid logs the premium as an expense and moves the due date on. Reminders come 30, 15, 7 and 1 day before, and stop after the last premium.',
        ],
        tip: 'Add the insurer’s helpline and your agent’s number: the policy screen gets call buttons for both.',
      },
    ],
  },
  {
    id: 'upcoming',
    title: 'Upcoming and reminders',
    summary: 'Every bill, EMI, premium and maturity coming up, in one list.',
    icon: 'calendar',
    link: { label: 'Open Upcoming', path: '/upcoming' },
    steps: [
      {
        title: 'One list of what’s coming',
        image: 'upcoming',
        body: [
          'Home → All upcoming (or Settings → Upcoming dues) shows everything due in the next 60 days, month by month, with anything late at the top.',
          'Tap an item to open it and mark it paid.',
          'To get phone reminders, turn on Settings → Phone notifications.',
        ],
      },
    ],
  },
  {
    id: 'import',
    title: 'Import from Money Manager or Excel',
    summary: 'Bring in your past entries from a spreadsheet, without duplicates.',
    icon: 'document-text',
    link: { label: 'Open Import', path: '/import' },
    steps: [
      {
        title: 'Choose the file',
        image: 'import-start',
        body: [
          'Settings → Import from a spreadsheet → Choose file. It reads Money Manager exports, Excel files (.xlsx) and CSV files, including bank statements with Debit and Credit columns.',
          'Old .xls files need to be saved as .xlsx first (Excel or Google Sheets can do this).',
        ],
      },
      {
        title: 'Check before anything is saved',
        image: 'import-review',
        body: [
          'The review shows how many entries were found and how each of your categories will be filed. Tap a category to change it: pick one of the app’s categories, keep your own name, or treat it as a transfer (best for chits and SSY, so they aren’t counted as spending).',
          'Match each account in the file to one of yours, or let the app create it.',
          'After the import the app suggests the monthly regulars it spotted (salary, rent, chits) as recurring entries.',
        ],
        tip: 'Importing the same file again only adds what’s new. Afterwards, set each account’s balance with “Match with the bank balance”.',
      },
    ],
  },
  {
    id: 'backup',
    title: 'Backup, app lock and privacy',
    summary: 'Your data stays on this phone. Keep an encrypted backup.',
    icon: 'lock-closed',
    link: { label: 'Open Settings', path: '/settings' },
    steps: [
      {
        title: 'Private by default',
        body: [
          'Everything is stored only on this phone. There is no account, no bank login and nothing is sent anywhere.',
          'App lock asks for your fingerprint, face or phone PIN when the app opens, and hides it in the recent-apps screen.',
          'Make a backup now and then: Settings → Make a backup. Choose a password and save the file to Drive, WhatsApp or email. Without the password nobody can open it, so keep it safe.',
          'On a new phone, Settings → Restore from a backup. Restoring merges with what is already there; the newer version of each entry wins.',
        ],
        tip: 'Backups don’t include attached receipt photos.',
      },
    ],
  },
];
