// Customers list and one customer's page, laid out like the mockup.
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { supabase, check } from '../supabase';
import { useSession, isManager } from '../session';
import { useLive } from '../live';
import { CatTag, Modal, PageH, StatusPill, catsOf, dayKey, dayLabel, money, paidOn, useCompany } from '../ui';

const KINDS: [string, string][] = [['all', 'All'], ['home', 'Homes'], ['business', 'Businesses'], ['condo', 'Condos']];
const kindLabel = (k: string) => ({ home: 'Home', business: 'Business', condo: 'Condo' } as Record<string, string>)[k] ?? k;
const owedOf = (invs: any[]) => invs.filter((i) => !i.deleted_at && i.status !== 'void').reduce((a, i) => a + Math.max(0, Number(i.total) - paidOn(i.payments ?? [])), 0);

export function Customers() {
  const { member } = useSession();
  const c = member!.company_id;
  const can = (p: string) => member!.role === 'owner' || !!member!.perms?.[p];
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [kind, setKind] = useState('all');
  const [q, setQ] = useState(sp.get('q') ?? '');
  const [adding, setAdding] = useState(false);
  const { data, reload } = useLive(async () => check(await supabase.from('customers')
    .select('id, name, kind, contact, customer_contacts(kind, value, is_primary, deleted_at), sites(address, is_primary, deleted_at), units(id, deleted_at), invoices(total, status, deleted_at, payments(amount, refunded_amount, voided_at, status))')
    .eq('company_id', c).is('deleted_at', null).order('name')) as any[], ['customers', 'customer_contacts', 'sites', 'units', 'invoices'], c, [c]);

  const addr = (x: any) => { const s = (x.sites ?? []).filter((y: any) => !y.deleted_at); return (s.find((y: any) => y.is_primary) ?? s[0])?.address ?? ''; };
  const phone = (x: any) => { const p = (x.customer_contacts ?? []).filter((y: any) => !y.deleted_at && y.kind === 'phone'); return (p.find((y: any) => y.is_primary) ?? p[0])?.value ?? ''; };
  const list = (data ?? []).filter((x) => (kind === 'all' || x.kind === kind) && `${x.name} ${x.contact ?? ''} ${addr(x)} ${phone(x)}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <PageH eyebrow="Customers" title={`${data?.length ?? 0} customers`} right={can('customers') && <button className="btn pri" onClick={() => setAdding(true)}>+ New customer</button>} />
      <div className="row wrap">
        <div className="seg" role="group" aria-label="Kind">{KINDS.map(([v, l]) => <button key={v} aria-pressed={kind === v} onClick={() => setKind(v)}>{l}</button>)}</div>
        <input className="inp" style={{ maxWidth: 320 }} placeholder="Filter by name, address or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card"><div className="tscroll"><table className="tbl"><thead><tr><th>Name</th><th>Type</th><th>Address</th><th>Phone</th><th>Equipment</th><th className="r">Owes</th></tr></thead><tbody>
        {list.map((x) => { const o = owedOf(x.invoices ?? []); return <tr key={x.id} className="click" onClick={() => nav(`/customer/${x.id}`)}>
          <td><b>{x.name}</b><br /><span className="s">{x.contact}</span></td><td>{kindLabel(x.kind)}</td><td>{addr(x)}</td><td className="mono">{phone(x)}</td>
          <td>{(x.units ?? []).filter((u: any) => !u.deleted_at).length}</td><td className="r mono">{o > 0.004 ? money(o) : '—'}</td></tr>; })}
        {data && !list.length && <tr><td colSpan={6}><div className="empty">{data.length ? 'No customers match.' : 'No customers yet. Tap + New customer to add your first one.'}</div></td></tr>}
      </tbody></table></div></div>
      {adding && <NewCustomer companyId={c} byName={member!.name} onClose={() => setAdding(false)} onDone={(id) => { setAdding(false); reload(); nav(`/customer/${id}`); }} />}
    </>
  );
}

function NewCustomer({ companyId, byName, onClose, onDone }: { companyId: string; byName: string; onClose: () => void; onDone: (id: string) => void }) {
  const [f, setF] = useState({ name: '', kind: 'home', contact: '', address: '', phone: '', email: '', notes: '', consent: false });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  async function save() {
    if (!f.name.trim()) return setErr('Type a name.');
    setBusy(true); setErr('');
    try {
      const cu = check(await supabase.from('customers').insert({ company_id: companyId, name: f.name.trim(), kind: f.kind, contact: f.contact.trim() || null, notes: f.notes.trim() ? [f.notes.trim()] : [] }).select('id').single()) as any;
      const rows: any[] = [];
      if (f.phone.trim()) rows.push({ company_id: companyId, customer_id: cu.id, kind: 'phone', value: f.phone.trim(), label: 'Mobile', is_primary: true, sms_consent_at: f.consent ? new Date().toISOString() : null, sms_consent_source: f.consent ? `office, by ${byName}` : null });
      if (f.email.trim()) rows.push({ company_id: companyId, customer_id: cu.id, kind: 'email', value: f.email.trim(), label: 'Main', is_primary: true });
      if (rows.length) check(await supabase.from('customer_contacts').insert(rows));
      if (f.address.trim()) check(await supabase.from('sites').insert({ company_id: companyId, customer_id: cu.id, address: f.address.trim(), is_primary: true }));
      onDone(cu.id);
    } catch (e) { setErr((e as Error).message); setBusy(false); }
  }
  return <Modal title="New customer" saveLabel="Add customer" busy={busy} onClose={onClose} onSave={save}>
    <div className="form">
      <label className="field full">Name or business<input value={f.name} placeholder="Smith residence or Bay Cafe" onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
      <label className="field">Type<select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}><option value="home">Home</option><option value="business">Business</option><option value="condo">Condo</option></select></label>
      <label className="field">Contact person<input value={f.contact} onChange={(e) => setF({ ...f, contact: e.target.value })} /></label>
      <label className="field full">Address<input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
      <label className="field">Mobile phone<input type="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
      <label className="field">Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
      <label className="field full">Site notes (gate code, dog, parking)<textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></label>
    </div>
    <label className="row" style={{ alignItems: 'flex-start', fontWeight: 500 }}><input type="checkbox" style={{ width: 20, height: 20, marginTop: 2 }} checked={f.consent} onChange={(e) => setF({ ...f, consent: e.target.checked })} />
      The customer agreed to get texts about their appointments. They can reply STOP anytime.</label>
    {err && <div className="err">{err}</div>}
  </Modal>;
}

export function Customer() {
  const { id = '' } = useParams();
  const { member } = useSession();
  const c = member!.company_id, mgr = isManager(member);
  const can = (p: string) => member!.role === 'owner' || !!member!.perms?.[p];
  const nav = useNavigate();
  const cats = catsOf(useCompany(c));
  const [modal, setModal] = useState<null | 'edit' | 'phone' | 'site' | 'unit'>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const { data, reload } = useLive(async () => {
    const cu = check(await supabase.from('customers').select('*').eq('id', id).single()) as any;
    const contacts = check(await supabase.from('customer_contacts').select('*').eq('customer_id', id).is('deleted_at', null).order('is_primary', { ascending: false })) as any[];
    const sites = check(await supabase.from('sites').select('*').eq('customer_id', id).is('deleted_at', null).order('is_primary', { ascending: false })) as any[];
    const units = check(await supabase.from('units').select('*').eq('customer_id', id).is('deleted_at', null)) as any[];
    const jobs = check(await supabase.from('jobs').select('id, number, type, category, status, starts_at, parent_job_id, visit_number').eq('customer_id', id).is('deleted_at', null).order('starts_at', { ascending: false })) as any[];
    const invs = can('seePrices') ? (check(await supabase.from('invoices').select('id, number, total, status, issued_at, deleted_at, payments(amount, refunded_amount, voided_at, status)').eq('customer_id', id).is('deleted_at', null).order('issued_at', { ascending: false })) as any[]) : [];
    return { cu, contacts, sites, units, jobs, invs };
  }, ['customers', 'customer_contacts', 'sites', 'units', 'jobs', 'invoices'], c, [c, id]);
  if (!data) return <div className="s">Loading…</div>;
  const { cu, contacts, sites, units, jobs, invs } = data;
  const run = async (f: () => Promise<unknown>) => { setErr(''); try { await f(); reload(); return true; } catch (e) { setErr((e as Error).message); return false; } };
  const owed = owedOf(invs);
  const setNotes = (n: string[]) => run(async () => check(await supabase.from('customers').update({ notes: n }).eq('id', id)));

  return (
    <>
      <div className="pageh"><div><button className="lnk" onClick={() => nav(-1)} style={{ marginBottom: 6 }}>← Back</button><p className="eyebrow">{kindLabel(cu.kind)}</p><h1>{cu.name}</h1></div>
        <div className="row wrap">{mgr && <Link className="btn pri" to={`/jobs?new=1&c=${id}`}>+ Book a job</Link>}</div></div>
      {err && <div className="err">{err}</div>}
      <div className="cols"><div className="colA">
        <div className="card"><div className="cardh"><h3>Contact</h3>{can('customers') && <button className="btn sm" onClick={() => setModal('edit')}>✎ Edit</button>}</div>
          <div className="dsp">
            {Number(cu.credit) > 0 && <><div className="k">Credit</div><div><b style={{ color: 'var(--ok)' }}>{money(Number(cu.credit))}</b> <span className="s">comes off their next invoice</span></div></>}
            <div className="k">Contact</div><div>{cu.contact || <span className="s">—</span>}</div>
            <div className="k">{sites.length > 1 ? 'Addresses' : 'Address'}</div><div>{sites.map((s, i) => <div key={s.id} style={{ marginBottom: 4 }}><b>{s.label}</b>{i === 0 && <span className="pill p-sched"> Main</span>}<br />
              <a target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(s.address)}`}>📍 {s.address}</a></div>)}
              {can('customers') && <button className="lnk" onClick={() => setModal('site')}>+ Add address</button>}</div>
            <div className="k">Phones & email</div><div>{contacts.map((p) => <div key={p.id} style={{ marginBottom: 4 }}><b>{p.label || (p.kind === 'phone' ? 'Phone' : 'Email')}</b>{p.who ? ` · ${p.who}` : ''}: <span className="mono">{p.value}</span>
              {p.kind === 'phone' && <> {p.opted_out_at ? <span className="pill p-bad">Replied STOP</span> : p.sms_consent_at ? <span className="pill p-done">OK to text</span> : <button className="lnk" onClick={() => run(async () => check(await supabase.from('customer_contacts').update({ sms_consent_at: new Date().toISOString(), sms_consent_source: `office, by ${member!.name}` }).eq('id', p.id)))}>Mark: agreed to texts</button>}</>}</div>)}
              {can('customers') && <button className="lnk" onClick={() => setModal('phone')}>+ Add phone or email</button>}</div>
          </div></div>

        <div className="notes"><div className="row"><b style={{ flex: 1 }}>Site notes</b></div>
          {(cu.notes ?? []).length ? cu.notes.map((n: string, i: number) => <div className="row" key={i}><span style={{ flex: 1 }}>{n}</span>{can('remove') && <button className="lnk" onClick={() => setNotes(cu.notes.filter((_: string, k: number) => k !== i))}>Remove</button>}</div>) : <span className="s">No notes.</span>}
          <div className="row"><input className="inp" value={note} placeholder="Gate code, dog, parking…" onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && note.trim()) { setNotes([...(cu.notes ?? []), note.trim()]); setNote(''); } }} />
            <button className="btn sm" onClick={() => { if (note.trim()) { setNotes([...(cu.notes ?? []), note.trim()]); setNote(''); } }}>Add</button></div></div>

        <div className="card"><h3>Jobs</h3>
          {jobs.length ? <div className="tscroll"><table className="tbl"><tbody>{jobs.map((j) => <tr key={j.id} className="click" onClick={() => nav(`/job/${j.id}`)}>
            <td className="mono">#{j.number ?? '—'}</td><td>{dayLabel(dayKey(new Date(j.starts_at)))}</td><td><CatTag cats={cats} name={j.category} /></td><td>{j.type}{j.parent_job_id ? ` · Visit ${j.visit_number}` : ''}</td><td><StatusPill s={j.status} /></td></tr>)}</tbody></table></div>
            : <div className="empty">No jobs yet.</div>}</div>
      </div><div className="colB">
        <div className="card"><h3>Equipment</h3>
          {units.length ? units.map((u) => <div className="prow" key={u.id}><div className="t"><b>{u.tag ? `${u.tag} · ` : ''}{u.type}</b><br /><span className="s mono">{[u.make, u.model].filter(Boolean).join(' ') || '—'}{u.serial ? ` · ${u.serial}` : ''}{u.year ? ` · ${u.year}` : ''}</span></div></div>) : <span className="s">No equipment yet.</span>}
          <div><button className="btn sm" onClick={() => setModal('unit')}>+ Add equipment</button></div></div>
        {can('seePrices') && <div className="card"><div className="cardh"><h3>Invoices</h3>{owed > 0.004 && <span className="pill p-bad">Owes {money(owed)}</span>}</div>
          {invs.length ? invs.map((i) => { const due = Math.max(0, Number(i.total) - paidOn(i.payments ?? [])); return <div className="prow" key={i.id}><div className="t"><b className="mono">INV-{i.number ?? '—'}</b><br /><span className="s">{dayLabel(dayKey(new Date(i.issued_at)))}</span></div>
            <span className="mono">{money(Number(i.total))}</span>{due > 0.004 ? <span className="pill p-warn">Owes {money(due)}</span> : <span className="pill p-done">Paid</span>}</div>; }) : <span className="s">No invoices yet.</span>}</div>}
      </div></div>

      {modal === 'edit' && <EditCustomer cu={cu} onClose={() => setModal(null)} onSave={(v) => run(async () => { check(await supabase.from('customers').update(v).eq('id', id)); setModal(null); })} />}
      {modal === 'phone' && <AddContact onClose={() => setModal(null)} onSave={(v) => run(async () => { check(await supabase.from('customer_contacts').insert({ company_id: c, customer_id: id, ...v, is_primary: !contacts.some((x) => x.kind === v.kind), sms_consent_source: v.sms_consent_at ? `office, by ${member!.name}` : null })); setModal(null); })} />}
      {modal === 'site' && <AddSite onClose={() => setModal(null)} onSave={(v) => run(async () => { check(await supabase.from('sites').insert({ company_id: c, customer_id: id, ...v, is_primary: !sites.length })); setModal(null); })} />}
      {modal === 'unit' && <AddUnit sites={sites} onClose={() => setModal(null)} onSave={(v) => run(async () => { check(await supabase.from('units').insert({ company_id: c, customer_id: id, ...v })); setModal(null); })} />}
    </>
  );
}

