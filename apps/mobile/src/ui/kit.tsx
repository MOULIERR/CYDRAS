// Shared pieces for every phone screen, styled like the phone mockup.
import { type ReactNode } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Switch as RNSwitch, Text, TextInput, View, type TextInputProps, type TextStyle, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSyncState } from '../lib/sync';
import { F, LIGHT, shadow, useT } from './theme';
import { Icon } from './icons';

export const C = LIGHT; // older screens
export { Icon };

/** A page: scrolls, 16px sides, optional action bar stuck to the bottom (like the mockup). */
export function Screen({ children, scroll = true, bar, gap = 18, pad = 16 }: { children: ReactNode; scroll?: boolean; bar?: ReactNode; gap?: number; pad?: number }) {
  const t = useT();
  const ins = useSafeAreaInsets();
  const body = <View style={{ padding: pad, gap, paddingBottom: bar ? 120 : 32 }}><OfflineBanner />{children}</View>;
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, backgroundColor: t.bg }} keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}>
      {scroll ? <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">{body}</ScrollView> : <View style={{ flex: 1 }}>{body}</View>}
      {bar ? <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.line, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 12 + (Platform.OS === 'web' ? 0 : ins.bottom * 0) }}>
        <View style={{ flexDirection: 'row', gap: 10 }}>{bar}</View></View> : null}
    </KeyboardAvoidingView>
  );
}

export function OfflineBanner() {
  const s = useSyncState();
  const t = useT();
  if (s.online && !s.failed) return null;
  return (
    <View style={{ backgroundColor: s.online ? t.bad : t.accent, borderRadius: 12, padding: 12 }}>
      <Text style={{ color: '#fff', fontFamily: F.semi, fontSize: 15 }}>
        {!s.online ? `No signal. Your work is saved on this phone${s.pending ? ` (${s.pending} change${s.pending > 1 ? 's' : ''} waiting)` : ''} and sends when you're back online.` : `${s.failed} change${s.failed > 1 ? 's were' : ' was'} not allowed. Open More → Sync to see why.`}
      </Text>
    </View>
  );
}

export function Card({ children, style, onPress }: { children: ReactNode; style?: ViewStyle; onPress?: () => void }) {
  const t = useT();
  const st: ViewStyle = { backgroundColor: t.surface, borderRadius: 16, padding: 16, gap: 6, borderWidth: 1, borderColor: t.line, ...shadow(t), ...style };
  if (onPress) return <Pressable onPress={onPress} style={({ pressed }) => [st, pressed && { opacity: 0.85, transform: [{ scale: 0.99 }] }]}>{children}</Pressable>;
  return <View style={st}>{children}</View>;
}

export function H1({ children, style }: { children: ReactNode; style?: TextStyle }) { const t = useT(); return <Text style={[{ fontFamily: F.display, fontSize: 32, lineHeight: 34, color: t.ink }, style]}>{children}</Text>; }
export function H2({ children, style }: { children: ReactNode; style?: TextStyle }) { const t = useT(); return <Text style={[{ fontFamily: F.display, fontSize: 24, lineHeight: 26, color: t.ink }, style]}>{children}</Text>; }
export function T({ children, style, s, b, mono, color, size, lines }: { children: ReactNode; style?: TextStyle; s?: boolean; b?: boolean; mono?: boolean; color?: string; size?: number; lines?: number }) {
  const t = useT();
  return <Text numberOfLines={lines} style={[{ fontFamily: mono ? F.mono : b ? F.semi : F.body, fontSize: size ?? (s ? 15 : 17), lineHeight: (size ?? (s ? 15 : 17)) * 1.35, color: color ?? (s ? t.muted : t.ink) }, style]}>{children}</Text>;
}
export const Small = ({ children, color }: { children: ReactNode; color?: string }) => <T s color={color}>{children}</T>;
export function Eyebrow({ children, style }: { children: ReactNode; style?: TextStyle }) { const t = useT(); return <Text style={[{ fontFamily: F.semi, fontSize: 13, letterSpacing: 1.3, color: t.muted, textTransform: 'uppercase' }, style]}>{children}</Text>; }

/** Section title with small buttons on the right (like "Your tasks · 3   + New  All"). */
export function SecHead({ title, children }: { title: string; children?: ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}><Eyebrow style={{ flex: 1 }}>{title}</Eyebrow><View style={{ flexDirection: 'row', gap: 6 }}>{children}</View></View>;
}
export function SmallBtn({ title, onPress, icon }: { title: string; onPress: () => void; icon?: string }) {
  const t = useT();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: t.line, backgroundColor: t.surface, borderRadius: 999, paddingHorizontal: 12, minHeight: 38, opacity: pressed ? 0.7 : 1 })}>
    {icon ? <Icon name={icon} size={16} color={t.ink} /> : null}<Text style={{ fontFamily: F.semi, fontSize: 14, color: t.ink }}>{title}</Text></Pressable>;
}

