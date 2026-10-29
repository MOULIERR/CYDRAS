// Texts: customer conversations (newest first, red dot = unread) and team chat.
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { useThreads } from '../../src/lib/inbox';
import { fmtTime, dayKey, today, shortDay } from '../../src/lib/data';
import { Screen, T, Seg, SearchBox, Avatar, Card, Icon } from '../../src/ui/kit';
import { shadow, useT } from '../../src/ui/theme';

const when = (iso: string) => (dayKey(new Date(iso)) === today() ? fmtTime(iso) : shortDay(dayKey(new Date(iso))).replace(/^\w+, /, ''));

export default function Inbox() {
  const t = useT();
  const [tab, setTab] = useState<'cust' | 'team'>('cust');
  const [q, setQ] = useState('');
  const { threads, error, loading } = useThreads();
  const list = threads.filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Screen>
      <Seg value={tab} onChange={(v) => (v === 'team' ? router.push('/teamchat') : setTab(v))} options={[['cust', 'Customers'], ['team', 'Team chat']]} />
      <SearchBox value={q} onChangeText={setQ} placeholder="Search customer" />
      {error ? <T s color={t.bad}>Texts need signal. {error}</T> : null}
      {loading ? <T s>Loading…</T> : null}
      <View style={{ gap: 10 }}>{list.map((x) => <Pressable key={x.id} onPress={() => router.push(`/thread/${x.id}`)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 16, padding: 14, opacity: pressed ? 0.85 : 1, ...shadow(t) })}>
        <Avatar name={x.name} size={44} />
        <View style={{ flex: 1, minWidth: 0 }}><View style={{ flexDirection: 'row', gap: 8 }}><T b style={{ flex: 1 }} lines={1}>{x.name}</T><T s mono size={12.5}>{when(x.last.created_at)}</T></View>
          <T s size={14.5} lines={1}>{x.last.direction === 'out' ? 'You: ' : ''}{x.last.body}</T></View>
        {x.unread ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.bad }} /> : null}
      </Pressable>)}</View>
      {!loading && !list.length ? <Card style={{ alignItems: 'center', gap: 8 }}><Icon name="chat" size={30} color={t.muted} /><T s style={{ textAlign: 'center' }}>No texts yet. Texts from customers show up here once the business texting number is set up.</T></Card> : null}
    </Screen>
  );
}
