import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { DateField } from '@/components/DateField';
import { AmountField, CategoryGrid, confirmDelete, RecordPicker, Segmented } from '@/components/forms';
import { Button, colors, Field, Icon, styles } from '@/components/ui';
import { deleteTransaction, saveTransaction } from '@/db/actions';
import { attachmentsFor, lastUsedAccountId, listAccounts, listCategories, listMembers, monthSpendByCategory, type AccountWithBalance } from '@/db/queries';
import { bookDateOf, getById } from '@/db/repo';
import { t } from '@/i18n';
import { addAttachment, deleteAttachment, openAttachment, pickAttachment } from '@/lib/attachments';
import { checkBudgetAlerts } from '@/lib/budgetAlerts';
import { bookDateFor } from '@/lib/cards';
import { monthTitle } from '@/lib/dates';
import { isValidDate, todayIso } from '@/lib/format';
import { accountKindLabel, txnKindLabel } from '@/lib/labels';
import type { Attachment, Category, Member, Txn, TxnKind } from '@/lib/types';
import { showError } from '@/lib/useQuery';

type Params = { id?: string; kind?: TxnKind; accountId?: string; toAccountId?: string; amount?: string; payee?: string; categoryId?: string; date?: string };

export default function EditTransaction() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<Params>();
  const editing = !!params.id;

  const [loaded, setLoaded] = useState(false);
  const [original, setOriginal] = useState<Txn | null>(null);
  const [kind, setKind] = useState<TxnKind>(params.kind ?? 'expense');
  const [amount, setAmount] = useState<number | null>(params.amount ? Number(params.amount) : null);
  const [categoryId, setCategoryId] = useState<string | null>(params.categoryId ?? null);
  const [accountId, setAccountId] = useState<string | null>(params.accountId ?? null);
  const [toAccountId, setToAccountId] = useState<string | null>(params.toAccountId ?? null);
  const [date, setDate] = useState<string | null>(params.date ?? todayIso());
  const [memberId, setMemberId] = useState<string | null>(null);
  const [payee, setPayee] = useState(params.payee ?? '');
  const [notes, setNotes] = useState('');
  const [more, setMore] = useState(editing);
  const [saving, setSaving] = useState(false);

  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [pending, setPending] = useState<{ uri: string; name: string; mime: string }[]>([]);

  const reloadAttachments = useCallback(async () => {
    if (params.id) setAttachments(await attachmentsFor(db, 'transaction', params.id));
  }, [db, params.id]);

  useEffect(() => {
    (async () => {
      const [cats, accs, mems] = await Promise.all([listCategories(db), listAccounts(db, true), listMembers(db)]);
      setCategories(cats);
      setAccounts(accs);
      setMembers(mems);
      if (params.id) {
        const txn = await getById<Txn>(db, 'transactions', params.id);
        if (txn) {
          setOriginal(txn);
          setKind(txn.kind);
          setAmount(txn.amount);
          setCategoryId(txn.categoryId);
          setAccountId(txn.accountId);
          setToAccountId(txn.toAccountId);
          setDate(txn.date);
          setMemberId(txn.memberId);
          setPayee(txn.payee);
          setNotes(txn.notes);
        }
        await reloadAttachments();
      } else if (!params.accountId) {
        // Paying into an account (a card bill) comes from another one: never the same account, and not a card.
        const last = await lastUsedAccountId(db);
        const lastAccount = accs.find((a) => a.id === last);
        const usable = (a: AccountWithBalance | undefined) => !!a && !a.archived && a.id !== params.toAccountId && (!params.toAccountId || a.kind !== 'card');
        setAccountId(usable(lastAccount) ? last : (accs.find(usable)?.id ?? null));
      }
      setLoaded(true);
    })().catch((e) => showError(t('Could not load data'), e));
  }, [db, params.id, params.accountId, params.toAccountId, reloadAttachments]);

  const visibleAccounts = accounts.filter((a) => !a.archived || a.id === accountId || a.id === toAccountId);
  const kindCategories = categories.filter((c) => c.kind === kind);
  const appLogged = !!original?.sourceType && original.sourceType !== 'recurring';
  // Card spends that count in the month their bill is paid.
  const payingAccount = accounts.find((a) => a.id === accountId);
  const unmoved = !!original && original.date === date && original.accountId === accountId && !!original.bookDate;
  const shownBookDate = unmoved ? original!.bookDate : date && isValidDate(date) && payingAccount?.kind === 'card' ? bookDateFor(date, payingAccount) : null;
  const billMonthHint = shownBookDate && shownBookDate.slice(0, 7) !== date!.slice(0, 7) ? t('Counts in {month}, when this card’s bill is paid.', { month: monthTitle(shownBookDate) }) : null;

  function changeKind(next: TxnKind) {
    setKind(next);
    if (categoryId && !categories.find((c) => c.id === categoryId && c.kind === next)) setCategoryId(null);
  }

  async function onSave() {
    if (!amount || amount <= 0) return Alert.alert(t('Enter the amount'));
    if (!date || !isValidDate(date)) return Alert.alert(t('Enter a valid date'));
    if (kind === 'transfer') {
      if (!accountId && !toAccountId) return Alert.alert(t('Choose the accounts the money moved between'));
      if (accountId === toAccountId) return Alert.alert(t('Choose two different accounts'));
    } else if (!categoryId) {
      return Alert.alert(t('Choose a category'));
    }
    setSaving(true);
    try {
      // Editing without moving the date or account keeps the month it counts in (imported card entries stay put).
      const bookDate = original && original.date === date && original.accountId === accountId && original.bookDate ? original.bookDate : await bookDateOf(db, date, accountId);
      const before = kind === 'expense' ? await monthSpendByCategory(db, bookDate) : null;
      const id = await saveTransaction(db, {
        bookDate,
        id: original?.id,
        kind,
        amount,
        date,
        accountId,
        toAccountId: kind === 'transfer' ? toAccountId : null,
        categoryId: kind === 'transfer' ? null : categoryId,
        memberId,
        payee: payee.trim(),
        notes: notes.trim(),
        sourceType: original?.sourceType ?? null,
        sourceId: original?.sourceId ?? null,
      });
      for (const p of pending) await addAttachment(db, 'transaction', id, p);
      const alerts = before ? await checkBudgetAlerts(db, bookDate, categoryId, before) : [];
      router.back();
      if (alerts.length) setTimeout(() => Alert.alert(t('Budget alert'), alerts.join('\n\n')), 400);
    } catch (e) {
      showError(t('Could not save'), e);
      setSaving(false);
    }
  }

  async function attach() {
    try {
      const picked = await pickAttachment();
      if (!picked) return;
      if (params.id) {
        await addAttachment(db, 'transaction', params.id, picked);
        await reloadAttachments();
      } else {
        setPending((p) => [...p, picked]);
      }
    } catch (e) {
      showError(t('Could not attach the file'), e);
    }
  }

  if (!loaded) return <View style={styles.screen} />;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen
        options={{
          title: editing ? t('Edit entry') : t('Add entry'),
          headerRight: editing
            ? () => (
                <Pressable
                  hitSlop={12}
                  accessibilityLabel={t('Delete')}
                  onPress={() =>
                    original &&
                    confirmDelete(t('this entry'), () =>
                      deleteTransaction(db, original)
                        .then(() => router.back())
                        .catch((e) => showError(t('Could not delete'), e))
                    )
                  }>
                  <Icon name="trash-outline" color={colors.danger} />
                </Pressable>
              )
            : undefined,
        }}
      />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        {appLogged ? (
          <View style={[styles.card, { backgroundColor: colors.infoBg, borderColor: colors.infoBorder }]}>
            <Text style={{ color: colors.infoText }}>{t('This entry was logged from a loan, policy or holding. Deleting it here also removes it there.')}</Text>
          </View>
        ) : null}
        <Segmented
          options={(['expense', 'income', 'transfer'] as TxnKind[]).map((k) => ({ value: k, label: txnKindLabel(k) }))}
          value={kind}
          onChange={changeKind}
        />
        <AmountField label={t('Amount')} value={amount} onChange={setAmount} large autoFocus={!editing && !params.amount} />

        {kind !== 'transfer' ? <CategoryGrid label={t('Category')} categories={kindCategories} value={categoryId} onChange={setCategoryId} /> : null}

        {kind === 'transfer' ? (
          <>
            <RecordPicker
              label={t('From')}
              items={visibleAccounts}
              value={accountId}
              onChange={setAccountId}
              getLabel={(a) => a.name}
              allowNone
              noneLabel={t('Outside (not tracked)')}
            />
            <RecordPicker
              label={t('To')}
              items={visibleAccounts}
              value={toAccountId}
              onChange={setToAccountId}
              getLabel={(a) => a.name}
              allowNone
              noneLabel={t('Outside (not tracked)')}
              hint={t('Transfers between your own accounts are not counted as spending or income.')}
            />
          </>
        ) : (
          <RecordPicker
            label={kind === 'income' ? t('Received in') : t('Paid from')}
            items={visibleAccounts}
            value={accountId}
            onChange={setAccountId}
            getLabel={(a) => `${a.name}${a.kind === 'card' ? ' 💳' : ''}`}
            hint={visibleAccounts.length <= 1 ? t('Add bank accounts, cards and wallets in Settings → Accounts.') : undefined}
          />
        )}

        <DateField label={t('Date')} value={date} onChange={setDate} hint={billMonthHint ?? undefined} />

        {!more ? (
          <Pressable onPress={() => setMore(true)} style={[styles.row, { paddingVertical: 6 }]}>
            <Icon name="add-circle-outline" color={colors.primary} />
            <Text style={{ color: colors.primary, fontWeight: '600' }}>{t('Payee, family member, notes, receipt')}</Text>
          </Pressable>
        ) : (
          <>
            <Field label={kind === 'income' ? t('From (payer)') : t('Payee / shop')} value={payee} onChangeText={setPayee} placeholder={t('e.g. Swiggy, Big Bazaar, landlord')} />
            {members.length ? (
              <RecordPicker
                label={kind === 'income' ? t('Who earned it') : t('Who spent it')}
                items={members}
                value={memberId}
                onChange={setMemberId}
                getLabel={(m) => m.name}
                allowNone
                noneLabel={t('Family')}
              />
            ) : null}
            <Field label={t('Notes')} value={notes} onChangeText={setNotes} multiline />
            <View style={styles.field}>
              <Text style={styles.label}>{t('Receipts')}</Text>
              {attachments.map((a) => (
                <View key={a.id} style={[styles.row, { paddingVertical: 4 }]}>
                  <Icon name={a.mime === 'application/pdf' ? 'document-text-outline' : 'image-outline'} color={colors.muted} />
                  <Pressable style={{ flex: 1 }} onPress={() => openAttachment(a).catch((e) => showError(t('Could not open'), e))}>
                    <Text style={[styles.body, { color: colors.primary }]} numberOfLines={1}>
                      {a.name}
                    </Text>
                  </Pressable>
                  <Pressable
                    hitSlop={8}
                    onPress={() =>
                      confirmDelete(t('this file'), () =>
                        deleteAttachment(db, a)
                          .then(reloadAttachments)
                          .catch((e) => showError(t('Could not delete'), e))
                      )
                    }>
                    <Icon name="close-circle" color={colors.muted} />
                  </Pressable>
                </View>
              ))}
              {pending.map((p, i) => (
                <View key={`${p.uri}-${i}`} style={[styles.row, { paddingVertical: 4 }]}>
                  <Icon name="attach" color={colors.muted} />
                  <Text style={[styles.body, { flex: 1 }]} numberOfLines={1}>
                    {p.name}
                  </Text>
                  <Pressable hitSlop={8} onPress={() => setPending((list) => list.filter((_, j) => j !== i))}>
                    <Icon name="close-circle" color={colors.muted} />
                  </Pressable>
                </View>
              ))}
              <Button title={t('Attach photo or PDF')} icon="attach" variant="secondary" onPress={attach} />
            </View>
          </>
        )}

        <Button title={editing ? t('Save changes') : t('Save')} onPress={onSave} loading={saving} style={{ marginTop: 8 }} />
        {accounts.find((a) => a.id === accountId)?.archived ? <Text style={styles.hint}>{t('This account is archived ({kind}).', { kind: accountKindLabel(accounts.find((a) => a.id === accountId)!.kind) })}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
