// Customer pages like the mockup: Maintenance plans, Online booking, Customer portal, Financing,
// Review requests, Marketing and QuickBooks.
import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, check, callFunction } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { Modal, PageH, addDays, dayKey, dayLabel, money, money0, today } from '../ui';
import { useCo, Msg } from './Settings';
import { DEFAULT_TYPES } from './Setup';

const SITE = typeof window !== 'undefined' ? window.location.origin : 'https://cydras.vercel.app';

/** Shown when a page needs Database Update 2 and it has not been run yet. */
function NeedsUpdate({ title, eyebrow = 'Customers' }: { title: string; eyebrow?: string }) {
  return <><PageH eyebrow={eyebrow} title={title} /><div className="card" style={{ borderColor: 'var(--warn)' }}><h3>One quick database update needed</h3>
    <span className="s">This page needs new tables. Open the <b>Cydras Database Update 2</b> page Claude sent you, copy, paste it in the Supabase SQL Editor and click Run. Then refresh this page.</span></div></>;
}
const missing = (e: string | null, t: string) => !!e && (e.includes(t) || /does not exist|schema cache/.test(e));

async function copy(text: string, set: (s: string) => void) {
  try { await navigator.clipboard.writeText(text); set('Copied'); } catch { set('Copy blocked. Select the text and press Ctrl + C.'); }
  setTimeout(() => set(''), 2000);
}

/** Pick a customer by typing their name. */
function CustomerPick({ value, onChange }: { value: string; onChange: (id: string, name: string) => void }) {
  const { member } = useSession();
  const c = member!.company_id;
  const [q, setQ] = useState('');
  const { data } = useLive(async () => check(await supabase.from('customers').select('id, name').eq('company_id', c).is('deleted_at', null).order('name')) as any[], ['customers'], c, [c]);
  const picked = data?.find((x) => x.id === value);
  const list = (data ?? []).filter((x) => x.name.toLowerCase().includes(q.toLowerCase())).slice(0, 8);
  if (picked) return <div className="row"><b>{picked.name}</b><button className="lnk" onClick={() => onChange('', '')}>Change</button></div>;
  return <div><input className="inp" placeholder="Type a customer name" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Customer" />
    {q && <div className="card" style={{ padding: 6, marginTop: 6, gap: 0 }}>{list.map((x) => <button key={x.id} className="vrow" onClick={() => { onChange(x.id, x.name); setQ(''); }}>{x.name}</button>)}{!list.length && <span className="s">No customer by that name.</span>}</div>}</div>;
}

// ---------------------------------------------------------------- Maintenance plans
const PLAN_NAMES = ['Comfort Club', 'Gold plan', 'Commercial PM'];
const monthsBetween = (visits: number) => Math.max(1, Math.round(12 / Math.max(1, visits)));
const addMonths = (key: string, n: number) => { const d = new Date(key + 'T00:00:00'); d.setMonth(d.getMonth() + n); return dayKey(d); };

