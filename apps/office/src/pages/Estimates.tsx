// Estimates, like the mockup: sent, approved, pending and declined, find by customer, options like Repair vs Replace.
import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { Modal, PageH, dayKey, dayLabel, money } from '../ui';

type Opt = { name: string; lines: { d: string; p: number; q: number }[] };
const STATUSES: [string, string, string][] = [['all', 'All', ''], ['draft', 'Not sent', 'p-sched'], ['sent', 'Waiting on customer', 'p-warn'], ['approved', 'Approved', 'p-done'], ['declined', 'Not approved', 'p-bad']];
const optTotal = (o: Opt) => o.lines.reduce((a, l) => a + Number(l.p) * Number(l.q), 0);

export function Estimates() {
  const { member } = useSession();
  const c = member!.company_id;
  const can = (p: string) => member!.role === 'owner' || !!member!.perms?.[p];
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const [st, setSt] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<any | null>(sp.get('new') ? { customer_id: sp.get('c') ?? '', job_id: sp.get('job') ?? null, title: '', options: [{ name: 'Option 1', lines: [] }], status: 'draft' } : null);
  const [err, setErr] = useState('');
  const { data, reload } = useLive(async () => {
    const ests = check(await supabase.from('estimates').select('*, customers(name)').eq('company_id', c).is('deleted_at', null).order('updated_at', { ascending: false })) as any[];
    const customers = check(await supabase.from('customers').select('id, name').eq('company_id', c).is('deleted_at', null).order('name')) as any[];
    const book = check(await supabase.from('price_items').select('id, name, prices').eq('company_id', c).eq('active', true).is('deleted_at', null).order('name')) as any[];
    return { ests, customers, book };
  }, ['estimates'], c, [c]);
  const list = (data?.ests ?? []).filter((e) => (st === 'all' || e.status === st) && (!q || (e.customers?.name ?? '').toLowerCase().includes(q.toLowerCase())));
  const pill = (s: string) => { const x = STATUSES.find((y) => y[0] === s) ?? STATUSES[1]; return <span className={`pill ${x[2]}`}>{x[1]}</span>; };
  const run = async (f: () => Promise<unknown>) => { setErr(''); try { await f(); reload(); return true; } catch (e) { setErr((e as Error).message); return false; } };

  return (
    <>
      <PageH eyebrow="Estimates" title={`${data?.ests.length ?? 0} estimates`} right={can('estimates') && <button className="btn pri" onClick={() => setOpen({ customer_id: '', job_id: null, title: '', options: [{ name: 'Option 1', lines: [] }], status: 'draft' })}>+ New estimate</button>} />
      <div className="row wrap"><div className="seg" role="group" aria-label="Status">{STATUSES.map(([k, l]) => <button key={k} aria-pressed={st === k} onClick={() => setSt(k)}>{l} · {k === 'all' ? data?.ests.length ?? 0 : (data?.ests ?? []).filter((e) => e.status === k).length}</button>)}</div>
        <input className="inp" style={{ maxWidth: 320 }} placeholder="Find by customer name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      {err && <div className="err">{err}</div>}
      <div className="card"><div className="tscroll"><table className="tbl"><thead><tr><th>Estimate</th><th>Customer</th><th>For</th><th>Options</th><th>Updated</th><th>Status</th></tr></thead><tbody>
        {list.map((e) => <tr key={e.id} className="click" onClick={() => setOpen(e)}><td className="mono">EST-{e.number ?? '—'}</td><td><b>{e.customers?.name}</b></td><td>{e.title || '—'}</td>
          <td>{(e.options ?? []).map((o: Opt, i: number) => <div key={i} className="s">{o.name}: <span className="mono">{money(optTotal(o))}</span>{e.picked === i ? ' ✓' : ''}</div>)}</td>
          <td>{dayLabel(dayKey(new Date(e.updated_at)))}</td><td>{pill(e.status)}</td></tr>)}
        {data && !list.length && <tr><td colSpan={6}><div className="empty">{data.ests.length ? 'No estimates match.' : 'No estimates yet. Tap + New estimate.'}</div></td></tr>}
      </tbody></table></div></div>
      {open && data && <EstimateForm est={open} customers={data.customers} book={data.book} canEdit={can('estimates')} onClose={() => setOpen(null)}
        onOpenJob={(j) => nav(`/job/${j}`)}
        onSave={(v) => run(async () => {
          const row = { customer_id: v.customer_id, job_id: v.job_id, title: v.title, options: v.options, status: v.status, picked: v.picked ?? null, declined_reason: v.declined_reason ?? null,
            sent_at: v.status === 'sent' && !open.sent_at ? new Date().toISOString() : open.sent_at ?? null, answered_at: ['approved', 'declined'].includes(v.status) && !open.answered_at ? new Date().toISOString() : open.answered_at ?? null };
          if (open.id) check(await supabase.from('estimates').update(row).eq('id', open.id)); else check(await supabase.from('estimates').insert({ ...row, company_id: c }));
          if (v.status === 'approved' && v.addToJob && v.job_id && v.picked != null) {
            const o: Opt = v.options[v.picked];
            if (o?.lines.length) check(await supabase.from('job_lines').insert(o.lines.map((l, i) => ({ company_id: c, job_id: v.job_id, description: l.d, price: l.p, qty: l.q, kind: 'service', position: 100 + i }))));
          }
          setOpen(null);
        })} />}
    </>
  );
}

