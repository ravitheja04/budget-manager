import * as DocumentPicker from 'expo-document-picker';
import { File } from 'expo-file-system';
import { strFromU8 } from 'fflate';
import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { ListRow, Stat, SwitchRow } from '@/components/forms';
import { Button, Card, colors, Icon, SectionTitle, styles } from '@/components/ui';
import { applyImport, createRecurringFromImport, matchAccounts, type AccountChoice, type ImportResult } from '@/db/importer';
import { listAccounts, listCategories, type AccountWithBalance } from '@/db/queries';
import { t } from '@/i18n';
import { formatDate, todayIso } from '@/lib/format';
import { CARD_BILL, guessAccountKind, sourceCategories, suggestTarget, type SourceCategory, type Target } from '@/lib/import/mapping';
import { findRecurring, type RecurringCandidate } from '@/lib/import/recurring';
import { parseSheet, type ParsedSheet } from '@/lib/import/sheet';
import { isOldXls, isXlsx, readCsv, readXlsx } from '@/lib/import/xlsx';
import { accountKindLabel } from '@/lib/labels';
import { formatMoney } from '@/lib/money';
import type { AccountKind, Category } from '@/lib/types';
import { showError } from '@/lib/useQuery';

const KINDS: AccountKind[] = ['bank', 'cash', 'wallet', 'card'];

type Review = {
  fileName: string;
  sheet: ParsedSheet;
  sources: SourceCategory[];
  targets: Map<string, Target>;
  accounts: AccountChoice[];
  cardBillRows: number;
};

const sourceKey = (s: Pick<SourceCategory, 'kind' | 'name'>) => `${s.kind}:${s.name}`;

