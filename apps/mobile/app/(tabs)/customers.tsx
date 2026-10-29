// Customers: search by name, phone, email or address. Works with no signal.
import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useSession, can } from '../../src/lib/session';
import { useRows } from '../../src/lib/sync';
import { Screen, Row, SearchBox, Button, T, Pill, Chips, Chip } from '../../src/ui/kit';

export default function Customers() {
  const { member } = useSession();
  const [q, setQ] = useState('');
  const [kind, setKind] = useState<'all' | 'home' | 'business'>('all');
  const custs = useRows<any>('customers');
  const contacts = useRows<any>('customer_contacts');
  const sites = useRows<any>('sites');
  const list = useMemo(() => {
    const s = q.trim().toLowerCase(), digits = s.replace(/\D/g, '');
    return custs.map((c) => {
      const cc = contacts.filter((x) => x.customer_id === c.id), ss = sites.filter((x) => x.customer_id === c.id);
      const phone = (cc.find((x) => x.kind === 'phone' && x.is_primary) ?? cc.find((x) => x.kind === 'phone'))?.value ?? '';
      const addr = (ss.find((x) => x.is_primary) ?? ss[0])?.address ?? '';
      const hay = [c.name, c.contact, addr, ...cc.map((x) => x.value), ...ss.map((x) => x.address)].join(' ').toLowerCase();
      const ok = !s || hay.includes(s) || (digits.length >= 3 && cc.some((x) => x.value.replace(/\D/g, '').includes(digits)));
      return ok && (kind === 'all' || (kind === 'business' ? c.kind === 'business' : c.kind !== 'business')) ? { c, phone, addr } : null;
    }).filter(Boolean).sort((a: any, b: any) => a.c.name.localeCompare(b.c.name)) as { c: any; phone: string; addr: string }[];
  }, [custs, contacts, sites, q, kind]);
  return (
    <Screen bar={can(member, 'customers') ? <Button title="+ Add customer" onPress={() => router.push('/newcust')} /> : undefined}>
      <SearchBox value={q} onChangeText={setQ} placeholder="Search name, phone or address" />
      <Chips>{([['all', 'All'], ['home', 'Homes'], ['business', 'Businesses']] as const).map(([k, l]) => <Chip key={k} label={l} on={kind === k} onPress={() => setKind(k)} />)}</Chips>
      <View style={{ gap: 10 }}>
        {list.slice(0, 200).map(({ c, phone, addr }) => <Row key={c.id} title={c.name} sub={[addr, phone].filter(Boolean).join(' · ') || 'No address yet'} onPress={() => router.push(`/customer/${c.id}`)}
          right={c.kind === 'business' ? <Pill text="Business" /> : c.kind === 'condo' ? <Pill text="Condo" /> : undefined} />)}
        {!list.length ? <T s>{custs.length ? 'No customer matches.' : 'No customers yet.'}</T> : null}
        {list.length > 200 ? <T s>Showing 200. Type more to narrow it down.</T> : null}
      </View>
    </Screen>
  );
}