function EditCustomer({ cu, onClose, onSave }: { cu: any; onClose: () => void; onSave: (v: any) => void }) {
  const [v, setV] = useState({ name: cu.name, kind: cu.kind, contact: cu.contact ?? '' });
  return <Modal title="Edit customer" onClose={onClose} onSave={() => v.name.trim() && onSave({ name: v.name.trim(), kind: v.kind, contact: v.contact.trim() || null })}>
    <div className="form"><label className="field full">Name<input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
      <label className="field">Type<select value={v.kind} onChange={(e) => setV({ ...v, kind: e.target.value })}><option value="home">Home</option><option value="business">Business</option><option value="condo">Condo</option></select></label>
      <label className="field">Contact person<input value={v.contact} onChange={(e) => setV({ ...v, contact: e.target.value })} /></label></div>
  </Modal>;
}

function AddContact({ onClose, onSave }: { onClose: () => void; onSave: (v: any) => void }) {
  const [v, setV] = useState({ kind: 'phone', value: '', label: 'Mobile', who: '', consent: false }); const [e, setE] = useState('');
  return <Modal title="Add phone or email" onClose={onClose} onSave={() => { if (!v.value.trim()) return setE(v.kind === 'phone' ? 'Type the phone number.' : 'Type the email.'); onSave({ kind: v.kind, value: v.value.trim(), label: v.label || null, who: v.who.trim() || null, sms_consent_at: v.kind === 'phone' && v.consent ? new Date().toISOString() : null }); }}>
    <div className="seg" role="group">{[['phone', 'Phone'], ['email', 'Email']].map(([k, l]) => <button key={k} aria-pressed={v.kind === k} onClick={() => setV({ ...v, kind: k, label: k === 'phone' ? 'Mobile' : 'Main' })}>{l}</button>)}</div>
    <div className="form"><label className="field">{v.kind === 'phone' ? 'Number' : 'Email'}<input type={v.kind === 'phone' ? 'tel' : 'email'} value={v.value} onChange={(x) => setV({ ...v, value: x.target.value })} /></label>
      <label className="field">Label<input value={v.label} placeholder={v.kind === 'phone' ? 'Mobile, Office, Tenant' : 'Main, Billing'} onChange={(x) => setV({ ...v, label: x.target.value })} /></label>
      <label className="field">Whose (optional)<input value={v.who} placeholder="Tenant, Property manager" onChange={(x) => setV({ ...v, who: x.target.value })} /></label></div>
    {v.kind === 'phone' && <label className="row" style={{ fontWeight: 500 }}><input type="checkbox" style={{ width: 20, height: 20 }} checked={v.consent} onChange={(x) => setV({ ...v, consent: x.target.checked })} />They agreed to get texts about appointments.</label>}
    {e && <div className="err">{e}</div>}
  </Modal>;
}