export function Plans() {
  const { member } = useSession();
  const c = member!.company_id;
  const nav = useNavigate();
  const [edit, setEdit] = useState<any | null>(null);
  const [show, setShow] = useState<'active' | 'due' | 'ended'>('active');
  const [err, setErr] = useState('');
  const { data, error, reload } = useLive(async () => check(await supabase.from('service_plans').select('*, customers(name)').eq('company_id', c).is('deleted_at', null).order('next_visit_on', { ascending: true, nullsFirst: false })) as any[], ['service_plans'], c, [c]);
  if (missing(error, 'service_plans')) return <NeedsUpdate title="Maintenance plans" />;
  if (!data) return <div className="s">Loading…</div>;
  const run = async (f: () => Promise<unknown>) => { setErr(''); try { await f(); reload(); return true; } catch (e) { setErr((e as Error).message); return false; } };
  const active = data.filter((p) => p.active);
  const soon = addDays(today(), 30);
  const due = active.filter((p) => p.next_visit_on && p.next_visit_on <= soon);
  const yearly = active.reduce((a, p) => a + Number(p.price) * (p.bill_every === 'month' ? 12 : 1), 0);
  const list = show === 'active' ? active : show === 'due' ? due : data.filter((p) => !p.active);
  return (
    <>
      <PageH eyebrow="Customers" title="Maintenance plans" right={<button className="btn pri" onClick={() => setEdit({ customer_id: '', name: PLAN_NAMES[0], price: 179, bill_every: 'year', visits_per_year: 2, next_visit_on: addDays(today(), 30), discount_pct: 15, notes: '' })}>+ New plan</button>} />
      <div className="grid g4">
        <div className="card kpi"><span className="eyebrow">Members</span><b>{active.length}</b></div>
        <div className="card kpi"><span className="eyebrow">Plan money per year</span><b>{money0(yearly)}</b></div>
        <div className="card kpi"><span className="eyebrow">Visits due in 30 days</span><b style={{ color: due.length ? 'var(--warn)' : undefined }}>{due.length}</b></div>
      </div>
      {err && <div className="err">{err}</div>}
      <div className="seg" role="group">{([['active', 'Active'], ['due', 'Visit due'], ['ended', 'Ended']] as const).map(([k, l]) => <button key={k} aria-pressed={show === k} onClick={() => setShow(k)}>{l}</button>)}</div>
      <div className="card"><div className="tscroll"><table className="tbl"><thead><tr><th>Customer</th><th>Plan</th><th className="r">Price</th><th>Next visit</th><th></th></tr></thead><tbody>
        {list.map((p) => { const late = p.active && p.next_visit_on && p.next_visit_on < today(); return <tr key={p.id}>
          <td><Link to={`/customer/${p.customer_id}`}><b>{p.customers?.name}</b></Link></td>
          <td>{p.name}<br /><span className="s">{p.visits_per_year} visits a year{Number(p.discount_pct) ? ` · ${Number(p.discount_pct)}% off repairs` : ''}</span></td>
          <td className="r mono">{money(Number(p.price))}<br /><span className="s">a {p.bill_every}</span></td>
          <td>{p.next_visit_on ? <span className={`pill ${late ? 'p-bad' : p.next_visit_on <= soon ? 'p-warn' : 'p-sched'}`}>{late ? 'Late · ' : ''}{dayLabel(p.next_visit_on)}</span> : '—'}</td>
          <td className="r" style={{ whiteSpace: 'nowrap' }}>{p.active ? <>
            <button className="btn sm" onClick={() => nav(`/jobs?new=1&c=${p.customer_id}${p.next_visit_on && p.next_visit_on >= today() ? `&d=${p.next_visit_on}` : ''}`)}>Book visit</button>{' '}
            <button className="btn sm" title="Moves the next visit forward" onClick={() => run(async () => check(await supabase.from('service_plans').update({ next_visit_on: addMonths(p.next_visit_on ?? today(), monthsBetween(p.visits_per_year)) }).eq('id', p.id)))}>Visit done</button>{' '}
            <button className="lnk" onClick={() => setEdit({ ...p })}>Edit</button></> :
            <button className="lnk" onClick={() => run(async () => check(await supabase.from('service_plans').update({ active: true }).eq('id', p.id)))}>Start again</button>}</td></tr>; })}
        {!list.length && <tr><td colSpan={5}><div className="empty">{data.length ? 'Nothing here.' : 'No plans yet. Tap + New plan to sign up your first member.'}</div></td></tr>}
      </tbody></table></div>
        <span className="s">Auto-billing plan members by card turns on once card payments are connected in Bank & payouts. Until then, take payment on the visit like any job.</span></div>
      {edit && <PlanForm p={edit} onClose={() => setEdit(null)} onSave={(v) => run(async () => {
        if (!v.customer_id) throw new Error('Pick the customer.');
        if (!v.name.trim()) throw new Error('Give the plan a name.');
        const row = { name: v.name.trim(), price: Number(v.price) || 0, bill_every: v.bill_every, visits_per_year: Number(v.visits_per_year) || 0, next_visit_on: v.next_visit_on || null, discount_pct: Number(v.discount_pct) || 0, notes: v.notes?.trim() || null, active: v.active ?? true };
        if (v.id) check(await supabase.from('service_plans').update(row).eq('id', v.id));
        else check(await supabase.from('service_plans').insert({ ...row, company_id: c, customer_id: v.customer_id }));
        setEdit(null);
      })} err={err} />}
    </>
  );
}
function PlanForm({ p, onClose, onSave, err }: { p: any; onClose: () => void; onSave: (v: any) => void; err: string }) {
  const [v, setV] = useState(p);
  return <Modal title={p.id ? 'Edit plan' : 'New maintenance plan'} saveLabel="Save plan" onClose={onClose} onSave={() => onSave(v)}>
    {!p.id && <label className="field">Customer<CustomerPick value={v.customer_id} onChange={(id) => setV({ ...v, customer_id: id })} /></label>}
    <label className="field">Plan name<input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} /></label>
    <div className="chips">{PLAN_NAMES.map((n) => <button key={n} className="chip" aria-pressed={v.name === n} onClick={() => setV({ ...v, name: n })}>{n}</button>)}</div>
    <div className="form">
      <label className="field">Price<input inputMode="decimal" value={v.price} onChange={(e) => setV({ ...v, price: e.target.value })} /></label>
      <label className="field">Billed every<select value={v.bill_every} onChange={(e) => setV({ ...v, bill_every: e.target.value })}><option value="month">Month</option><option value="year">Year</option></select></label>
      <label className="field">Visits a year<input inputMode="numeric" value={v.visits_per_year} onChange={(e) => setV({ ...v, visits_per_year: e.target.value })} /></label>
      <label className="field">Next visit<input type="date" value={v.next_visit_on ?? ''} onChange={(e) => setV({ ...v, next_visit_on: e.target.value })} /></label>
      <label className="field">% off repairs<input inputMode="decimal" value={v.discount_pct} onChange={(e) => setV({ ...v, discount_pct: e.target.value })} /></label>
    </div>
    <label className="field">Notes<input value={v.notes ?? ''} placeholder="2 units, filters 20x25x1" onChange={(e) => setV({ ...v, notes: e.target.value })} /></label>
    {p.id && <label className="row" style={{ fontWeight: 500 }}><input type="checkbox" style={{ width: 18, height: 18 }} checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Plan is active (uncheck to end it)</label>}
    {err && <div className="err">{err}</div>}
  </Modal>;
}

