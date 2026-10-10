import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { confirmDelete } from '@/components/forms';
import { Button, ChipSelect, Field, styles } from '@/components/ui';
import { getById, notifyChange, remove, save } from '@/db/repo';
import { PALETTE } from '@/db/util';
import { t } from '@/i18n';
import type { Member } from '@/lib/types';
import { showError } from '@/lib/useQuery';

const RELATIONS = ['Self', 'Spouse', 'Son', 'Daughter', 'Father', 'Mother', 'Father-in-law', 'Mother-in-law', 'Brother', 'Sister', 'Other'];

export default function EditMember() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [original, setOriginal] = useState<Member | null>(null);
  const [name, setName] = useState('');
  const [relation, setRelation] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    getById<Member>(db, 'members', id)
      .then((m) => {
        if (!m) return;
        setOriginal(m);
        setName(m.name);
        setRelation(m.relation || null);
      })
      .catch((e) => showError(t('Could not load data'), e));
  }, [db, id]);

  async function onSave() {
    if (!name.trim()) return Alert.alert(t('Enter a name'));
    try {
      let color = original?.color;
      if (!color) {
        const count = await db.getFirstAsync<{ n: number }>('SELECT COUNT(*) AS n FROM members');
        color = PALETTE[(count?.n ?? 0) % PALETTE.length];
      }
      await save(db, 'members', { id: original?.id, name: name.trim(), relation: relation ?? '', color, createdAt: original?.createdAt });
      router.back();
    } catch (e) {
      showError(t('Could not save'), e);
    }
  }

  function onDelete() {
    if (!id) return;
    confirmDelete(name, async () => {
      try {
        // Entries, policies and loans stay; they just no longer name this person.
        for (const [table, col] of [
          ['transactions', 'memberId'],
          ['recurring', 'memberId'],
          ['holdings', 'memberId'],
          ['loans', 'memberId'],
          ['policies', 'holderId'],
        ]) {
          await db.runAsync(`UPDATE ${table} SET ${col} = NULL, updatedAt = ? WHERE ${col} = ?`, new Date().toISOString(), id);
        }
        await db.runAsync('DELETE FROM policy_members WHERE memberId = ?', id);
        await remove(db, 'members', id);
        notifyChange();
        router.back();
      } catch (e) {
        showError(t('Could not delete'), e);
      }
    });
  }

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ title: id ? t('Edit member') : t('New member') }} />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: 40 }]} keyboardShouldPersistTaps="handled">
        <Field label={t('Name')} value={name} onChangeText={setName} autoFocus={!id} />
        <ChipSelect label={t('Relation')} options={RELATIONS} value={relation} onChange={setRelation} renderLabel={(r) => t(r)} />
        <Button title={t('Save')} onPress={onSave} style={{ marginTop: 8 }} />
        {id ? <Button title={t('Delete')} variant="danger" icon="trash-outline" onPress={onDelete} /> : null}
      </ScrollView>
    </View>
  );
}