export function Button({ title, onPress, kind = 'primary', busy, disabled, small, icon, flex = true }: { title: string; onPress: () => void; kind?: 'primary' | 'secondary' | 'danger' | 'dark' | 'ghost'; busy?: boolean; disabled?: boolean; small?: boolean; icon?: string; flex?: boolean }) {
  const t = useT();
  const bg = kind === 'primary' ? t.accent : kind === 'dark' ? t.steel : kind === 'danger' ? 'transparent' : kind === 'ghost' ? 'rgba(255,255,255,.12)' : t.chip;
  const fg = kind === 'primary' ? t.accentInk : kind === 'dark' || kind === 'ghost' ? t.steelInk : kind === 'danger' ? t.bad : t.ink;
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: !!(disabled || busy) }} onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [{ flex: flex ? 1 : undefined, flexDirection: 'row', gap: 8, backgroundColor: bg, minHeight: small ? 46 : 58, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, opacity: disabled ? 0.45 : 1, borderWidth: kind === 'danger' ? 1.5 : 0, borderColor: t.bad, transform: [{ scale: pressed ? 0.97 : 1 }] }, kind === 'primary' && !t.dark ? { shadowColor: t.accent, shadowOpacity: 0.3, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 3 } : null]}>
      {busy ? <ActivityIndicator color={fg} /> : <>{icon ? <Icon name={icon} size={small ? 18 : 22} color={fg} /> : null}<Text style={{ color: fg, fontFamily: F.display, fontSize: small ? 17 : 20, letterSpacing: 0.8, textTransform: 'uppercase' }}>{title}</Text></>}
    </Pressable>
  );
}

export function Field({ label, hint, style, ...p }: TextInputProps & { label?: string; hint?: string }) {
  const t = useT();
  return (
    <View style={{ gap: 6 }}>
      {label ? <Text style={{ fontFamily: F.semi, fontSize: 15, color: t.ink }}>{label}</Text> : null}
      {hint ? <Text style={{ fontFamily: F.body, fontSize: 14, color: t.muted, marginTop: -2 }}>{hint}</Text> : null}
      <TextInput placeholderTextColor={t.muted} {...p} style={[{ backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, minHeight: 54, fontSize: 18, color: t.ink, fontFamily: F.body }, p.multiline && { minHeight: 96, paddingTop: 12, textAlignVertical: 'top' }, style as any]} />
    </View>
  );
}

export function SearchBox({ value, onChangeText, placeholder }: { value: string; onChangeText: (s: string) => void; placeholder: string }) {
  const t = useT();
  return <View style={{ justifyContent: 'center' }}>
    <View style={{ position: 'absolute', left: 14, zIndex: 1 }}><Icon name="search" size={20} color={t.muted} /></View>
    <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={t.muted} accessibilityLabel={placeholder} autoCorrect={false}
      style={{ backgroundColor: t.surface, borderWidth: 1.5, borderColor: t.line, borderRadius: 10, paddingLeft: 44, paddingRight: 12, minHeight: 54, fontSize: 18, color: t.ink, fontFamily: F.body }} /></View>;
}

/** A big tap row (the mockup's .row). */
export function Row({ title, sub, left, right, onPress, children, highlight }: { title?: string; sub?: string; left?: ReactNode; right?: ReactNode; onPress?: () => void; children?: ReactNode; highlight?: boolean }) {
  const t = useT();
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? 'button' : undefined}
      style={({ pressed }) => [{ backgroundColor: t.surface, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 14, minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: highlight ? t.accent : t.line, ...shadow(t) }, pressed && { opacity: 0.85 }]}>
      {left}
      <View style={{ flex: 1, minWidth: 0, gap: 1 }}>{title ? <T b size={17}>{title}</T> : null}{sub ? <T s size={14.5}>{sub}</T> : null}{children}</View>
      {right}
    </Pressable>
  );
}

export const STATUS: Record<string, [string, 'sched' | 'route' | 'site' | 'done' | 'bad']> = {
  scheduled: ['Scheduled', 'sched'], on_the_way: ['On the way', 'route'], on_site: ['On site', 'site'], done: ['Done', 'done'], no_show: ['No-show', 'bad'], canceled: ['Canceled', 'bad'],
};
export function Pill({ text, kind = 'sched' }: { text: string; kind?: 'sched' | 'route' | 'site' | 'done' | 'bad' | 'warn' | 'accent' }) {
  const t = useT();
  const [bg, fg] = { sched: [t.chip, t.muted], route: [t.accent, t.accentInk], site: [t.steel, t.steelInk], done: [t.ok, '#fff'], bad: [t.bad, '#fff'], warn: [t.warn, '#fff'], accent: [t.accentSoft, t.accent] }[kind];
  return <Text style={{ fontFamily: F.semi, fontSize: 12, letterSpacing: 0.7, textTransform: 'uppercase', backgroundColor: bg, color: fg, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, overflow: 'hidden' }}>{text}</Text>;
}
export const StatusPill = ({ s }: { s: string }) => { const x = STATUS[s] ?? STATUS.scheduled; return <Pill text={x[0]} kind={x[1]} />; };

