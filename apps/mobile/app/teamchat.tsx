// Team chat: one room for the whole crew (same as the office Inbox → Team chat).
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { useSession } from '../src/lib/session';
import { supabase } from '../src/lib/supabase';
import { useRows } from '../src/lib/sync';
import { useQuery, check, fmtTime, dayKey, shortDay, today } from '../src/lib/data';
import { T, Button } from '../src/ui/kit';
import { F, useT } from '../src/ui/theme';

export default function TeamChat() {
  const { member } = useSession();
  const t = useT();
  const team = useRows<any>('members');
  const c = member!.company_id;
  const q = useQuery(async () => check(await supabase.from('team_messages').select('id, from_member, body, created_at').eq('company_id', c).eq('thread', 'all').order('created_at', { ascending: false }).limit(200)) as any[], [c], ['team_messages']);
  const [txt, setTxt] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const sv = useRef<any>(null);
  const name = (id: string) => team.find((p) => p.id === id)?.name ?? '';
  async function send() {
    if (!txt.trim()) return;
    setBusy(true); setErr('');
    try { check(await supabase.from('team_messages').insert({ company_id: c, thread: 'all', from_member: member!.id, body: txt.trim() })); setTxt(''); q.reload(); } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  let last = '';
  const msgs = [...(q.data ?? [])].reverse();
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90} style={{ flex: 1, backgroundColor: t.bg }}>
      <ScrollView ref={sv} onContentSizeChange={() => sv.current?.scrollToEnd({ animated: false })} contentContainerStyle={{ padding: 16, gap: 8 }}>
        {q.error ? <T s color={t.bad}>Team chat needs signal. {q.error}</T> : null}
        {msgs.map((m) => { const d = dayKey(new Date(m.created_at)); const sep = d !== last; last = d; const me = m.from_member === member!.id; return <View key={m.id} style={{ gap: 8 }}>
          {sep ? <Text style={{ alignSelf: 'center', fontFamily: F.bold, fontSize: 12.5, letterSpacing: 0.7, textTransform: 'uppercase', color: t.muted, backgroundColor: t.chip, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' }}>{d === today() ? 'Today' : shortDay(d)}</Text> : null}
          <View style={{ maxWidth: '82%', alignSelf: me ? 'flex-end' : 'flex-start', backgroundColor: me ? t.me : t.surface, borderWidth: me ? 0 : 1, borderColor: t.line, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 }}>
            {!me ? <Text style={{ fontFamily: F.bold, fontSize: 13, color: t.ink, opacity: 0.75, marginBottom: 2 }}>{name(m.from_member)}</Text> : null}
            <Text style={{ fontFamily: F.body, fontSize: 17, color: me ? t.meInk : t.ink }}>{m.body}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 11, color: me ? t.meInk : t.muted, opacity: 0.75, marginTop: 4 }}>{fmtTime(m.created_at)}</Text></View></View>; })}
        {q.data && !msgs.length ? <T s style={{ textAlign: 'center' }}>No messages yet. Say hi to the team.</T> : null}
      </ScrollView>
      <View style={{ backgroundColor: t.surface, borderTopWidth: 1, borderColor: t.line, padding: 12, gap: 8 }}>
        {err ? <T s color={t.bad}>{err}</T> : null}
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TextInput value={txt} onChangeText={setTxt} placeholder="Message the team" placeholderTextColor={t.muted} multiline accessibilityLabel="Message"
            style={{ flex: 1, minHeight: 54, maxHeight: 120, borderWidth: 1.5, borderColor: t.line, borderRadius: 10, paddingHorizontal: 12, paddingTop: 14, fontSize: 17, fontFamily: F.body, color: t.ink, backgroundColor: t.surface }} />
          <View style={{ width: 86 }}><Button title="Send" onPress={send} busy={busy} /></View></View>
      </View>
    </KeyboardAvoidingView>
  );
}