// ---------------------------------------------------------------- Online booking
export function Booking() {
  const { member, company, owner, err, saved, save, saveSettings } = useCo();
  const c = member.company_id;
  const nav = useNavigate();
  const [slug, setSlug] = useState<string | null>(null);
  const [cp, setCp] = useState('');
  const [busy, setBusy] = useState('');
  const [e2, setE2] = useState('');
  const { data, error, reload } = useLive(async () => check(await supabase.from('booking_requests').select('*').eq('company_id', c).order('created_at', { ascending: false }).limit(100)) as any[], ['booking_requests'], c, [c]);
  if (missing(error, 'booking_requests')) return <NeedsUpdate title="Online booking" />;
  if (!company || !data) return <div className="s">Loading…</div>;
  const b = { on: false, types: [] as string[], message: '', ...(company.settings?.booking ?? {}) };
  const allTypes: string[] = company.settings?.jobTypes ?? DEFAULT_TYPES;
  const s = slug ?? company.booking_slug ?? company.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  const link = `${SITE}/book/${company.booking_slug ?? s}`;
  const fresh = data.filter((r) => r.status === 'new');
  async function bookIt(r: any) {
    setBusy(r.id); setE2('');
    try {
      const digits = r.phone.replace(/\D/g, '').slice(-10);
      const contacts = check(await supabase.from('customer_contacts').select('customer_id, value').eq('company_id', c).eq('kind', 'phone').is('deleted_at', null)) as any[];
      let cust = contacts.find((x) => x.value.replace(/\D/g, '').slice(-10) === digits)?.customer_id;
      if (!cust) {
        const cu = check(await supabase.from('customers').insert({ company_id: c, name: r.name, kind: 'home' }).select('id').single()) as any;
        cust = cu.id;
        check(await supabase.from('customer_contacts').insert([{ company_id: c, customer_id: cust, kind: 'phone', value: r.phone, label: 'Mobile', is_primary: true, sms_consent_at: r.sms_ok ? r.created_at : null, sms_consent_source: r.sms_ok ? 'online booking form' : null },
          ...(r.email ? [{ company_id: c, customer_id: cust, kind: 'email', value: r.email, label: 'Email', is_primary: true }] : [])]));
        if (r.address) check(await supabase.from('sites').insert({ company_id: c, customer_id: cust, address: r.address, is_primary: true }));
      }
      check(await supabase.from('booking_requests').update({ status: 'booked', customer_id: cust }).eq('id', r.id));
      nav(`/jobs?new=1&c=${cust}${r.preferred_day && r.preferred_day >= today() ? `&d=${r.preferred_day}` : ''}`);
    } catch (e) { setE2((e as Error).message); }
    setBusy('');
  }
  return (
    <>
      <PageH eyebrow="Customers" title="Online booking" />
      <Msg err={err || e2} saved={saved} />
      <div className="cols"><div className="colA">
        <div className="card"><div className="cardh"><h2>Requests</h2><span className="s">{fresh.length} new</span></div>
          {data.map((r) => <div key={r.id} className="prow" style={{ alignItems: 'flex-start' }}>
            <div className="t"><b>{r.name}</b> <span className="s">· {r.phone}{r.email ? ` · ${r.email}` : ''}</span><br />
              <span className="s">{r.job_type ?? 'Service'} · {r.preferred_day ? dayLabel(r.preferred_day) : 'Any day'} · {r.preferred_time === 'morning' ? 'Morning' : r.preferred_time === 'afternoon' ? 'Afternoon' : 'Any time'}{r.address ? ` · ${r.address}` : ''}</span>
              {r.note && <><br /><span className="s">“{r.note}”</span></>}</div>
            {r.status === 'new' ? <div className="row" style={{ flex: 'none' }}><button className="btn sm pri" disabled={!!busy} onClick={() => bookIt(r)}>{busy === r.id ? '…' : 'Book it'}</button>
              <button className="lnk" onClick={async () => { check(await supabase.from('booking_requests').update({ status: 'declined' }).eq('id', r.id)); reload(); }}>Decline</button></div>
              : <span className={`pill ${r.status === 'booked' ? 'p-done' : 'p-bad'}`}>{r.status === 'booked' ? 'Booked' : 'Declined'}</span>}
          </div>)}
          {!data.length && <div className="empty">No requests yet. Share your booking link below.</div>}</div>
      </div><div className="colB">
        <div className="card"><div className="cardh"><h3>Booking page</h3><input type="checkbox" className="sw" disabled={!owner} checked={!!b.on} aria-label="Booking page on" onChange={(e) => saveSettings({ booking: { ...b, on: e.target.checked } }, e.target.checked ? 'Booking page is on' : 'Booking page is off')} /></div>
          <label className="field">Your link name<div className="row"><span className="s">/book/</span><input className="inp" value={s} disabled={!owner} onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /></div></label>
          {owner && (slug !== null && slug !== company.booking_slug || !company.booking_slug) && <button className="btn sm" onClick={async () => { if (s.length < 3) return; if (await save({ booking_slug: s }, 'Link saved')) setSlug(null); }}>Save link</button>}
          {company.booking_slug && <><div className="notes" style={{ wordBreak: 'break-all' }}>{link}</div>
            <div className="row"><button className="btn sm" onClick={() => copy(link, setCp)}>Copy link</button><a className="btn sm" href={link} target="_blank" rel="noreferrer">Open</a>{cp && <span className="s">{cp}</span>}</div>
            <span className="s">Put this link on your website, Google business page and Facebook. A button for your website:</span>
            <textarea readOnly className="inp" style={{ height: 70, font: '12px ui-monospace,monospace' }} value={`<a href="${link}" style="background:#f26b1d;color:#fff;padding:12px 20px;border-radius:10px;font-weight:700;text-decoration:none">Book online</a>`} /></>}
          {!b.on && <span className="s" style={{ color: 'var(--warn)' }}>The page is off. Customers see "not taking online requests".</span>}
        </div>
        <div className="card"><h3>What customers can pick</h3>
          <div className="chips">{allTypes.map((t) => { const on = b.types.includes(t); return <button key={t} className="chip" disabled={!owner} aria-pressed={on} onClick={() => saveSettings({ booking: { ...b, types: on ? b.types.filter((x: string) => x !== t) : [...b.types, t] } })}>{t}</button>; })}</div>
          <label className="field">Message on the page<input defaultValue={b.message} disabled={!owner} placeholder="We'll call to confirm your time." onBlur={(e) => e.target.value !== b.message && saveSettings({ booking: { ...b, message: e.target.value } })} /></label>
          <span className="s">Requests are not on the schedule until you tap Book it and pick a time.</span></div>
      </div></div>
    </>
  );
}