export default function ImportScreen() {
  const db = useSQLiteContext();
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<Review | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [existingAccounts, setExistingAccounts] = useState<AccountWithBalance[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [cardBill, setCardBill] = useState(true);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [candidates, setCandidates] = useState<RecurringCandidate[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [recurringDone, setRecurringDone] = useState<number | null>(null);

  async function chooseFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'application/vnd.ms-excel', 'text/csv', 'text/comma-separated-values', 'application/octet-stream', '*/*'],
        copyToCacheDirectory: true,
      });
      if (res.canceled || !res.assets?.[0]) return;
      setBusy(true);
      const asset = res.assets[0];
      // Phones read the copied file; browsers hand over a File object instead.
      const bytes = asset.file ? new Uint8Array(await asset.file.arrayBuffer()) : await new File(asset.uri).bytes();
      if (isOldXls(bytes)) throw new Error(t('This is an old-style .xls file. Open it in Excel or Google Sheets and save it as .xlsx (or .csv), then import that.'));
      const rows = isXlsx(bytes) ? readXlsx(bytes) : readCsv(strFromU8(bytes));
      const sheet = parseSheet(rows);
      if (!sheet.records.length) throw new Error(t('No entries found in this file.'));
      const [cats, accs] = await Promise.all([listCategories(db), listAccounts(db, true)]);
      const sources = sourceCategories(sheet.records);
      const targets = new Map(sources.map((s) => [sourceKey(s), suggestTarget(s, cats)]));
      const names = [...new Set(sheet.records.flatMap((r) => [r.account, r.toAccount ?? '']).filter(Boolean))];
      const accounts = await matchAccounts(db, names, guessAccountKind);
      setCategories(cats);
      setExistingAccounts(accs);
      setReview({ fileName: asset.name, sheet, sources, targets, accounts, cardBillRows: sheet.records.filter((r) => r.kind === 'expense' && CARD_BILL.test(r.note)).length });
    } catch (e) {
      showError(t('Could not read the file'), e);
    } finally {
      setBusy(false);
    }
  }

  function setTarget(key: string, target: Target) {
    if (!review) return;
    setReview({ ...review, targets: new Map(review.targets).set(key, target) });
    setOpen(null);
  }

  function setAccount(i: number, change: Partial<AccountChoice>) {
    if (!review) return;
    const accounts = review.accounts.slice();
    accounts[i] = { ...accounts[i], ...change };
    setReview({ ...review, accounts });
  }

  // The card account the "CC bill" rows should be paid into: the first one that will be a card.
  const cardAccount = review?.accounts.find((a) => (a.existingId ? existingAccounts.find((e) => e.id === a.existingId)?.kind : a.kind) === 'card')?.name ?? null;

  async function runImport() {
    if (!review) return;
    setBusy(true);
    try {
      const res = await applyImport(db, {
        records: review.sheet.records,
        targets: review.targets,
        accounts: review.accounts,
        cardBillAccount: cardBill && review.cardBillRows ? cardAccount : null,
      });
      // Leave out regulars already set up (by name).
      const existing = new Set((await db.getAllAsync<{ title: string }>('SELECT title FROM recurring')).map((r) => r.title.trim().toLowerCase()));
      const found = findRecurring(review.sheet.records, todayIso()).filter((c) => !existing.has(c.title.trim().toLowerCase()));
      setResult(res);
      setCandidates(found);
      setPicked(new Set(found.map((c) => c.key)));
    } catch (e) {
      showError(t('Could not import'), e);
    } finally {
      setBusy(false);
    }
  }

  async function createRecurring() {
    if (!result) return;
    setBusy(true);
    try {
      setRecurringDone(await createRecurringFromImport(db, candidates.filter((c) => picked.has(c.key)), result));
    } catch (e) {
      showError(t('Could not save'), e);
    } finally {
      setBusy(false);
    }
  }

  const targetLabel = (target: Target | undefined) => {
    if (!target) return '';
    if (target.type === 'transfer') return t('Transfer (not spending)');
    if (target.type === 'new') return t('New category “{name}”', { name: target.name });
    return t(categories.find((c) => c.id === target.id)?.name ?? '');
  };

  // ---------- Step 3: done ----------
  if (result && review) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: t('Import finished') }} />
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
          <Card style={{ gap: 6 }}>
            <View style={styles.row}>
              <Icon name="checkmark-circle" color={colors.okText} size={28} />
              <Text style={[styles.title, { flex: 1 }]}>{t('{n} entries added', { n: result.added })}</Text>
            </View>
            {result.duplicates ? <Text style={styles.hint}>{t('{n} were already in the app and were skipped.', { n: result.duplicates })}</Text> : null}
            {result.previouslyDeleted ? <Text style={styles.hint}>{t('{n} you had deleted were left out.', { n: result.previouslyDeleted })}</Text> : null}
            <Text style={styles.hint}>{t('Account balances start from zero. Open each account and use “Match with the bank balance” to set today’s balance.')}</Text>
          </Card>

          {candidates.length && recurringDone === null ? (
            <>
              <SectionTitle>{t('Regular every month?')}</SectionTitle>
              <Text style={styles.hint}>{t('These appeared on about the same day in each of the last three months. Set them up as recurring entries to get a reminder and log them with one tap.')}</Text>
              <Card>
                {candidates.map((c) => {
                  const on = picked.has(c.key);
                  return (
                    <Pressable
                      key={c.key}
                      onPress={() => {
                        const next = new Set(picked);
                        if (on) next.delete(c.key);
                        else next.add(c.key);
                        setPicked(next);
                      }}
                      style={[styles.row, { paddingVertical: 8 }]}>
                      <Icon name={on ? 'checkbox' : 'square-outline'} color={on ? colors.primary : colors.muted} size={24} />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.title}>{c.title}</Text>
                        <Text style={styles.subtitle}>{t('Every month on the {day} · next {date}', { day: ordinal(c.day), date: formatDate(c.nextDate) })}</Text>
                      </View>
                      <Text style={[styles.title, { color: c.kind === 'income' ? colors.okText : colors.text }]}>{formatMoney(c.amount, { sign: c.kind === 'income' })}</Text>
                    </Pressable>
                  );
                })}
              </Card>
              <Button title={t('Set up {n} recurring entries', { n: picked.size })} onPress={createRecurring} loading={busy} disabled={!picked.size} />
            </>
          ) : null}
          {recurringDone !== null ? <Text style={styles.body}>{t('{n} recurring entries set up. You’ll be reminded the day before each one.', { n: recurringDone })}</Text> : null}
          <Button title={t('Done')} variant={candidates.length && recurringDone === null ? 'secondary' : 'primary'} onPress={() => router.dismissTo('/')} />
        </ScrollView>
      </View>
    );
  }

  // ---------- Step 1: choose a file ----------
  if (!review) {
    return (
      <View style={styles.screen}>
        <Stack.Screen options={{ title: t('Import from a spreadsheet') }} />
        <ScrollView contentContainerStyle={styles.content}>
          <Card style={{ gap: 10 }}>
            <Text style={styles.body}>{t('Bring in your history from Money Manager or any spreadsheet (.xlsx or .csv). The first row should name the columns, for example:')}</Text>
            <Text style={[styles.body, { fontWeight: '600' }]}>Date · Account · Category · Note · Amount · Income/Expense</Text>
            <Text style={styles.hint}>{t('Bank statements with separate Debit and Credit columns work too. You’ll see everything before anything is saved, and importing the same file again skips entries already added.')}</Text>
          </Card>
          <Button title={t('Choose file')} icon="document-attach-outline" onPress={chooseFile} loading={busy} />
          <Text style={styles.hint}>{t('The file is read on this phone only.')}</Text>
        </ScrollView>
      </View>
    );
  }

  // ---------- Step 2: review ----------
  const { sheet, sources, targets, accounts } = review;
  const dates = sheet.records.map((r) => r.date).sort();
  const income = sheet.records.filter((r) => r.kind === 'income').reduce((s, r) => s + r.amount, 0);
  const expense = sheet.records.filter((r) => r.kind === 'expense').reduce((s, r) => s + r.amount, 0);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('Check the import') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        <Card style={{ gap: 8 }}>
          <Text style={styles.title} numberOfLines={1}>
            {review.fileName}
          </Text>
          <Text style={styles.subtitle}>{t('{n} entries from {from} to {to}', { n: sheet.records.length, from: formatDate(dates[0]), to: formatDate(dates[dates.length - 1]) })}</Text>
          <View style={styles.row}>
            <Stat label={t('Income')} value={formatMoney(income)} color={colors.okText} />
            <Stat label={t('Expenses')} value={formatMoney(expense)} align="right" />
          </View>
          {sheet.skipped.length ? (
            <Text style={[styles.hint, { color: colors.warnText }]}>
              {t('{n} rows couldn’t be read and will be left out (rows {rows}).', { n: sheet.skipped.length, rows: sheet.skipped.slice(0, 8).map((s) => s.row).join(', ') + (sheet.skipped.length > 8 ? '…' : '') })}
            </Text>
          ) : null}
        </Card>

        <SectionTitle>{t('Accounts')}</SectionTitle>
        <Card style={{ gap: 14 }}>
          {accounts.map((a, i) => (
            <View key={a.name} style={{ gap: 6 }}>
              <Text style={styles.title}>{a.name}</Text>
              <View style={styles.chips}>
                {existingAccounts.map((e) => (
                  <Chip key={e.id} label={t('Use “{name}”', { name: e.name })} selected={a.existingId === e.id} onPress={() => setAccount(i, { existingId: a.existingId === e.id ? null : e.id })} />
                ))}
                {KINDS.map((k) => (
                  <Chip key={k} label={t('New {kind}', { kind: accountKindLabel(k).toLowerCase() })} selected={!a.existingId && a.kind === k} onPress={() => setAccount(i, { existingId: null, kind: k })} />
                ))}
              </View>
            </View>
          ))}
        </Card>

        <SectionTitle>{t('Categories')}</SectionTitle>
        <Text style={styles.hint}>{t('Tap one to change where it goes. Savings like chits and SSY are best as transfers, so they aren’t counted as spending.')}</Text>
        <Card>
          {sources.map((s) => {
            const key = sourceKey(s);
            const target = targets.get(key);
            const expanded = open === key;
            return (
              <View key={key}>
                <ListRow
                  onPress={() => setOpen(expanded ? null : key)}
                  title={s.name || t('(no category)')}
                  subtitle={`${s.kind === 'income' ? t('Income') : t('Expense')} · ${t('{n} entries', { n: s.count })} → ${targetLabel(target)}`}
                  right={formatMoney(s.total)}
                  rightColor={s.kind === 'income' ? colors.okText : undefined}
                />
                {expanded ? (
                  <View style={[styles.chips, { paddingBottom: 10 }]}>
                    {s.kind === 'expense' ? <Chip label={t('Transfer (not spending)')} selected={target?.type === 'transfer'} onPress={() => setTarget(key, { type: 'transfer' })} /> : null}
                    {s.name ? <Chip label={t('New category “{name}”', { name: s.name })} selected={target?.type === 'new'} onPress={() => setTarget(key, { type: 'new', name: s.name })} /> : null}
                    {categories
                      .filter((c) => c.kind === s.kind)
                      .map((c) => (
                        <Chip key={c.id} label={t(c.name)} selected={target?.type === 'category' && target.id === c.id} onPress={() => setTarget(key, { type: 'category', id: c.id })} />
                      ))}
                  </View>
                ) : null}
              </View>
            );
          })}
        </Card>

        {review.cardBillRows && cardAccount ? (
          <Card>
            <SwitchRow
              label={t('Treat {n} “CC bill” payments as paying the card', { n: review.cardBillRows })}
              hint={t('Logged as a transfer to “{card}” so card spending isn’t counted twice.', { card: cardAccount })}
              value={cardBill}
              onChange={setCardBill}
            />
          </Card>
        ) : null}

        <Button title={t('Import {n} entries', { n: sheet.records.length })} icon="download-outline" onPress={runImport} loading={busy} />
        <Button title={t('Choose a different file')} variant="secondary" onPress={() => setReview(null)} disabled={busy} />
      </ScrollView>
    </View>
  );
}

function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && styles.chipSelected]}>
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

function ordinal(n: number) {
  const s = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[n % 10] ?? 'th';
  return `${n}${s}`;
}