export function Chip({ label, on, onPress, color }: { label: string; on?: boolean; onPress: () => void; color?: string }) {
  const t = useT();
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: !!on }} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: on ? t.steel : t.line, backgroundColor: on ? t.steel : t.surface, borderRadius: 999, paddingHorizontal: 16, minHeight: 42, justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
    {color ? <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color }} /> : null}
    <Text style={{ fontFamily: F.semi, fontSize: 15, color: on ? t.steelInk : t.ink }}>{label}</Text></Pressable>;
}
export const Chips = ({ children }: { children: ReactNode }) => <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>;

export function Seg<K extends string>({ value, options, onChange }: { value: K; options: [K, string][]; onChange: (k: K) => void }) {
  const t = useT();
  return <View style={{ flexDirection: 'row', gap: 4, backgroundColor: t.chip, borderRadius: 10, padding: 4 }}>
    {options.map(([k, l]) => <Pressable key={k} accessibilityRole="button" accessibilityState={{ selected: value === k }} onPress={() => onChange(k)}
      style={{ flex: 1, minHeight: 44, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: value === k ? t.surface : 'transparent', ...(value === k ? shadow(t) : {}) }}>
      <Text style={{ fontFamily: F.semi, fontSize: 15, color: t.ink }}>{l}</Text></Pressable>)}
  </View>;
}

export function Menu({ children }: { children: ReactNode }) { const t = useT(); return <View style={{ backgroundColor: t.surface, borderRadius: 16, borderWidth: 1, borderColor: t.line, overflow: 'hidden', ...shadow(t) }}>{children}</View>; }
export function MenuItem({ icon, title, sub, onPress, danger, right, last }: { icon?: string; title: string; sub?: string; onPress?: () => void; danger?: boolean; right?: ReactNode; last?: boolean }) {
  const t = useT();
  const col = danger ? t.bad : t.ink;
  return <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 62, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderColor: t.line, backgroundColor: pressed ? t.chip : 'transparent' })}>
    {icon ? <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: danger ? 'transparent' : t.chip, borderWidth: danger ? 1.5 : 0, borderColor: t.bad, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={col} /></View> : null}
    <View style={{ flex: 1, minWidth: 0 }}><T b color={col}>{title}</T>{sub ? <T s size={14}>{sub}</T> : null}</View>
    {right ?? (onPress && !danger ? <Text style={{ color: t.muted, fontSize: 22 }}>›</Text> : null)}
  </Pressable>;
}
export function SwitchRow({ title, sub, value, onChange, disabled, last }: { title: string; sub?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean; last?: boolean }) {
  const t = useT();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 62, paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: last ? 0 : 1, borderColor: t.line }}>
    <View style={{ flex: 1 }}><T b>{title}</T>{sub ? <T s size={14}>{sub}</T> : null}</View>
    <RNSwitch value={value} onValueChange={onChange} disabled={disabled} trackColor={{ true: t.ok, false: t.line }} thumbColor="#fff" accessibilityLabel={title} />
  </View>;
}

/** Red-dot alert row ("2 unread texts from customers"). */
export function AlertRow({ text, onPress, color }: { text: string; onPress?: () => void; color?: string }) {
  const t = useT();
  return <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: t.line, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, minHeight: 46, backgroundColor: pressed ? t.chip : t.surface })}>
    <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: color ?? t.bad }} /><T b size={15} style={{ flex: 1 }}>{text}</T></Pressable>;
}

export function Empty({ children }: { children: ReactNode }) { return <T s>{children}</T>; }

export function Avatar({ name, size = 36, color }: { name: string; size?: number; color?: string }) {
  const t = useT();
  const ini = name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color ?? t.steel, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#fff', fontFamily: F.display, fontSize: size * 0.42 }}>{ini}</Text></View>;
}

/** Bottom sheet pop-up (the mockup's .sheet). */
export function Sheet({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const t = useT();
  const ins = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(10,16,22,.5)' }} onPress={onClose} accessibilityLabel="Close" />
        <View style={{ backgroundColor: t.bg, borderTopLeftRadius: 18, borderTopRightRadius: 18, maxHeight: '88%', paddingBottom: 16 + ins.bottom }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6 }}>
            <Text style={{ flex: 1, fontFamily: F.display, fontSize: 24, color: t.ink }}>{title}</Text>
            <Pressable onPress={onClose} accessibilityLabel="Close" style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.chip, alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={20} color={t.ink} /></Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, paddingTop: 8, gap: 12 }}>{children}</ScrollView>
          {footer ? <View style={{ flexDirection: 'row', gap: 10, paddingHorizontal: 16 }}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Line({ left, right, bold, color }: { left: ReactNode; right: ReactNode; bold?: boolean; color?: string }) {
  const t = useT();
  return <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: t.line }}>
    <T b={bold} color={color} style={{ flex: 1 }}>{left}</T><T mono color={color}>{right}</T></View>;
}

export function Loading() { const t = useT(); return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: t.bg, padding: 32 }}><ActivityIndicator color={t.accent} size="large" /></View>; }