// ---------------------------------------------------------------- Customer portal
export function PortalSet() {
  const { member, company, owner, mgr, err, saved, saveSettings } = useCo();
  const c = member.company_id;
  const [cust, setCust] = useState('');
  const [cp, setCp] = useState('');
  const [e2, setE2] = useState('');
  const { data, error, reload } = useLive(async () => check(await supabase.from('portal_links').select('token, customer_id, created_at, last_seen_at, revoked_at, customers(name)').eq('company_id', c).is('revoked_at', null).order('created_at', { ascending: false })) as any[], ['portal_links'], c, [c]);
  if (missing(error, 'portal_links')) return <NeedsUpdate title="Customer portal" />;
  if (!company || !data) return <div className="s">Loading…</div>;
  const p = { invoices: true, estimates: true, visits: true, ...(company.settings?.portal ?? {}) };
  const url = (t: string) => `${SITE}/p/${t}`;
  async function make() {
    setE2('');
    try {
      const have = data!.find((x) => x.customer_id === cust);
      const t = have?.token ?? (check(await supabase.from('portal_links').insert({ company_id: c, customer_id: cust }).select('token').single()) as any).token;
      await copy(url(t), setCp); setCust(''); reload();
    } catch (e) { setE2((e as Error).message); }
  }
  return (
    <>
      <PageH eyebrow="Customers" title="Customer portal" />
      <Msg err={err || e2} saved={saved} />
      <div className="cols"><div className="colA">
        <div className="card"><h2>Give a customer their link</h2>
          <span className="s">Each customer gets a private link. With it they can see their bills, approve estimates and check upcoming visits. No password needed. Text or email it to them.</span>
          <CustomerPick value={cust} onChange={(id) => setCust(id)} />
          {cust && <div><button className="btn pri" onClick={make}>Make link and copy it</button></div>}
          {cp && <div className="s" style={{ fontWeight: 700, color: 'var(--ok)' }}>✓ {cp}</div>}</div>
        <div className="card"><div className="cardh"><h3>Links you made</h3><span className="s">{data.length}</span></div>
          {data.map((l) => <div key={l.token} className="prow"><div className="t"><b>{l.customers?.name}</b><br /><span className="s">{l.last_seen_at ? `Last opened ${dayLabel(dayKey(new Date(l.last_seen_at)))}` : 'Not opened yet'}</span></div>
            <button className="btn sm" onClick={() => copy(url(l.token), setCp)}>Copy</button><a className="btn sm" href={url(l.token)} target="_blank" rel="noreferrer">Open</a>
            {mgr && <button className="lnk" onClick={async () => { setE2(''); try { check(await supabase.from('portal_links').update({ revoked_at: new Date().toISOString() }).eq('token', l.token)); reload(); } catch (e) { setE2((e as Error).message); } }}>Turn off</button>}</div>)}
          {!data.length && <div className="empty">No links yet.</div>}</div>
      </div><div className="colB">
        <div className="card"><h3>What customers see</h3>
          {([['invoices', 'Invoices and what they owe'], ['estimates', 'Estimates (they can approve or say no)'], ['visits', 'Upcoming visits']] as const).map(([k, l]) =>
            <label key={k} className="prow" style={{ cursor: owner ? 'pointer' : undefined }}><span className="t">{l}</span><input type="checkbox" className="sw" disabled={!owner} checked={!!(p as any)[k]} aria-label={l} onChange={(e) => saveSettings({ portal: { ...p, [k]: e.target.checked } })} /></label>)}
          <span className="s">Maintenance plans always show. Paying by card in the portal turns on once card payments are connected.</span></div>
      </div></div>
    </>
  );
}

