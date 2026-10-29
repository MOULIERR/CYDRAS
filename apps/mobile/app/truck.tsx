// My truck: parts on your truck, what's low. Parts come off the truck when you add them to a job.
import { useState } from 'react';
import { View } from 'react-native';
import { useSession, isManager } from '../src/lib/session';
import { useRows } from '../src/lib/sync';
import { Screen, Card, T, SearchBox, Pill, Chips, Chip } from '../src/ui/kit';
import { useT } from '../src/ui/theme';

export default function Truck() {
  const { member } = useSession();
  const t = useT();
  const locs = useRows<any>('stock_locations', (l) => l.kind === 'truck');
  const mine = locs.find((l) => l.member_id === member?.id);
  const [loc, setLoc] = useState<string>('');
  const cur = locs.find((l) => l.id === loc) ?? mine ?? (isManager(member) ? locs[0] : undefined);
  const stock = useRows<any>('stock', (s) => s.location_id === cur?.id, [cur?.id]);
  const parts = useRows<any>('parts');
  const [q, setQ] = useState('');
  const rows = stock.map((s) => ({ s, p: parts.find((x) => x.id === s.part_id) })).filter((x) => x.p && (!q || x.p.name.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => Number(b.s.qty <= b.s.min_qty) - Number(a.s.qty <= a.s.min_qty) || a.p.name.localeCompare(b.p.name));
  const low = rows.filter((x) => x.s.qty <= x.s.min_qty).length;
  return <Screen>
    {isManager(member) && locs.length > 1 ? <Chips>{locs.map((l) => <Chip key={l.id} label={l.name} on={cur?.id === l.id} onPress={() => setLoc(l.id)} />)}</Chips> : null}
    {!cur ? <Card><T b>No truck yet</T><T s>The office sets up your truck on the website (Tech inventory → + Add truck), then fills it from the shop.</T></Card> : <>
      <Card><T b size={19}>{cur.name}</T><T s>{rows.length} parts{low ? ` · ${low} low` : ''}</T></Card>
      <SearchBox value={q} onChangeText={setQ} placeholder="Search parts" />
      <Card style={{ gap: 0, paddingVertical: 4 }}>{rows.map(({ s, p }, i) => <View key={s.part_id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderColor: t.line }}>
        <View style={{ flex: 1 }}><T b>{p.name}</T><T s size={13.5}>{p.part_number ? `${p.part_number} · ` : ''}keep at least {s.min_qty}</T></View>
        <T mono size={18}>{s.qty}</T>{s.qty <= s.min_qty ? <Pill text="Low" kind="bad" /> : null}</View>)}
        {!rows.length ? <T s style={{ paddingVertical: 10 }}>Nothing on this truck.</T> : null}</Card>
    </>}
  </Screen>;
}