function EstimateForm({ est, customers, book, canEdit, onClose, onSave, onOpenJob }: { est: any; customers: any[]; book: any[]; canEdit: boolean; onClose: () => void; onSave: (v: any) => void; onOpenJob: (id: string) => void }) {
  const [v, setV] = useState({ customer_id: est.customer_id ?? '', job_id: est.job_id ?? null, title: est.title ?? '', options: (est.options?.length ? est.options : [{ name: 'Option 1', lines: [] }]) as Opt[], status: est.status ?? 'draft', picked: est.picked ?? null, declined_reason: est.declined_reason ?? '', addToJob: true });
  const [e, setE] = useState('');
  const setOpt = (i: number, o: Opt) => setV({ ...v, options: v.options.map((x, k) => (k === i ? o : x)) });
  const save = (status = v.status, extra: any = {}) => { if (!v.customer_id) return setE('Pick a customer.'); if (!v.options.some((o) => o.lines.length)) return setE('Add at least one line.'); onSave({ ...v, status, ...extra }); };
  return <Modal title={est.id ? `Estimate EST-${est.number ?? ''}` : 'New estimate'} onClose={onClose} onSave={canEdit ? () => save() : undefined} saveLabel="Save">
    <div className="form">
      <label className="field">Customer<select value={v.customer_id} disabled={!!est.id} onChange={(x) => setV({ ...v, customer_id: x.target.value })}><option value="">Pick one…</option>{customers.map((cu) => <option key={cu.id} value={cu.id}>{cu.name}</option>)}</select></label>
      <label className="field">What it's for<input value={v.title} placeholder="Replace RTU-3, 5 ton" onChange={(x) => setV({ ...v, title: x.target.value })} /></label>
    </div>
    {v.options.map((o, i) => <div key={i} className="card" style={{ gap: 8, borderColor: v.picked === i ? 'var(--ok)' : undefined }}>
      <div className="row"><input className="inp" value={o.name} aria-label="Option name" onChange={(x) => setOpt(i, { ...o, name: x.target.value })} /><b className="mono">{money(optTotal(o))}</b>
        {v.options.length > 1 && <button className="lnk" onClick={() => setV({ ...v, options: v.options.filter((_, k) => k !== i) })}>Remove</button>}</div>
      {o.lines.map((l, k) => <div key={k} className="row"><input className="inp" value={l.d} aria-label="Line" onChange={(x) => setOpt(i, { ...o, lines: o.lines.map((y, z) => (z === k ? { ...y, d: x.target.value } : y)) })} />
        <input className="inp" style={{ width: 70 }} inputMode="decimal" value={l.q} aria-label="Quantity" onChange={(x) => setOpt(i, { ...o, lines: o.lines.map((y, z) => (z === k ? { ...y, q: Number(x.target.value) || 0 } : y)) })} />
        <input className="inp" style={{ width: 110 }} inputMode="decimal" value={l.p} aria-label="Price" onChange={(x) => setOpt(i, { ...o, lines: o.lines.map((y, z) => (z === k ? { ...y, p: Number(x.target.value) || 0 } : y)) })} />
        <button className="lnk" onClick={() => setOpt(i, { ...o, lines: o.lines.filter((_, z) => z !== k) })}>✕</button></div>)}
      <div className="row wrap"><select className="inp" style={{ maxWidth: 280 }} value="" onChange={(x) => { const b = book.find((y) => y.id === x.target.value); if (b) setOpt(i, { ...o, lines: [...o.lines, { d: b.name, p: Number(b.prices?.res ?? Object.values(b.prices ?? {})[0] ?? 0), q: 1 }] }); }}>
        <option value="">+ From price book</option>{book.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
        <button className="btn sm" onClick={() => setOpt(i, { ...o, lines: [...o.lines, { d: '', p: 0, q: 1 }] })}>+ Line</button></div>
    </div>)}
    {canEdit && v.options.length < 4 && <div><button className="btn sm" onClick={() => setV({ ...v, options: [...v.options, { name: ['Good', 'Better', 'Best', 'Option 4'][v.options.length] ?? `Option ${v.options.length + 1}`, lines: [] }] })}>+ Add another option</button> <span className="s">Like Repair vs. Replace, or Good / Better / Best.</span></div>}
    {canEdit && <div className="card" style={{ gap: 8 }}><b>Where it stands</b>
      <div className="row wrap">
        <button className="btn sm" onClick={() => save('sent')}>Mark as sent</button>
        {v.options.map((o, i) => <button key={i} className="btn sm" onClick={() => save('approved', { picked: i })}>Approved: {o.name}</button>)}
        <button className="btn sm danger" onClick={() => { const why = v.declined_reason || 'Customer said no'; save('declined', { declined_reason: why }); }}>Not approved</button>
      </div>
      {v.job_id && <label className="row" style={{ fontWeight: 500 }}><input type="checkbox" style={{ width: 20, height: 20 }} checked={v.addToJob} onChange={(x) => setV({ ...v, addToJob: x.target.checked })} />When approved, add the picked option to the job's invoice</label>}
      {v.job_id && <button className="lnk" onClick={() => onOpenJob(v.job_id)}>Open the job →</button>}
      <span className="s">Texting and emailing the estimate to the customer turns on with texting (Twilio).</span></div>}
    {e && <div className="err">{e}</div>}
  </Modal>;
}
