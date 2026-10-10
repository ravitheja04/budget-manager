import { Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppLock } from '@/components/AppLock';
import { getScheme, setThemePref, subscribeTheme } from '@/components/theme';
import { colors } from '@/components/ui';
import { autoLogRecurring } from '@/db/actions';
import { onDataChange } from '@/db/repo';
import { migrate } from '@/db/schema';
import { getLang, resolveLang, setLang, subscribeLang, t } from '@/i18n';
import { deviceLanguage } from '@/i18n/device';
import { todayIso } from '@/lib/format';
import { loadHideAmounts } from '@/lib/prefs';
import { rescheduleReminders } from '@/lib/reminders';
import { getLangPref, getThemePref } from '@/lib/settings';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SQLiteProvider databaseName="budget.db" onInit={migrate}>
        <App />
      </SQLiteProvider>
    </SafeAreaProvider>
  );
}

function App() {
  const db = useSQLiteContext();
  const [ready, setReady] = useState(false);
  const [, setVersion] = useState(0);

  // Theme and language: load the saved choice, and redraw everything when either changes.
  useEffect(() => {
    let alive = true;
    (async () => {
      const [theme, lang] = await Promise.all([getThemePref(db), getLangPref(db)]);
      setThemePref(theme);
      setLang(resolveLang(lang, deviceLanguage()));
      await loadHideAmounts(db);
      if (alive) setReady(true);
      // Recurring entries set to log themselves, then reminders for what's coming.
      await autoLogRecurring(db, todayIso());
      await rescheduleReminders(db);
    })().catch(() => alive && setReady(true));
    const bump = () => setVersion((v) => v + 1);
    const offTheme = subscribeTheme(bump);
    const offLang = subscribeLang(bump);
    const offData = onDataChange(() => rescheduleReminders(db));
    return () => {
      alive = false;
      offTheme();
      offLang();
      offData();
    };
  }, [db]);

  useEffect(() => {
    SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});
  });

  if (!ready) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  const scheme = getScheme();
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      {/* Keyed so every screen redraws with the new colours or language. */}
      <Stack
        key={`${scheme}-${getLang()}`}
        screenOptions={{
          headerStyle: { backgroundColor: colors.card },
          headerTintColor: colors.text,
          headerTitleStyle: { color: colors.text },
          contentStyle: { backgroundColor: colors.bg },
          headerShadowVisible: false,
        }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false, title: t('Home') }} />
      </Stack>
      <AppLock />
    </View>
  );
}
