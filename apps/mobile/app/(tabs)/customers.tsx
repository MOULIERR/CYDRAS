import { useState } from 'react';
import { useRows } from '../../src/lib/sync';
import { Screen, Field, Row, Small } from '../../src/ui/kit';

export default function Customers() {
  const [q, setQ] = useState('');
  const customers = useRows<any>('customers');
  const sites = useRows<any>('sites');
  const list = customers.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())).sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Screen>
      <Field label="Search" value={q} onChangeText={setQ} placeholder="Name" />
      {list.map((c) => <Row key={c.id} title={c.name} sub={sites.find((s) => s.customer_id === c.id && s.is_primary)?.address ?? sites.find((s) => s.customer_id === c.id)?.address ?? ''} />)}
      {!list.length && <Small>No customers yet.</Small>}
    </Screen>
  );
}
