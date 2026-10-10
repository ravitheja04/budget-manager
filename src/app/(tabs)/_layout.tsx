import { router } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { Pressable } from 'react-native';

import { colors, Icon } from '@/components/ui';
import { t } from '@/i18n';

function SettingsButton() {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={t('Settings')} onPress={() => router.push('/settings')} hitSlop={12} style={{ paddingHorizontal: 16 }}>
      <Icon name="settings-outline" size={22} color={colors.text} />
    </Pressable>
  );
}

const TABS: { name: string; title: () => string; icon: string }[] = [
  { name: 'index', title: () => t('Home'), icon: 'home' },
  { name: 'transactions', title: () => t('Transactions'), icon: 'list' },
  { name: 'budgets', title: () => t('Budgets'), icon: 'pie-chart' },
  { name: 'savings', title: () => t('Savings'), icon: 'trending-up' },
  { name: 'loans', title: () => t('Loans'), icon: 'cash' },
  { name: 'insurance', title: () => t('Insurance'), icon: 'shield-checkmark' },
];

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.card },
        headerTintColor: colors.text,
        headerShadowVisible: false,
        headerRight: () => <SettingsButton />,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
        tabBarLabelStyle: { fontSize: 10 },
        sceneStyle: { backgroundColor: colors.bg },
      }}>
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title(),
            tabBarIcon: ({ color, focused }) => <Icon name={focused ? tab.icon : `${tab.icon}-outline`} color={color as string} size={22} />,
          }}
        />
      ))}
    </Tabs>
  );
}
