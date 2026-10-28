// Cydras look: white, charcoal and orange. Big buttons for gloves and sunlight.
import { type ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useSyncState } from '../lib/sync';

export const C = { bg: '#F6F5F2', card: '#FFFFFF', ink: '#1F242C', muted: '#5F6670', line: '#E4E2DD', accent: '#F26B1D', ok: '#2F9E44', bad: '#C92A2A', warn: '#B4520E' };

export function Screen({ children, scroll = true }: { children: ReactNode; scroll?: boolean }) {
  const body = <View style={{ padding: 16, gap: 14 }}><OfflineBanner />{children}</View>;
  return <SafeAreaView edges={['left', 'right']} style={{ flex: 1, backgroundColor: C.bg }}>{scroll ? <ScrollView keyboardShouldPersistTaps="handled">{body}</ScrollView> : body}</SafeAreaView>;
}

export function OfflineBanner() {
  const s = useSyncState();
  if (s.online && !s.failed) return null;
  return (
    <View style={{ backgroundColor: s.online ? '#FDECEC' : '#FFF4EC', borderRadius: 12, padding: 12 }}>
      <Text style={{ color: s.online ? C.bad : C.warn, fontWeight: '700' }}>
        {!s.online ? `No signal. Your work is saved on this phone${s.pending ? ` (${s.pending} change${s.pending > 1 ? 's' : ''} waiting)` : ''} and will send when you're back online.` : `${s.failed} change${s.failed > 1 ? 's were' : ' was'} not allowed. Open More → Sync to see why.`}
      </Text>
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[{ backgroundColor: C.card, borderRadius: 16, padding: 16, gap: 8, borderWidth: 1, borderColor: C.line }, style]}>{children}</View>;
}

export function H1({ children }: { children: ReactNode }) { return <Text style={{ fontSize: 28, fontWeight: '800', color: C.ink }}>{children}</Text>; }
export function H2({ children }: { children: ReactNode }) { return <Text style={{ fontSize: 19, fontWeight: '700', color: C.ink }}>{children}</Text>; }
export function Small({ children, color = C.muted }: { children: ReactNode; color?: string }) { return <Text style={{ fontSize: 15, color }}>{children}</Text>; }
export function Eyebrow({ children }: { children: ReactNode }) { return <Text style={{ fontSize: 12, fontWeight: '800', letterSpacing: 1, color: C.muted, textTransform: 'uppercase' }}>{children}</Text>; }

export function Button({ title, onPress, kind = 'primary', busy, disabled }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger'; busy?: boolean; disabled?: boolean }) {
  const bg = kind === 'primary' ? C.accent : kind === 'danger' ? '#FDECEC' : '#EFEDE8';
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? C.bad : C.ink;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [{ backgroundColor: bg, minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 18, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 }]}>
      {busy ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 18, fontWeight: '800' }}>{title}</Text>}
    </Pressable>
  );
}

export function Field({ label, ...p }: TextInputProps & { label: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink }}>{label}</Text>
      <TextInput placeholderTextColor="#9AA0A6" {...p} style={[st.input, p.multiline && { minHeight: 96, textAlignVertical: 'top' }]} />
    </View>
  );
}

export function Row({ title, sub, right, onPress }: { title: string; sub?: string; right?: ReactNode; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [st.row, pressed && { opacity: 0.85 }]}>
      <View style={{ flex: 1, gap: 2 }}><Text style={{ fontSize: 17, fontWeight: '700', color: C.ink }}>{title}</Text>{sub ? <Small>{sub}</Small> : null}</View>
      {right}
    </Pressable>
  );
}

export function Pill({ text, color = C.muted }: { text: string; color?: string }) {
  return <Text style={{ fontSize: 12, fontWeight: '800', color, borderWidth: 1, borderColor: color, borderRadius: 99, paddingHorizontal: 8, paddingVertical: 3, overflow: 'hidden', textTransform: 'uppercase' }}>{text}</Text>;
}

const st = StyleSheet.create({
  input: { backgroundColor: '#fff', borderWidth: 1.5, borderColor: C.line, borderRadius: 12, paddingHorizontal: 14, minHeight: 52, fontSize: 17, color: C.ink },
  row: { backgroundColor: C.card, borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: C.line },
});
