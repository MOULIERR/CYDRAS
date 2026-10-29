// One customer's texts. Sending checks consent, STOP replies and quiet hours on the server.
import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, Text, TextInput, View, KeyboardAvoidingView, Platform } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useSession } from '../../src/lib/session';
import { callFunction } from '../../src/lib/supabase';
import { useRows } from '../../src/lib/sync';
import { useThreads, markSeen } from '../../src/lib/inbox';
import { fmtTime, dayKey, shortDay, today } from '../../src/lib/data';
import { T, Button, Chip, SmallBtn } from '../../src/ui/kit';
import { F, useT } from '../../src/ui/theme';

const QUICK = ['On my way!', "I'm running about 20 minutes behind.", 'Your invoice is ready. Thank you!'];

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useSession();
  const t = useT();
  const { threads, reload } = useThreads();
  const cust = useRows<any>('customers', (c) => c.id === id, [id])[0];
  const phone = useRows<any>('customer_contacts', (c) => c.customer_id === id && c.kind === 'phone', [id]).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
  const th = threads.find((x) => x.id === id);
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sv = useRef<any>(null);
  useEffect(() => { markSeen(id); }, [id, th?.msgs.length]);
  async function send(body = txt) {
    if (!body.trim()) return;
    setBusy(true); setErr('');
    try { await callFunction('send-sms', { company_id: member!.company_id, customer_id: id, body: body.trim() }); setTxt(''); reload(); }
    catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  let lastDay = '';
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90} style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ title: cust?.name ?? th?.name ?? 'Texts', headerRight: () => <View style={{ flexDirection: 'row', gap: 6 }}>{phone ? <SmallBtn title="Call" icon="phone" onPress={() => Linking.openURL(`tel:${phone.value}`)} /> : null}<SmallBtn title="Info" onPress={() => router.push(`/customer/${id}`)} /></View> }} />
      <ScrollView ref={sv} onContentSizeChange={() => sv.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ padding: 16, gap: 8 }}>
        {(th?.msgs ?? []).map((m) => { const d = dayKey(new Date(m.created_at)); const sep = d !== lastDay; lastDay = d; const me = m.direction === 'out'; return <View key={m.id} style={{ gap: 8 }}>
          {sep ? <Text style={{ alignSelf: 'center', fontFamily: F.bold, fontSize: 12.5, letterSpacing: 0.7, textTransform: 'uppercase', color: t.muted, backgroundColor: t.chip, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }}>{d === today() ? 'Today' : shortDay(d)}</Text> : null}
          <View style={{ maxWidth: '82%', alignSelf: me ? 'flex-end' : 'flex-start', backgroundColor: me ? t.me : t.surface, borderWidth: me ? 0 : 1, borderColor: t.line, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, borderBottomRightRadius: me ? 4 : 16, borderBottomLeftRadius: me ? 16 : 4 }}>
            <Text style={{ fontFamily: F.body, fontSize: 17, color: me ? t.meInk : t.ink }}>{m.body}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: me ? t.meInk : t.muted, opacity: 0.75, marginTop: 4 }}>{fmtTime(m.created_at)}{m.status === 'blocked' || m.status === 'failed' ? ` · Not sent: ${m.error ?? ''}` : ''}</Text></View></View>; })}
        {!th ? <T s style={{ textAlign: 'center' }}>No texts with this customer yet.</T> : null}
      </ScrollView>
      <View style={{ backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.line, padding: 12, gap: 8 }}>
        {err ? <T s color={t.bad}>{err}</T> : null}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{QUICK.map((q) => <Chip key={q} label={q} onPress={() => setTxt(q)} />)}</ScrollView>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput value={txt} onChangeText={setTxt} placeholder="Text the customer" placeholderTextColor={t.muted} multiline accessibilityLabel="Message"
            style={{ flex: 1, minHeight: 54, maxHeight: 120, borderWidth: 1.5, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, paddingTop: 14, fontSize: 17, fontFamily: F.body, color: t.ink, backgroundColor: t.surface }} />
          <View style={{ width: 86 }}><Button title="Send" onPress={() => send()} busy={busy} /></View>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