function AddSite({ onClose, onSave }: { onClose: () => void; onSave: (v: any) => void }) {
  const [v, setV] = useState({ label: 'Main', address: '' });
  return <Modal title="Add address" onClose={onClose} onSave={() => v.address.trim() && onSave({ label: v.label.trim() || 'Main', address: v.address.trim() })}>
    <div className="form"><label className="field">Name<input value={v.label} placeholder="Main, Unit 4B, Rental" onChange={(e) => setV({ ...v, label: e.target.value })} /></label>
      <label className="field full">Address<input value={v.address} onChange={(e) => setV({ ...v, address: e.target.value })} /></label></div>
  </Modal>;
}

function AddUnit({ sites, onClose, onSave }: { sites: any[]; onClose: () => void; onSave: (v: any) => void }) {
  const [v, setV] = useState({ type: 'Split system', tag: '', make: '', model: '', serial: '', year: '', site_id: sites[0]?.id ?? '' });
  return <Modal title="Add equipment" onClose={onClose} onSave={() => onSave({ type: v.type, tag: v.tag.trim() || null, make: v.make.trim() || null, model: v.model.trim() || null, serial: v.serial.trim() || null, year: v.year ? Number(v.year) : null, site_id: v.site_id || null })}>
    <div className="form">
      <label className="field">Type<select value={v.type} onChange={(e) => setV({ ...v, type: e.target.value })}>{['Split system', 'Package unit', 'Rooftop unit', 'Heat pump', 'Mini-split', 'Air handler', 'Furnace', 'Thermostat', 'Walk-in cooler', 'Ice machine'].map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className="field">Name / location<input value={v.tag} placeholder="Attic, RTU-4" onChange={(e) => setV({ ...v, tag: e.target.value })} /></label>
      <label className="field">Make<input value={v.make} onChange={(e) => setV({ ...v, make: e.target.value })} /></label>
      <label className="field">Model<input value={v.model} onChange={(e) => setV({ ...v, model: e.target.value })} /></label>
      <label className="field">Serial<input value={v.serial} onChange={(e) => setV({ ...v, serial: e.target.value })} /></label>
      <label className="field">Year<input inputMode="numeric" value={v.year} onChange={(e) => setV({ ...v, year: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
      {sites.length > 1 && <label className="field full">At<select value={v.site_id} onChange={(e) => setV({ ...v, site_id: e.target.value })}>{sites.map((s) => <option key={s.id} value={s.id}>{s.label} · {s.address}</option>)}</select></label>}
    </div>
  </Modal>;
}