// ---------------------------------------------------------------- Financing
export function Financing() {
  const { company, owner, err, saved, saveSettings } = useCo();
  if (!company) return <div className="s">Loading…</div>;
  const f = { on: false, provider: '', url: '', min: 1000, ...(company.settings?.financing ?? {}) };
  const set = (patch: Record<string, unknown>) => saveSettings({ financing: { ...f, ...patch } });
  return (
    <>
      <PageH eyebrow="Customers" title="Financing" />
      <Msg err={err} saved={saved} />
      <div className="cols"><div className="colA"><div className="card"><div className="cardh"><h2>Offer monthly payments</h2><input type="checkbox" className="sw" disabled={!owner} checked={!!f.on} aria-label="Financing on" onChange={(e) => set({ on: e.target.checked })} /></div>
        <span className="s">Cydras doesn't lend money. You sign up with a financing company (like Wisetack, GreenSky, Synchrony or Service Finance). They give you an application link. Put it here and customers see "Pay over time" on big estimates in their portal.</span>
        <div className="form">
          <label className="field">Financing company<input defaultValue={f.provider} disabled={!owner} placeholder="Wisetack" onBlur={(e) => e.target.value !== f.provider && set({ provider: e.target.value.trim() })} /></label>
          <label className="field">Show on estimates over<input inputMode="numeric" defaultValue={f.min} disabled={!owner} onBlur={(e) => Number(e.target.value) !== f.min && set({ min: Number(e.target.value) || 0 })} /></label>
        </div>
        <label className="field">Your application link<input defaultValue={f.url} disabled={!owner} placeholder="https://…" onBlur={(e) => { const v = e.target.value.trim(); if (v !== f.url) { if (v && !/^https:\/\//.test(v)) return; set({ url: v }); } }} /></label>
        {f.url && !/^https:\/\//.test(f.url) && <div className="err">The link must start with https://</div>}
        {f.on && !f.url && <span className="s" style={{ color: 'var(--warn)' }}>Add the application link so customers can apply.</span>}
      </div></div><div className="colB"><div className="card"><h3>How it works</h3><ol className="s" style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <li>Sign up with a financing company. They check your business, usually in a few days.</li><li>Paste your application link here and turn it on.</li><li>Customers apply from their estimate. The lender pays you, and the customer pays the lender monthly.</li></ol></div></div></div>
    </>
  );
}

// ---------------------------------------------------------------- Review requests
const fill = (t: string, name: string, co: string, link: string) => t.replace(/\{name\}/g, name.split(/\s+/)[0] ?? '').replace(/\{company\}/g, co).replace(/\{link\}/g, link);
export function Reviews() {
  const { member, company, owner, err, saved, saveSettings } = useCo();
  const c = member.company_id;
  const [sending, setSending] = useState('');
  const [res, setRes] = useState<Record<string, string>>({});
  const { data } = useLive(async () => {
    const since = new Date(); since.setDate(since.getDate() - 21);
    const jobs = check(await supabase.from('jobs').select('id, customer_id, type, starts_at, parent_job_id, customers(name)').eq('company_id', c).eq('status', 'done').gte('starts_at', since.toISOString()).is('deleted_at', null).order('starts_at', { ascending: false })) as any[];
    const asked = check(await supabase.from('messages').select('customer_id, created_at, status').eq('company_id', c).eq('kind', 'review').gte('created_at', new Date(Date.now() - 90 * 86400000).toISOString())) as any[];
    return { jobs, asked };
  }, ['jobs', 'messages'], c, [c]);
  if (!company || !data) return <div className="s">Loading…</div>;
  const r = { url: '', msg: 'Hi {name}, thanks for choosing {company}! If we did a great job, would you leave us a quick Google review? {link}', ...(company.settings?.reviews ?? {}) };
  const seen = new Set<string>(); const jobs = data.jobs.filter((j) => !seen.has(j.customer_id) && seen.add(j.customer_id));
  async function ask(j: any) {
    setSending(j.id);
    try { await callFunction('send-sms', { company_id: c, customer_id: j.customer_id, kind: 'review', body: fill(r.msg, j.customers?.name ?? '', company.name, r.url) }); setRes((x) => ({ ...x, [j.id]: 'Sent ✓' })); }
    catch (e) { setRes((x) => ({ ...x, [j.id]: (e as Error).message })); }
    setSending('');
  }
  return (
    <>
      <PageH eyebrow="Customers" title="Review requests" />
      <Msg err={err} saved={saved} />
      <div className="cols"><div className="colA"><div className="card"><div className="cardh"><h2>Finished jobs, last 3 weeks</h2></div>
        {jobs.map((j) => { const a = data.asked.find((m) => m.customer_id === j.customer_id && m.status !== 'blocked' && m.status !== 'failed'); return <div key={j.id} className="prow">
          <div className="t"><b>{j.customers?.name}</b><br /><span className="s">{j.type} · {dayLabel(dayKey(new Date(j.starts_at)))}</span>{res[j.id] && <><br /><span className="s" style={{ color: res[j.id].startsWith('Sent') ? 'var(--ok)' : 'var(--bad)' }}>{res[j.id]}</span></>}</div>
          {a ? <span className="pill p-done">Asked {dayLabel(dayKey(new Date(a.created_at)))}</span> : <button className="btn sm" disabled={!r.url || !!sending} onClick={() => ask(j)}>{sending === j.id ? 'Sending…' : 'Ask for review'}</button>}</div>; })}
        {!jobs.length && <div className="empty">No finished jobs in the last 3 weeks.</div>}
        <span className="s">Texts only go to customers who agreed to texts and didn't reply STOP. Each customer is asked once every 90 days at most.</span></div></div>
        <div className="colB"><div className="card"><h3>Your review link</h3>
          <label className="field">Google review link<input defaultValue={r.url} disabled={!owner} placeholder="https://g.page/r/…/review" onBlur={(e) => { const v = e.target.value.trim(); if (v !== r.url && (!v || /^https:\/\//.test(v))) saveSettings({ reviews: { ...r, url: v } }, 'Link saved'); }} /></label>
          <span className="s">Find it in your Google Business Profile → <b>Ask for reviews</b> → copy the link.</span>
          <label className="field">The text<textarea className="inp" style={{ height: 110 }} defaultValue={r.msg} disabled={!owner} onBlur={(e) => e.target.value !== r.msg && saveSettings({ reviews: { ...r, msg: e.target.value } })} /></label>
          <span className="s">{'{name}'} = first name, {'{company}'} = your company, {'{link}'} = your review link.</span>
          {!r.url && <span className="s" style={{ color: 'var(--warn)' }}>Add your Google review link to start asking.</span>}
          <div className="notes">{fill(r.msg, 'Maria Lopez', company.name, r.url || '(your link)')}</div></div></div></div>
    </>
  );
}

// ---------------------------------------------------------------- Marketing
type Aud = 'all' | 'quiet' | 'members' | 'home' | 'business';
const AUD: [Aud, string][] = [['all', 'Everyone OK to text'], ['quiet', 'No visit in 12 months'], ['members', 'Plan members'], ['home', 'Homes only'], ['business', 'Businesses only']];
export function Marketing() {
  const { member, company } = useCo();
  const c = member.company_id;
  const [aud, setAud] = useState<Aud>('quiet');
  const [name, setName] = useState('');
  const [body, setBody] = useState('Hi {name}, it\'s been a while! Book your A/C tune-up with {company} this month and get $20 off.');
  const [sending, setSending] = useState<{ n: number; of: number; sent: number; blocked: number; reasons: string[] } | null>(null);
  const [err, setErr] = useState('');
  const [confirm, setConfirm] = useState(false);
  const { data, error, reload } = useLive(async () => {
    const custs = check(await supabase.from('customers').select('id, name, kind, customer_contacts(kind, sms_consent_at, opted_out_at, deleted_at)').eq('company_id', c).is('deleted_at', null)) as any[];
    const since = new Date(); since.setFullYear(since.getFullYear() - 1);
    const recent = check(await supabase.from('jobs').select('customer_id').eq('company_id', c).gte('starts_at', since.toISOString()).is('deleted_at', null)) as any[];
    let plans: any[] = []; try { plans = check(await supabase.from('service_plans').select('customer_id').eq('company_id', c).eq('active', true).is('deleted_at', null)) as any[]; } catch { /* update 2 not run */ }
    const camps = check(await supabase.from('campaigns').select('*').eq('company_id', c).order('created_at', { ascending: false }).limit(20)) as any[];
    return { custs, recent: new Set(recent.map((x) => x.customer_id)), plans: new Set(plans.map((x) => x.customer_id)), camps };
  }, ['campaigns'], c, [c]);
  const list = useMemo(() => {
    if (!data) return [];
    const ok = data.custs.filter((x) => (x.customer_contacts ?? []).some((p: any) => p.kind === 'phone' && !p.deleted_at && p.sms_consent_at && !p.opted_out_at));
    return ok.filter((x) => aud === 'all' || (aud === 'quiet' && !data.recent.has(x.id)) || (aud === 'members' && data.plans.has(x.id)) || (aud === 'home' && x.kind !== 'business') || (aud === 'business' && x.kind === 'business'));
  }, [data, aud]);
  if (missing(error, 'campaigns')) return <NeedsUpdate title="Marketing" />;
  if (!company || !data) return <div className="s">Loading…</div>;
  const notOk = data.custs.length - data.custs.filter((x) => (x.customer_contacts ?? []).some((p: any) => p.kind === 'phone' && !p.deleted_at && p.sms_consent_at && !p.opted_out_at)).length;
  async function send() {
    setConfirm(false); setErr('');
    const st = { n: 0, of: list.length, sent: 0, blocked: 0, reasons: [] as string[] }; setSending({ ...st });
    for (const x of list) {
      try { await callFunction('send-sms', { company_id: c, customer_id: x.id, kind: 'marketing', body: fill(body, x.name, company.name, '') }); st.sent++; }
      catch (e) { st.blocked++; const m = (e as Error).message; if (!st.reasons.includes(m)) st.reasons.push(m); if (/not set up/i.test(m)) { st.n = st.of; break; } }
      st.n++; setSending({ ...st });
    }
    try { check(await supabase.from('campaigns').insert({ company_id: c, name: name.trim() || 'Text campaign', body, audience: aud, sent_count: st.sent, blocked_count: st.blocked })); } catch (e) { setErr((e as Error).message); }
    setSending({ ...st, n: st.of }); reload();
  }
  return (
    <>
      <PageH eyebrow="Customers" title="Marketing" />
      {err && <div className="err">{err}</div>}
      <div className="cols"><div className="colA"><div className="card"><h2>New text campaign</h2>
        <label className="field">Name (only you see it)<input value={name} placeholder="Fall tune-up" onChange={(e) => setName(e.target.value)} /></label>
        <b>Who gets it</b><div className="chips">{AUD.map(([k, l]) => <button key={k} className="chip" aria-pressed={aud === k} onClick={() => setAud(k)}>{l}</button>)}</div>
        <span className="s"><b>{list.length}</b> customers. {notOk ? `${notOk} customers are left out because they haven't agreed to texts or replied STOP.` : ''}</span>
        <label className="field">Message<textarea className="inp" style={{ height: 110 }} maxLength={480} value={body} onChange={(e) => setBody(e.target.value)} /></label>
        <span className="s">{'{name}'} = first name, {'{company}'} = your company. "Reply STOP to opt out" is added to the end for you. Texts aren't sent at night.</span>
        <div className="notes">{fill(body, list[0]?.name ?? 'Maria', company.name, '')}</div>
        {sending ? <div className="s" role="status"><b>{sending.n < sending.of ? `Sending ${sending.n} of ${sending.of}…` : `Done: ${sending.sent} sent, ${sending.blocked} not sent.`}</b>{sending.reasons.map((r) => <div key={r}>• {r}</div>)}</div> : null}
        <div><button className="btn pri" disabled={!list.length || !body.trim() || (!!sending && sending.n < sending.of)} onClick={() => setConfirm(true)}>Send to {list.length} customers</button></div>
      </div></div>
        <div className="colB"><div className="card"><h3>Past campaigns</h3>
          {data.camps.map((x) => <div key={x.id} className="prow"><div className="t"><b>{x.name}</b><br /><span className="s">{dayLabel(dayKey(new Date(x.created_at)))} · {x.sent_count} sent{x.blocked_count ? ` · ${x.blocked_count} not sent` : ''}</span></div></div>)}
          {!data.camps.length && <div className="empty">None yet.</div>}
          <span className="s">The law (TCPA) says you can only send marketing texts to people who agreed. Cydras only sends to customers marked "OK to text".</span></div></div></div>
      {confirm && <Modal title="Send this text?" saveLabel={`Send to ${list.length}`} onClose={() => setConfirm(false)} onSave={send}><span>It goes to {list.length} customers right now. You can't undo it.</span></Modal>}
    </>
  );
}

// ---------------------------------------------------------------- QuickBooks
function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}
function download(name: string, text: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const mdy = (iso: string) => { const d = new Date(iso); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`; };
export function QuickBooks() {
  const { member } = useSession();
  const c = member!.company_id;
  const y = new Date().getFullYear();
  const [from, setFrom] = useState(`${y}-01-01`);
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const range = () => [new Date(from + 'T00:00:00').toISOString(), new Date(new Date(to + 'T00:00:00').getTime() + 86400000).toISOString()];
  const FILES: [string, string, string, () => Promise<Record<string, unknown>[]>][] = [
    ['customers', 'Customers', 'QuickBooks: Settings ⚙ → Import data → Customers', async () => (check(await supabase.from('customers').select('name, kind, contact, customer_contacts(kind, value, is_primary, deleted_at), sites(address, is_primary, deleted_at)').eq('company_id', c).is('deleted_at', null).order('name')) as any[]).map((x) => {
      const cc = (x.customer_contacts ?? []).filter((y: any) => !y.deleted_at); const st = (x.sites ?? []).filter((y: any) => !y.deleted_at);
      return { Name: x.name, 'Company name': x.kind === 'business' ? x.name : '', Email: cc.find((y: any) => y.kind === 'email')?.value ?? '', Phone: cc.find((y: any) => y.kind === 'phone')?.value ?? '', 'Billing address': (st.find((y: any) => y.is_primary) ?? st[0])?.address ?? '' };
    })],
    ['invoices', 'Invoices', 'QuickBooks: Settings ⚙ → Import data → Invoices', async () => {
      const [a, b] = range();
      const inv = check(await supabase.from('invoices').select('number, issued_at, job_id, tax, customers!invoices_customer_id_fkey(name)').eq('company_id', c).gte('issued_at', a).lt('issued_at', b).is('deleted_at', null).neq('status', 'void').order('issued_at')) as any[];
      const jobIds = inv.map((i) => i.job_id).filter(Boolean);
      const lines = jobIds.length ? check(await supabase.from('job_lines').select('job_id, description, price, qty, kind').in('job_id', jobIds).is('deleted_at', null).order('position')) as any[] : [];
      const rows: Record<string, unknown>[] = [];
      for (const i of inv) {
        const L = lines.filter((l) => l.job_id === i.job_id);
        const base = { InvoiceNo: i.number, Customer: i.customers?.name, InvoiceDate: mdy(i.issued_at), DueDate: mdy(i.issued_at) };
        for (const l of L) rows.push({ ...base, 'Item(Product/Service)': l.kind === 'part' ? 'Parts' : 'Services', ItemDescription: l.description, ItemQuantity: l.qty, ItemRate: l.price, ItemAmount: (Number(l.price) * Number(l.qty)).toFixed(2), ItemTaxAmount: '' });
        if (Number(i.tax)) rows.push({ ...base, 'Item(Product/Service)': 'Sales tax', ItemDescription: 'Sales tax', ItemQuantity: 1, ItemRate: i.tax, ItemAmount: Number(i.tax).toFixed(2), ItemTaxAmount: '' });
      }
      return rows;
    }],
    ['payments', 'Payments', 'Record these as received payments in QuickBooks', async () => { const [a, b] = range(); return (check(await supabase.from('payments').select('taken_at, method, amount, refunded_amount, voided_at, status, reference, invoices(number), customers(name)').eq('company_id', c).gte('taken_at', a).lt('taken_at', b).order('taken_at')) as any[]).filter((p) => p.status === 'succeeded' && !p.voided_at).map((p) => ({ Date: mdy(p.taken_at), Customer: p.customers?.name, InvoiceNo: p.invoices?.number ?? '', Method: p.method.replace(/_/g, ' '), Amount: (Number(p.amount) - Number(p.refunded_amount)).toFixed(2), Reference: p.reference ?? '' })); }],
  ];
  return (
    <>
      <PageH eyebrow="Owner" title="QuickBooks" />
      <div className="card" style={{ maxWidth: 820 }}><h2>Send your numbers to QuickBooks</h2>
        <span className="s">Download these files and import them in QuickBooks Online. They're made in the format QuickBooks asks for. Automatic sync (no downloading) is coming.</span>
        <div className="form"><label className="field">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="field">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div></div>
      {err && <div className="err">{err}</div>}
      <div className="grid g4">{FILES.map(([k, l, how, f]) => <div key={k} className="card"><h3>{l}</h3><span className="s">{how}</span>
        <button className="btn" disabled={!!busy} onClick={async () => { setBusy(k); setErr(''); try { const rows = await f(); if (!rows.length) setErr(`No ${l.toLowerCase()} in those dates.`); else download(`quickbooks-${k}-${from}-to-${to}.csv`, toCsv(rows)); } catch (e) { setErr((e as Error).message); } setBusy(''); }}>{busy === k ? 'Making…' : 'Download'}</button></div>)}</div>
      <div className="card" style={{ maxWidth: 820 }}><h3>Order to import</h3><ol className="s" style={{ margin: 0, paddingLeft: 18 }}><li>Customers first, so QuickBooks knows the names.</li><li>Then invoices.</li><li>Then mark payments received.</li></ol></div>
    </>
  );
}
