// Price book: your prices for every task, by customer type. Set on the office website.
import { useState } from 'react';
import { View } from 'react-native';
import { useSession, can } from '../src/lib/session';
import { useRows } from '../src/lib/sync';
import { money } from '../src/lib/data';
import { Screen, Card, T, SearchBox, Seg, Eyebrow } from '../src/ui/kit';
import { useT } from '../src/ui/theme';

export default function PriceBook() {
  const { member } = useSession();
  const t = useT();
  const items = useRows<any>('price_items', (p) => p.active !== false);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState('res');
  const see = can(member, 'seePrices');
  const list = items.filter((p) => !q || (p.name + ' ' + p.category).toLowerCase().includes(q.toLowerCase())).sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name));
  const cats = [...new Set(list.map((p) => p.category))];
  return <Screen>
    <Seg value={tier} onChange={setTier} options={[['res', 'Residential'], ['com', 'Commercial'], ['ah', 'After hours']]} />
    <SearchBox value={q} onChangeText={setQ} placeholder="Search tasks" />
    {cats.map((c) => <View key={c}><Eyebrow style={{ marginBottom: 8 }}>{c}</Eyebrow><Card style={{ gap: 0, paddingVertical: 4 }}>
      {list.filter((p) => p.category === c).map((p, i, arr) => <View key={p.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderColor: t.line }}>
        <View style={{ flex: 1 }}><T b>{p.name}</T>{p.unit ? <T s size={13}>per {p.unit}</T> : null}</View><T mono>{see ? money(Number(p.prices?.[tier] ?? p.prices?.res ?? 0)) : '$ ——'}</T></View>)}</Card></View>)}
    {!items.length ? <T s>No prices yet. The owner adds them on the office website → Price book (there's a "Load starter prices" button).</T> : null}
  </Screen>;
}
