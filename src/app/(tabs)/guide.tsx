import { router } from 'expo-router';
import { Pressable, ScrollView, Text, View } from 'react-native';

import { GUIDE } from '@/components/guideContent';
import { Card, colors, Icon, styles } from '@/components/ui';
import { t } from '@/i18n';

/** The guide: every feature explained in short steps with screenshots. */
export default function Guide() {
  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        <Card style={{ backgroundColor: colors.infoBg, borderColor: colors.infoBorder, gap: 6 }}>
          <Text style={[styles.title, { color: colors.infoText }]}>{t('New here?')}</Text>
          <Text style={[styles.body, { color: colors.infoText }]}>{t('Start with the first three topics: they take two minutes and cover what most families use every day. Each topic shows the real screens, and a button to open them.')}</Text>
        </Card>
        {GUIDE.map((topic, i) => (
          <Pressable
            key={topic.id}
            onPress={() => router.push({ pathname: '/guide/[topic]', params: { topic: topic.id } })}
            accessibilityRole="button"
            style={({ pressed }) => [styles.card, styles.row, { alignItems: 'flex-start' }, pressed && styles.pressed]}>
            <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name={topic.icon} color={colors.primary} size={20} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.hint}>{t('Step {n}', { n: i + 1 })}</Text>
              <Text style={styles.title}>{t(topic.title)}</Text>
              <Text style={styles.subtitle}>{t(topic.summary)}</Text>
            </View>
            <Icon name="chevron-forward" color={colors.muted} size={18} />
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
