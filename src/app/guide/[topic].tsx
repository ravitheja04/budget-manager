import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';

import { GUIDE } from '@/components/guideContent';
import { GUIDE_IMAGES } from '@/components/guideImages';
import { Button, Card, colors, Icon, styles } from '@/components/ui';
import { t } from '@/i18n';

/** A screenshot at its own proportions, framed like a phone screen. */
function Screenshot({ name, caption }: { name: string; caption: string }) {
  const [width, setWidth] = useState(0);
  const image = GUIDE_IMAGES[name];
  if (!image) return null;
  const { source, ratio } = image;
  const shown = Math.min(width, 320);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)} style={{ alignItems: 'center', marginVertical: 4 }}>
      {shown > 0 ? (
        <Image
          source={source}
          accessibilityLabel={caption}
          resizeMode="contain"
          style={{ width: shown, height: shown / ratio, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg }}
        />
      ) : null}
    </View>
  );
}

export default function GuideTopic() {
  const { topic } = useLocalSearchParams<{ topic: string }>();
  const index = GUIDE.findIndex((g) => g.id === topic);
  const g = GUIDE[index];
  if (!g) return <View style={styles.screen}><Stack.Screen options={{ title: t('Guide') }} /></View>;
  const next = GUIDE[index + 1];

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: t(g.title) }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]}>
        <Text style={styles.body}>{t(g.summary)}</Text>
        {g.steps.map((s, i) => (
          <Card key={s.title} style={{ gap: 10 }}>
            <View style={[styles.row, { alignItems: 'flex-start' }]}>
              <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: colors.onPrimary, fontWeight: '700' }}>{i + 1}</Text>
              </View>
              <Text style={[styles.title, { flex: 1, fontSize: 17 }]}>{t(s.title)}</Text>
            </View>
            {s.image ? <Screenshot name={s.image} caption={t(s.title)} /> : null}
            {s.body.map((p) => (
              <Text key={p.slice(0, 40)} style={styles.body}>
                {t(p)}
              </Text>
            ))}
            {s.tip ? (
              <View style={[styles.row, { alignItems: 'flex-start', backgroundColor: colors.cautionBg, borderRadius: 10, padding: 10, gap: 8 }]}>
                <Icon name="bulb-outline" color={colors.cautionText} size={18} />
                <Text style={[styles.body, { flex: 1, color: colors.cautionText }]}>{t(s.tip)}</Text>
              </View>
            ) : null}
          </Card>
        ))}
        {g.link ? <Button title={t(g.link.label)} icon="open-outline" onPress={() => router.push(g.link!.path as never)} /> : null}
        {next ? (
          <Button
            title={t('Next: {title}', { title: t(next.title) })}
            variant="secondary"
            icon="arrow-forward"
            onPress={() => router.replace({ pathname: '/guide/[topic]', params: { topic: next.id } })}
          />
        ) : (
          <Button title={t('Back to the guide')} variant="secondary" onPress={() => router.back()} />
        )}
      </ScrollView>
    </View>
  );
}
