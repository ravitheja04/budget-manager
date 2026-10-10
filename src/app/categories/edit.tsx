import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';

import { CategoryIcon, confirmDelete } from '@/components/forms';
import { Button, colors, Field, Icon, styles } from '@/components/ui';
import { getById, remove, save } from '@/db/repo';
import { CATEGORY_IDS } from '@/db/seed';
import { PALETTE } from '@/db/util';
import { t } from '@/i18n';
import type { Category, CategoryKind } from '@/lib/types';
import { showError } from '@/lib/useQuery';

const ICONS = [
  'basket', 'restaurant', 'cafe', 'home', 'flash', 'water', 'flame', 'wifi', 'phone-portrait', 'tv', 'car', 'bus', 'train', 'bicycle', 'school', 'book',
  'medkit', 'fitness', 'bag-handle', 'shirt', 'laptop', 'people', 'film', 'musical-notes', 'airplane', 'gift', 'cut', 'heart', 'paw', 'hand-left',
  'document-text', 'card', 'briefcase', 'storefront', 'key', 'trending-up', 'star', 'cash', 'construct', 'leaf', 'pricetag', 'ellipsis-horizontal-circle',
];

const PROTECTED = new Set(Object.values(CATEGORY_IDS));

export default function EditCategory() {
  const db = useSQLiteContext();
  const params = useLocalSearchParams<{ id?: string; kind?: CategoryKind }>();
  const [original, setOriginal] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('pricetag');
  const [color, setColor] = useState(PALETTE[0]);

  useEffect(() => {
    if (!params.id) return;
    getById<Category>(db, 'categories', params.id)
      .then((c) => {
        if (!c) return;
        setOriginal(c);
        setName(c.name);
        setIcon(c.icon);
        setColor(c.color);
      })
      .catch((e) => showError(t('Could not load data'), e));
  }, [db, params.id]);

  async function onSave() {
    if (!name.trim()) return Alert.alert(t('Enter a name'));
    try {
      const kind = original?.kind ?? params.kind ?? 'expense';
      const sort = original?.sort ?? ((await db.getFirstAsync<{ n: number }>('SELECT COALESCE(MAX(sort), 0) + 1 AS n FROM categories'))?.n ?? 0);
      await save(db, 'categories', { id: original?.id, name: name.trim(), kind, icon, color, sort });
      router.back();
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  async function onDelete() {
    if (!original) return;
    const used = await db.getFirstAsync<{ n: number }>('SELECT (SELECT COUNT(*) FROM transactions WHERE categoryId = ?) + (SELECT COUNT(*) FROM recurring WHERE categoryId = ?) AS n', original.id, original.id);
    if (used?.n) return Alert.alert(t('This category is in use'), t('{n} entries use it. Rename it instead, or move those entries first.', { n: used.n }));
    confirmDelete(t(original.name), async () => {
      try {
        await db.runAsync('DELETE FROM budgets WHERE categoryId = ?', original.id);
        await remove(db, 'categories', original.id);
        router.back();
      } catch (e) {
        showError(t('Could not delete'), e);
      }
    });
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: params.id ? t('Edit category') : t('New category') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <View style={{ alignItems: 'center' }}>
          <CategoryIcon icon={icon} color={color} size={64} />
        </View>
        <Field label={t('Name')} value={name} onChangeText={setName} />
        <Text style={styles.label}>{t('Colour')}</Text>
        <View style={styles.chips}>
          {PALETTE.map((c) => (
            <Pressable key={c} onPress={() => setColor(c)} accessibilityLabel={c} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: colors.text }} />
          ))}
        </View>
        <Text style={styles.label}>{t('Icon')}</Text>
        <View style={styles.chips}>
          {ICONS.map((i) => (
            <Pressable
              key={i}
              onPress={() => setIcon(i)}
              accessibilityLabel={i}
              style={{ width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: icon === i ? color + '22' : colors.card, borderWidth: 1, borderColor: icon === i ? color : colors.border }}>
              <Icon name={i} color={icon === i ? color : colors.muted} />
            </Pressable>
          ))}
        </View>
        <Button title={t('Save')} onPress={onSave} style={{ marginTop: 8 }} />
        {original && !PROTECTED.has(original.id) ? <Button title={t('Delete')} variant="danger" icon="trash-outline" onPress={() => onDelete().catch((e) => showError(t('Could not delete'), e))} /> : null}
      </ScrollView>
    </View>
  );
}
