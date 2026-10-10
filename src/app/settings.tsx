import { router, Stack } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';

import { setAppLock } from '@/components/AppLock';
import { ListRow, PasswordModal, SwitchRow } from '@/components/forms';
import { setThemePref } from '@/components/theme';
import { Card, ChipSelect, colors, Icon, SectionTitle, styles } from '@/components/ui';
import { LANG_PREFS, resolveLang, setLang, t, type LangPref } from '@/i18n';
import { deviceLanguage } from '@/i18n/device';
import { exportBackup, pickBackupFile, restoreBackup, WrongPasswordError } from '@/lib/backup';
import { remindersEnabled, setRemindersEnabled } from '@/lib/reminders';
import { getLangPref, getLockConfig, getThemePref, LOCK_DELAYS, saveLangPref, saveThemePref, THEME_PREFS, type LockConfig, type ThemePref } from '@/lib/settings';
import { setHideAmounts, useHideAmounts } from '@/lib/prefs';
import { showError, useQuery } from '@/lib/useQuery';

function NavRow({ icon, title, path }: { icon: string; title: string; path: string }) {
  return <ListRow left={<Icon name={icon} color={colors.primary} />} title={title} right="›" rightColor={colors.muted} onPress={() => router.push(path as never)} />;
}

export default function Settings() {
  const db = useSQLiteContext();
  const hidden = useHideAmounts();
  const [modal, setModal] = useState<null | 'backup' | 'restore'>(null);
  const [restoreText, setRestoreText] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const [theme, lang, lock, reminders] = await Promise.all([getThemePref(db), getLangPref(db), getLockConfig(db), remindersEnabled(db)]);
    return { theme, lang, lock, reminders };
  }, [db]);
  const { data, refresh } = useQuery(load);

  async function changeTheme(pref: ThemePref) {
    await saveThemePref(db, pref);
    setThemePref(pref);
  }

  async function changeLang(pref: LangPref) {
    await saveLangPref(db, pref);
    setLang(resolveLang(pref, deviceLanguage()));
  }

  async function changeLock(lock: LockConfig) {
    const message = await setAppLock(db, lock.enabled, lock.after);
    if (message) Alert.alert(t('App lock'), t(message));
    refresh();
  }

  async function toggleReminders(on: boolean) {
    const ok = await setRemindersEnabled(db, on);
    if (!ok) Alert.alert(t('Notifications are off'), t('Allow notifications for Budget Logger in the phone’s settings to get reminders.'));
    refresh();
  }

  async function doBackup(password: string) {
    setBusy(true);
    try {
      await exportBackup(db, password);
      setModal(null);
    } catch (e) {
      showError(t('Could not make the backup'), e);
    } finally {
      setBusy(false);
    }
  }

  async function startRestore() {
    try {
      const text = await pickBackupFile();
      if (!text) return;
      setRestoreText(text);
      setModal('restore');
    } catch (e) {
      showError(t('Could not read the file'), e);
    }
  }

  async function doRestore(password: string) {
    if (!restoreText) return;
    setBusy(true);
    try {
      const counts = await restoreBackup(db, restoreText, password);
      setModal(null);
      setRestoreText(null);
      Alert.alert(t('Restored'), t('{added} added, {updated} updated, {removed} removed. Entries already on this phone were kept.', counts));
    } catch (e) {
      if (e instanceof WrongPasswordError) Alert.alert(t('Could not open the backup'), t('Wrong password, or the file is damaged.'));
      else showError(t('Could not restore'), e);
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <View style={styles.screen} />;

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t('Settings') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        <SectionTitle>{t('Your books')}</SectionTitle>
        <Card>
          <NavRow icon="wallet-outline" title={t('Accounts')} path="/accounts" />
          <NavRow icon="people-outline" title={t('Family members')} path="/members" />
          <NavRow icon="pricetags-outline" title={t('Categories')} path="/categories" />
          <NavRow icon="repeat-outline" title={t('Recurring entries')} path="/recurring" />
          <NavRow icon="calendar-outline" title={t('Upcoming dues')} path="/upcoming" />
        </Card>

        <SectionTitle>{t('Privacy and security')}</SectionTitle>
        <Card style={{ gap: 12 }}>
          <SwitchRow
            label={t('App lock')}
            hint={t('Fingerprint, face or the phone’s PIN. Recommended for a money app.')}
            value={data.lock.enabled}
            onChange={(enabled) => changeLock({ ...data.lock, enabled }).catch((e) => showError(t('Could not save'), e))}
          />
          {data.lock.enabled ? (
            <ChipSelect
              label={t('Lock again')}
              options={LOCK_DELAYS.map((d) => String(d.seconds))}
              value={String(data.lock.after)}
              onChange={(v) => v && changeLock({ ...data.lock, after: Number(v) }).catch((e) => showError(t('Could not save'), e))}
              renderLabel={(v) => LOCK_DELAYS.find((d) => String(d.seconds) === v)?.label ?? v}
            />
          ) : null}
          <SwitchRow label={t('Hide amounts on Home')} hint={t('Shows ₹•••• for when others are looking.')} value={hidden} onChange={(v) => setHideAmounts(db, v)} />
        </Card>

        <SectionTitle>{t('Reminders')}</SectionTitle>
        <Card>
          <SwitchRow
            label={t('Phone notifications')}
            hint={t('Before EMIs, premiums, bills, SIPs, card due dates and maturities, and when a budget passes 80%.')}
            value={data.reminders}
            onChange={(v) => toggleReminders(v).catch((e) => showError(t('Could not save'), e))}
          />
        </Card>

        <SectionTitle>{t('Appearance')}</SectionTitle>
        <Card style={{ gap: 12 }}>
          <ChipSelect label={t('Theme')} options={THEME_PREFS.map((p) => p.value)} value={data.theme} onChange={(v) => v && changeTheme(v)} renderLabel={(v) => THEME_PREFS.find((p) => p.value === v)!.label} />
          <ChipSelect
            label={t('Language')}
            options={LANG_PREFS.map((p) => p.value)}
            value={data.lang}
            onChange={(v) => v && changeLang(v)}
            renderLabel={(v) => (v === 'system' ? t('Same as phone') : LANG_PREFS.find((p) => p.value === v)!.label)}
          />
        </Card>

        <SectionTitle>{t('Backup')}</SectionTitle>
        <Card style={{ gap: 4 }}>
          <Text style={styles.hint}>{t('Your data lives only on this phone. Make an encrypted backup now and then and keep it on Drive, WhatsApp or email. Attached receipt files are not included.')}</Text>
          <ListRow left={<Icon name="cloud-upload-outline" color={colors.primary} />} title={t('Make a backup')} onPress={() => setModal('backup')} />
          <ListRow left={<Icon name="cloud-download-outline" color={colors.primary} />} title={t('Restore from a backup')} subtitle={t('Merges with what is here; newer entries win.')} onPress={startRestore} />
        </Card>

        <SectionTitle>{t('Import')}</SectionTitle>
        <Card>
          <ListRow
            left={<Icon name="document-text-outline" color={colors.primary} />}
            title={t('Import from a spreadsheet')}
            subtitle={t('Money Manager export, Excel (.xlsx) or CSV')}
            right="›"
            rightColor={colors.muted}
            onPress={() => router.push('/import')}
          />
        </Card>

        <Text style={[styles.hint, { textAlign: 'center', marginTop: 12 }]}>{t('Budget Logger keeps records and reminds. It never gives financial advice.')}</Text>
      </ScrollView>

      <PasswordModal
        visible={modal === 'backup'}
        title={t('Backup password')}
        message={t('The backup is locked with this password. Without it nobody, including you, can open the file, so keep it safe.')}
        confirmLabel={t('Make backup')}
        needsRepeat
        busy={busy}
        onSubmit={doBackup}
        onCancel={() => setModal(null)}
      />
      <PasswordModal
        visible={modal === 'restore'}
        title={t('Restore backup')}
        message={t('Enter the password used when the backup was made.')}
        confirmLabel={t('Restore')}
        busy={busy}
        onSubmit={doRestore}
        onCancel={() => {
          setModal(null);
          setRestoreText(null);
        }}
      />
    </View>
  );
}
