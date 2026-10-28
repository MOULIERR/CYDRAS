// Pages customers open without logging in: the online booking form and their portal link.
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabase';
import { addDays, dayKey, dayLabel, hm, money, today } from '../ui';

const Shell = ({ children }: { children: React.ReactNode }) => <div className="pub"><div className="pubin">{children}</div><p className="s" style={{ textAlign: 'center' }}>Powered by Cydras</p></div>;

export function BookPage() {
  const { slug = '' } = useParams();
  const [info, setInfo] = useState<any | undefined>(undefined);
  const [f, setF] = useState({ name: '', phone: '', email: '', address: '', type: '', day: addDays(today(), 1), time: 'any', note: '', sms: false });
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false); const [done, setDone] = useState(false);
  useEffect(() => { supabase.rpc('booking_info', { p_slug: slug }).then(({ data, error }) => setInfo(error ? null : data)); }, [slug]);
  if (info === undefined) return <Shell><p className="s">Loading…</p></Shell>;
  if (!info) return <Shell><div className="card"><h2>Not taking online requests</h2><span className="s">This booking page is closed right now. Please call the company.</span></div></Shell>;
  const types: string[] = info.job_types ?? [];
  async function send() {
    setErr('');
    if (!f.name.trim()) return setErr('Type your name.');
    if (f.phone.replace(/\D/g, '').length < 10) return setErr('Type your phone number with area code.');
    setBusy(true);
    const { error } = await supabase.rpc('booking_submit', { p_slug: slug, p_name: f.name, p_phone: f.phone, p_email: f.email, p_address: f.address, p_type: f.type, p_day: f.day || null, p_time: f.time, p_note: f.note, p_sms_ok: f.sms });
    setBusy(false);
    if (error) setErr(error.message); else setDone(true);
  }
  if (done) return <Shell><div className="card"><h2>✓ Request sent</h2><span>Thanks, {f.name.split(' ')[0]}! {info.name} will call you to confirm a time.</span>{info.phone && <span className="s">Need us sooner? Call <a href={`tel:${info.phone}`}>{info.phone}</a>.</span>}</div></Shell>;
  return (
    <Shell>
      <div className="card"><span className="eyebrow">Book online</span><h1 style={{ margin: 0 }}>{info.name}</h1>{info.message && <span className="s">{info.message}</span>}</div>
      <div className="card">
        {types.length > 0 && <><b>What do you need?</b><div className="chips">{types.map((t) => <button key={t} className="chip" aria-pressed={f.type === t} onClick={() => setF({ ...f, type: f.type === t ? '' : t })}>{t}</button>)}</div></>}
        <div className="form">
          <label className="field">Your name<input value={f.name} autoComplete="name" onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label className="field">Phone<input value={f.phone} type="tel" autoComplete="tel" onChange={(e) => setF({ ...f, phone: e.target.value })} /></label>
          <label className="field">Email (optional)<input value={f.email} type="email" autoComplete="email" onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
          <label className="field">Address<input value={f.address} autoComplete="street-address" onChange={(e) => setF({ ...f, address: e.target.value })} /></label>
          <label className="field">Day you'd like<input type="date" min={today()} max={addDays(today(), 120)} value={f.day} onChange={(e) => setF({ ...f, day: e.target.value })} /></label>
          <label className="field">Time<select value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })}><option value="any">Any time</option><option value="morning">Morning</option><option value="afternoon">Afternoon</option></select></label>
        </div>
        <label className="field">Tell us what's going on<textarea className="inp" style={{ height: 90 }} maxLength={1000} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        <label className="row" style={{ fontWeight: 500, alignItems: 'flex-start' }}><input type="checkbox" style={{ width: 20, height: 20, flex: 'none' }} checked={f.sms} onChange={(e) => setF({ ...f, sms: e.target.checked })} /><span className="s">Text me about this appointment (reminders, on-the-way). Msg & data rates may apply. Reply STOP to stop.</span></label>
        {err && <div className="err">{err}</div>}
        <button className="btn pri" disabled={busy} onClick={send}>{busy ? 'Sending…' : 'Request appointment'}</button>
        <span className="s">This is a request. Your time is set when {info.name} confirms.</span>
      </div>
    </Shell>
  );
}

