// Customers with their phone, address, and text consent (needed before Cydras can text them).
import { useState } from 'react';
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';

export function Customers() {
  const { member } = useSession();
  const c = member!.company_id;
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const { data, reload } = useLive(async () => check(await supabase.from('customers').select('id, name, kind, contact, customer_contacts(kind, value, label, is_primary, sms_consent_at, opted_out_at), sites(address, is_primary)').eq('company_id', c).is('deleted_at', null).order('name')) as any[], ['customers', 'customer_contacts', 'sites'], c, [c]);
  const [f, setF] = useState({ name: '', kind: 'home', contact: '', phone: '', email: '', address: '', consent: false });
  async function add(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try {
      const cu = check(await supabase.from('customers').insert({ company_id: c, name: f.name.trim(), kind: f.kind, contact: f.contact || null }).select('id').single()) as any;
      const rows: any[] = [];
      if (f.phone) rows.push({ company_id: c, customer_id: cu.id, kind: 'phone', value: f.phone, label: 'Mobile', is_primary: true, sms_consent_at: f.consent ? new Date().toISOString() : null, sms_consent_source: f.consent ? `office, by ${member!.name}` : null });
      if (f.email) rows.push({ company_id: c, customer_id: cu.id, kind: 'email', value: f.email, label: 'Main', is_primary: true });
      if (rows.length) check(await supabase.from('customer_contacts').insert(rows));
      if (f.address) check(await supabase.from('sites').insert({ company_id: c, customer_id: cu.id, address: f.address, is_primary: true }));
      setF({ name: '', kind: 'home', contact: '', phone: '', email: '', address: '', consent: false }); reload();
    } catch (e) { setErr((e as Error).message); }
  }
  const list = (data ?? []).filter((x) => !q || x.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <h1>Customers</h1>
      <form className="card" onSubmit={add}>
        <h2>Add a customer</h2>
        <div className="grid">
          <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>Type<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="home">Home</option><option value="business">Business</option><option value="condo">Condo</option></select></label>
          <label>Contact person<input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></label>
          <label>Mobile phone<input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label>Address<input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
        </div>
        <label style={{ flexDirection: 'row', alignItems: 'center' }}><input type="checkbox" style={{ width: 'auto' }} checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
          The customer agreed to get texts about their appointments (they can reply STOP anytime)</label>
        {err && <div className="err">{err}</div>}
        <div><button className="pri">Add customer</button></div>
      </form>
      <input placeholder="Search customers" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card">
        <table><thead><tr><th>Name</th><th>Phone</th><th>Texts</th><th>Address</th></tr></thead><tbody>
          {list.map((x) => { const ph = (x.customer_contacts ?? []).find((p: any) => p.kind === 'phone'); return (
            <tr key={x.id}><td><b>{x.name}</b><br /><span className="muted">{x.kind}{x.contact ? ` · ${x.contact}` : ''}</span></td><td>{ph?.value ?? '—'}</td>
              <td>{!ph ? '—' : ph.opted_out_at ? <span className="pill bad">Replied STOP</span> : ph.sms_consent_at ? <span className="pill ok">OK to text</span> : <span className="pill">No consent yet</span>}</td>
              <td>{(x.sites ?? []).find((s: any) => s.is_primary)?.address ?? (x.sites ?? [])[0]?.address ?? '—'}</td></tr>); })}
        </tbody></table>
      </div>
    </>
  );
}
