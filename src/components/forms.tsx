import { useState, type ReactNode } from 'react';
import { Alert, Modal, Pressable, Switch, Text, TextInput, View, type StyleProp, type ViewStyle } from 'react-native';

import { t } from '@/i18n';
import { moneyInputText, parseMoney } from '@/lib/money';
import { Button, colors, Icon, styles } from './ui';

/** An amount in rupees. Accepts "1,25,000", "1.5L", "2 cr". Hands back paise, or null while empty/invalid. */
export function AmountField({
  label,
  value,
  onChange,
  hint,
  large,
  autoFocus,
}: {
  label: string;
  value: number | null;
  onChange: (paise: number | null) => void;
  hint?: string;
  large?: boolean;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(moneyInputText(value));
  const [seen, setSeen] = useState(value);
  // Follow outside changes (e.g. a default filled in) without fighting the user's typing.
  if (value !== seen) {
    setSeen(value);
    if (parseMoney(text) !== value) setText(moneyInputText(value));
  }
  const invalid = text.trim() !== '' && parseMoney(text) === null;
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.input, { flexDirection: 'row', alignItems: 'center', paddingVertical: large ? 8 : 0 }, invalid && { borderColor: colors.danger }]}>
        <Text style={{ fontSize: large ? 28 : 15, color: colors.muted, marginRight: 4 }}>₹</Text>
        <TextInput
          value={text}
          onChangeText={(v) => {
            setText(v);
            onChange(parseMoney(v));
          }}
          keyboardType="decimal-pad"
          placeholder="0"
          placeholderTextColor={colors.placeholder}
          autoFocus={autoFocus}
          accessibilityLabel={label}
          style={{ flex: 1, minWidth: 0, fontSize: large ? 28 : 15, fontWeight: large ? '700' : '400', color: colors.text, paddingVertical: large ? 4 : 11 }}
        />
      </View>
      {invalid ? <Text style={[styles.hint, { color: colors.danger }]}>{t('Type an amount like 450, 1,25,000 or 1.5L')}</Text> : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** A row of mutually exclusive options that always has one chosen. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label?: string;
}) {
  return (
    <View style={styles.field}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={{ flexDirection: 'row', backgroundColor: colors.subtle, borderRadius: 10, padding: 3 }}>
        {options.map((o) => {
          const selected = o.value === value;
          return (
            <Pressable
              key={o.value}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(o.value)}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center', backgroundColor: selected ? colors.card : 'transparent' }}>
              <Text style={{ fontSize: 14, fontWeight: selected ? '700' : '500', color: selected ? colors.primary : colors.muted }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Chips for picking one item from a list of records (accounts, members). */
export function RecordPicker<T extends { id: string }>({
  label,
  items,
  value,
  onChange,
  getLabel,
  allowNone,
  noneLabel,
  hint,
}: {
  label: string;
  items: T[];
  value: string | null;
  onChange: (id: string | null) => void;
  getLabel: (item: T) => string;
  allowNone?: boolean;
  noneLabel?: string;
  hint?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {allowNone ? (
          <Pressable onPress={() => onChange(null)} style={[styles.chip, value === null && styles.chipSelected]}>
            <Text style={[styles.chipText, value === null && styles.chipTextSelected]}>{noneLabel ?? t('None')}</Text>
          </Pressable>
        ) : null}
        {items.map((item) => {
          const selected = item.id === value;
          return (
            <Pressable key={item.id} onPress={() => onChange(selected && allowNone ? null : item.id)} style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{getLabel(item)}</Text>
            </Pressable>
          );
        })}
      </View>
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

/** Several records at once (members insured under a policy). */
export function MultiPicker<T extends { id: string }>({
  label,
  items,
  value,
  onChange,
  getLabel,
}: {
  label: string;
  items: T[];
  value: string[];
  onChange: (ids: string[]) => void;
  getLabel: (item: T) => string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.chips}>
        {items.map((item) => {
          const selected = value.includes(item.id);
          return (
            <Pressable
              key={item.id}
              onPress={() => onChange(selected ? value.filter((v) => v !== item.id) : [...value, item.id])}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{getLabel(item)}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function CategoryIcon({ icon, color, size = 40 }: { icon: string | null; color: string | null; size?: number }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: (color ?? colors.muted) + '22', alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon ?? 'pricetag'} size={size * 0.5} color={color ?? colors.muted} />
    </View>
  );
}

/** A grid of category tiles, for fast tapping in quick add. */
export function CategoryGrid({
  label,
  categories,
  value,
  onChange,
}: {
  label: string;
  categories: { id: string; name: string; icon: string; color: string }[];
  value: string | null;
  onChange: (id: string) => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
        {categories.map((c) => {
          const selected = c.id === value;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => onChange(c.id)}
              style={({ pressed }) => [
                {
                  width: '25%',
                  padding: 4,
                },
                pressed && styles.pressed,
              ]}>
              <View
                style={{
                  alignItems: 'center',
                  paddingVertical: 8,
                  borderRadius: 12,
                  borderWidth: selected ? 2 : 1,
                  borderColor: selected ? c.color : colors.border,
                  backgroundColor: selected ? c.color + '18' : colors.card,
                  gap: 4,
                }}>
                <Icon name={c.icon} size={22} color={c.color} />
                <Text numberOfLines={2} style={{ fontSize: 11, textAlign: 'center', color: colors.text, paddingHorizontal: 2 }}>
                  {t(c.name)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export function ProgressBar({ ratio, color, marker, height = 8 }: { ratio: number; color?: string; marker?: number; height?: number }) {
  const width = `${Math.max(0, Math.min(1, ratio)) * 100}%` as const;
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: colors.subtle, overflow: 'hidden', marginTop: 8 }}>
      <View style={{ width, height, borderRadius: height / 2, backgroundColor: color ?? colors.primary }} />
      {marker !== undefined ? (
        <View style={{ position: 'absolute', left: `${Math.max(0, Math.min(1, marker)) * 100}%`, top: 0, bottom: 0, width: 2, backgroundColor: colors.text, opacity: 0.35 }} />
      ) : null}
    </View>
  );
}

export function ListRow({
  left,
  title,
  subtitle,
  right,
  rightSub,
  rightColor,
  onPress,
  style,
}: {
  left?: ReactNode;
  title: string;
  subtitle?: string | null;
  right?: string;
  rightSub?: string | null;
  rightColor?: string;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const content = (
    <>
      {left}
      <View style={{ flex: 1 }}>
        <Text style={styles.title} numberOfLines={1}>
          {title}
        </Text>
        {subtitle ? (
          <Text style={styles.subtitle} numberOfLines={2}>
            {subtitle}
          </Text>
        ) : null}
      </View>
      {right !== undefined ? (
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={[styles.title, { color: rightColor ?? colors.text }]}>{right}</Text>
          {rightSub ? <Text style={styles.subtitle}>{rightSub}</Text> : null}
        </View>
      ) : null}
    </>
  );
  if (!onPress) return <View style={[styles.row, { paddingVertical: 8 }, style]}>{content}</View>;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, { paddingVertical: 8 }, pressed && styles.pressed, style]}>
      {content}
    </Pressable>
  );
}

export function SwitchRow({ label, hint, value, onChange }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={[styles.row, { justifyContent: 'space-between' }]}>
      <View style={{ flex: 1 }}>
        <Text style={styles.body}>{label}</Text>
        {hint ? <Text style={styles.hint}>{hint}</Text> : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.primary }} accessibilityLabel={label} />
    </View>
  );
}

export function Divider() {
  return <View style={{ height: 1, backgroundColor: colors.subtle, marginVertical: 4 }} />;
}

/** A label/value pair inside a summary card. */
export function Stat({ label, value, color, align = 'left' }: { label: string; value: string; color?: string; align?: 'left' | 'right' }) {
  return (
    <View style={{ flex: 1, alignItems: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <Text style={styles.hint}>{label}</Text>
      <Text style={{ fontSize: 17, fontWeight: '700', color: color ?? colors.text, marginTop: 2 }}>{value}</Text>
    </View>
  );
}

export function confirmDelete(what: string, onConfirm: () => void) {
  Alert.alert(t('Delete {what}?', { what }), t('This can’t be undone.'), [
    { text: t('Cancel'), style: 'cancel' },
    { text: t('Delete'), style: 'destructive', onPress: onConfirm },
  ]);
}

/** A password box in a modal (Alert.prompt is iOS-only). */
export function PasswordModal({
  visible,
  title,
  message,
  confirmLabel,
  needsRepeat,
  busy,
  onSubmit,
  onCancel,
}: {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  needsRepeat?: boolean;
  busy?: boolean;
  onSubmit: (password: string) => void;
  onCancel: () => void;
}) {
  const [pw, setPw] = useState('');
  const [repeat, setRepeat] = useState('');
  const [wasVisible, setWasVisible] = useState(visible);
  // Clear what was typed each time the box closes.
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (!visible) {
      setPw('');
      setRepeat('');
    }
  }
  const tooShort = pw.length < 6;
  const mismatch = needsRepeat && repeat !== pw;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)', justifyContent: 'center', padding: 24 }}>
        <View style={[styles.card, { gap: 12, padding: 20 }]}>
          <Text style={[styles.title, { fontSize: 18 }]}>{title}</Text>
          <Text style={styles.body}>{message}</Text>
          <TextInput
            value={pw}
            onChangeText={setPw}
            secureTextEntry
            autoFocus
            placeholder={t('Password (at least 6 characters)')}
            placeholderTextColor={colors.placeholder}
            style={styles.input}
          />
          {needsRepeat ? (
            <TextInput value={repeat} onChangeText={setRepeat} secureTextEntry placeholder={t('Type it again')} placeholderTextColor={colors.placeholder} style={styles.input} />
          ) : null}
          {needsRepeat && repeat.length > 0 && mismatch ? <Text style={[styles.hint, { color: colors.danger }]}>{t('The passwords don’t match.')}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title={t('Cancel')} variant="secondary" onPress={onCancel} style={{ flex: 1 }} disabled={busy} />
            <Button title={confirmLabel} onPress={() => onSubmit(pw)} style={{ flex: 1 }} disabled={tooShort || !!mismatch} loading={busy} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