const total = (o: any) => (o?.lines ?? []).reduce((a: number, l: any) => a + Number(l.p) * Number(l.q ?? 1), 0);
export function PortalPage() {
  const { token = '' } = useParams();
  const [d, setD] = useState<any | undefined>(undefined);
  const [pick, setPick] = useState<Record<string, number>>({});
  const [err, setErr] = useState(''); const [busy, setBusy] = useState('');
  const load = () => supabase.rpc('portal_view', { p_token: token }).then(({ data, error }) => setD(error ? null : data));
  useEffect(() => { load(); }, [token]); // eslint-disable-line
  if (d === undefined) return <Shell><p className="s">Loading…</p></Shell>;
  if (!d) return <Shell><div className="card"><h2>Link not working</h2><span className="s">This link was turned off or is wrong. Ask the company for a new one.</span></div></Shell>;
  const fin = d.company?.financing;
  async function answer(id: string, approve: boolean) {
    setErr(''); setBusy(id);
    const { error } = await supabase.rpc('portal_answer', { p_token: token, p_estimate: id, p_option: approve ? pick[id] ?? null : null, p_approve: approve, p_reason: null });
    setBusy(''); if (error) setErr(error.message); else load();
  }
  const owe = (d.invoices ?? []).filter((i: any) => i.status === 'open').reduce((a: number, i: any) => a + Math.max(0, Number(i.total) - Number(i.paid)), 0);
  return (
    <Shell>
      <div className="card"><span className="eyebrow">{d.company?.name}</span><h1 style={{ margin: 0 }}>Hi, {d.customer?.name}</h1>
        <span className="s">{[d.company?.phone, d.company?.email, d.company?.license && `License ${d.company.license}`].filter(Boolean).join(' · ')}</span></div>
      {err && <div className="err">{err}</div>}
      {(d.visits ?? []).length > 0 && <div className="card"><h2>Upcoming visits</h2>{d.visits.map((v: any, i: number) => <div key={i} className="prow"><div className="t"><b>{dayLabel(dayKey(new Date(v.starts_at)), true)}</b> · {hm(v.starts_at)}<br /><span className="s">{v.type}</span></div>{v.status === 'on_the_way' && <span className="pill p-route">On the way</span>}</div>)}</div>}
      {(d.estimates ?? []).map((e: any) => <div key={e.id} className="card"><div className="cardh"><h2>Estimate #{e.number}{e.title ? ` · ${e.title}` : ''}</h2>
        <span className={`pill ${e.status === 'approved' ? 'p-done' : e.status === 'declined' ? 'p-bad' : 'p-warn'}`}>{e.status === 'sent' ? 'Waiting on you' : e.status === 'approved' ? 'Approved' : 'Not approved'}</span></div>
        {(e.options ?? []).map((o: any, i: number) => <label key={i} className="prow" style={{ cursor: e.status === 'sent' ? 'pointer' : undefined, alignItems: 'flex-start', borderColor: e.picked === i ? 'var(--ok)' : undefined }}>
          {e.status === 'sent' && <input type="radio" name={`o${e.id}`} style={{ width: 20, height: 20, flex: 'none' }} checked={pick[e.id] === i} onChange={() => setPick({ ...pick, [e.id]: i })} />}
          <div className="t"><b>{o.name || `Option ${i + 1}`}</b>{e.picked === i && <span className="pill p-done" style={{ marginLeft: 8 }}>Your pick</span>}{(o.lines ?? []).map((l: any, k: number) => <div key={k} className="s">{l.d}{Number(l.q ?? 1) !== 1 ? ` × ${l.q}` : ''}</div>)}
            {fin?.on && fin?.url && total(o) >= Number(fin.min ?? 0) && <a className="s" href={fin.url} target="_blank" rel="noreferrer">Pay over time{fin.provider ? ` with ${fin.provider}` : ''} →</a>}</div>
          <b className="mono">{money(total(o))}</b></label>)}
        {e.status === 'sent' && <div className="row"><button className="btn pri" disabled={pick[e.id] == null || busy === e.id} onClick={() => answer(e.id, true)}>Approve this option</button><button className="btn" disabled={busy === e.id} onClick={() => answer(e.id, false)}>No thanks</button></div>}
      </div>)}
      {(d.invoices ?? []).length > 0 && <div className="card"><div className="cardh"><h2>Invoices</h2>{owe > 0 && <b>You owe {money(owe)}</b>}</div>
        {d.invoices.map((i: any) => { const left = Math.max(0, Number(i.total) - Number(i.paid)); return <div key={i.number} className="prow"><div className="t"><b>Invoice #{i.number}</b><br /><span className="s">{dayLabel(dayKey(new Date(i.issued_at)))}</span></div>
          <span className="mono">{money(Number(i.total))}</span><span className={`pill ${i.status === 'paid' || left === 0 ? 'p-done' : 'p-warn'}`}>{i.status === 'paid' || left === 0 ? 'Paid' : `${money(left)} due`}</span></div>; })}
        {owe > 0 && <span className="s">To pay, call {d.company?.phone ?? 'us'}. Paying by card here is coming soon.</span>}</div>}
      {(d.plans ?? []).length > 0 && <div className="card"><h2>Your maintenance plan</h2>{d.plans.map((p: any, i: number) => <div key={i} className="prow"><div className="t"><b>{p.name}</b><br /><span className="s">{p.visits_per_year} visits a year · {money(Number(p.price))} a {p.bill_every}</span></div>{p.next_visit_on && <span className="pill p-sched">Next: {dayLabel(p.next_visit_on)}</span>}</div>)}</div>}
    </Shell>
  );
}
