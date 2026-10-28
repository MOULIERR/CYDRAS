// One job, laid out like the mockup: status buttons, dispatch info, visits, private notes, invoice, payments,
// summary of work on the left; checklists, equipment and past calls on the right.
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { totals } from '@cydras/core';
import { supabase, check } from '../supabase';
import { useSession, isManager } from '../session';
import { useLive } from '../live';
import {
  Avatar, CatTag, Modal, StatusPill, TimeInput, catsOf, dayKey, dayLabel, hm, isoAt, minOfIso, money, today, useCompany,
} from '../ui';

const STAT_BTNS: [string, string][] = [['on_the_way', 'On the way'], ['on_site', 'On site'], ['done', 'Done'], ['no_show', 'No-show'], ['canceled', 'Cancel']];

export function Job() {
  const { id = '' } = useParams();
  const { member } = useSession();
  const c = member!.company_id, mgr = isManager(member), can = (p: string) => member!.role === 'owner' || !!member!.perms?.[p];
  const nav = useNavigate();
  const company = useCompany(c);
  const cats = catsOf(company);
  const [err, setErr] = useState('');
  const [modal, setModal] = useState<null | 'edit' | 'visit' | 'book' | 'line' | 'pay' | 'disc' | 'checklist'>(null);

  const { data, reload } = useLive(async () => {
    const job = check(await supabase.from('jobs').select('*, customers(id, name, kind, contact, notes), sites(id, address, site_notes), job_assignments(member_id, deleted_at)').eq('id', id).single()) as any;
    const rootId = job.parent_job_id ?? job.id;
    const root = rootId === job.id ? job : (check(await supabase.from('jobs').select('*').eq('id', rootId).single()) as any);
    const visits = check(await supabase.from('jobs').select('id, number, starts_at, ends_at, status, visit_number, visit_note, parent_job_id, job_assignments(member_id, deleted_at)').or(`id.eq.${rootId},parent_job_id.eq.${rootId}`).is('deleted_at', null).order('visit_number')) as any[];
    const lines = check(await supabase.from('job_lines').select('*').eq('job_id', rootId).is('deleted_at', null).order('position')) as any[];
    const invoice = (check(await supabase.from('invoices').select('*').eq('job_id', rootId).is('deleted_at', null).limit(1)) as any[])[0] ?? null;
    const pays = check(await supabase.from('payments').select('*').or(`job_id.eq.${rootId}${invoice ? `,invoice_id.eq.${invoice.id}` : ''}`).order('taken_at')) as any[];
    const people = check(await supabase.from('members').select('id, name, role').eq('company_id', c).eq('active', true).order('name')) as any[];
    const contacts = check(await supabase.from('customer_contacts').select('*').eq('customer_id', job.customer_id).is('deleted_at', null)) as any[];
    const units = check(await supabase.from('units').select('*').eq('customer_id', job.customer_id).is('deleted_at', null)) as any[];
    const past = check(await supabase.from('jobs').select('id, number, type, starts_at, status, summary').eq('customer_id', job.customer_id).eq('status', 'done').neq('id', job.id).is('deleted_at', null).order('starts_at', { ascending: false }).limit(5)) as any[];
    const cls = check(await supabase.from('checklists').select('id, name, items').eq('company_id', c).is('deleted_at', null).order('name')) as any[];
    const jcl = check(await supabase.from('job_checklists').select('*').eq('job_id', job.id).is('deleted_at', null)) as any[];
    const book = check(await supabase.from('price_items').select('*').eq('company_id', c).eq('active', true).is('deleted_at', null).order('name')) as any[];
    return { job, root, visits, lines, invoice, pays, people, contacts, units, past, cls, jcl, book };
  }, ['jobs', 'job_assignments', 'job_lines', 'invoices', 'payments', 'job_checklists'], c, [c, id]);

  if (!data) return <div className="s">Loading…</div>;
  const { job, root, visits, lines, invoice, pays, people, contacts, units, past, cls, jcl, book } = data;
  const crew: string[] = (job.job_assignments ?? []).filter((a: any) => !a.deleted_at).map((a: any) => a.member_id);
  const name = (m: string) => people.find((p) => p.id === m)?.name ?? '';
  const t = totals(lines.map((l) => ({ price: Number(l.price), qty: Number(l.qty) })), Number(company?.tax_rate ?? 0.07), root.discount ?? null,
    pays.map((p) => ({ amount: Number(p.amount), refunded_amount: Number(p.refunded_amount ?? 0), voided_at: p.voided_at, status: p.status })));
  const phone = contacts.find((x) => x.kind === 'phone' && x.is_primary) ?? contacts.find((x) => x.kind === 'phone');
  const day = dayKey(new Date(job.starts_at));
  const run = async (f: () => Promise<unknown>) => { setErr(''); try { await f(); reload(); return true; } catch (e) { setErr((e as Error).message); return false; } };

  const setStatus = (s: string) => run(async () => check(await supabase.from('jobs').update({ status: s, status_times: { ...(job.status_times ?? {}), [s]: new Date().toISOString() } }).eq('id', job.id)));
  async function syncInvoice() {
    const row = { subtotal: t.sub - t.off, tax: t.tax, total: t.total };
    if (invoice) { if (can('prices')) check(await supabase.from('invoices').update(row).eq('id', invoice.id)); return invoice.id as string; }
    const inv = check(await supabase.from('invoices').insert({ company_id: c, customer_id: job.customer_id, job_id: root.id, ...row }).select('id').single()) as any;
    return inv.id as string;
  }

  return (
    <>
      <div className="pageh"><div><button className="lnk" onClick={() => nav(-1)} style={{ marginBottom: 6 }}>← Back</button>
        <p className="eyebrow">#{job.number ?? '—'}{visits.length > 1 ? ` · Visit ${job.visit_number} of ${visits.length}` : ''} · {dayLabel(day)}</p><h1>{job.customers?.name}</h1></div>
        <div className="row wrap"><CatTag cats={cats} name={job.category} /> <StatusPill s={job.status} /></div></div>
      <div className="row wrap">
        {STAT_BTNS.map(([k, l]) => <button key={k} className={`btn sm ${job.status === k ? 'dark' : ''}`} onClick={() => setStatus(k)}>{l}</button>)}
        <span style={{ flex: 1 }} />
        {mgr && <button className={`btn sm ${job.callback ? 'dark' : ''}`} onClick={() => run(async () => check(await supabase.from('jobs').update({ callback: !job.callback }).eq('id', job.id)))}>Callback</button>}
        {can('payments') && t.due > 0 && <button className="btn sm pri" onClick={() => setModal('pay')}>Take payment</button>}
      </div>
      {err && <div className="err">{err}</div>}

      <div className="cols"><div className="colA">
        <div className="card"><div className="cardh"><h2>Dispatch</h2>{can('schedule') && <button className="btn sm" onClick={() => setModal('edit')}>✎ Edit</button>}</div>
          <div className="dsp">
            <div className="k">When</div><div><b>{dayLabel(day, true)}</b> · {hm(job.starts_at)}–{hm(job.ends_at)}{job.urgent ? <span className="pill p-bad"> Urgent</span> : null}</div>
            <div className="k">Job</div><div><CatTag cats={cats} name={job.category} /> <b>{job.type}</b>{job.parent_job_id ? <span className="pill p-sched"> Visit {job.visit_number} of {visits.length}</span> : null}{job.callback ? <span className="pill p-route"> Callback</span> : null}</div>
            {job.visit_note && <><div className="k">This visit</div><div>{job.visit_note}</div></>}
            <div className="k">Address</div><div>{job.sites?.address ? <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.sites.address)}`} target="_blank" rel="noreferrer">📍 {job.sites.address}</a> : <span className="s">No address</span>}</div>
            <div className="k">Contact</div><div><b>{job.customers?.contact || job.customers?.name}</b>{phone && <> · <span className="mono">{phone.value}</span></>}</div>
            <div className="k">Crew</div><div className="row wrap">{crew.length ? crew.map((m, i) => <span key={m} className="row" style={{ gap: 6 }}><Avatar name={name(m)} i={i} />{name(m)}</span>) : <span className="pill p-warn">Needs a tech</span>}</div>
            <div className="k">Past calls</div><div>{past.length ? past.slice(0, 3).map((p) => <div key={p.id}><b>{p.type}</b> <span className="s">· {dayLabel(dayKey(new Date(p.starts_at)))}</span></div>) : <span className="s">First visit. Nothing on file yet.</span>}</div>
          </div></div>

        <div className="card"><div className="cardh"><h3>Visits on this job{visits.length > 1 ? ` · ${visits.length}` : ''}</h3>{can('schedule') && <button className="btn sm" style={{ marginLeft: 'auto' }} onClick={() => setModal('visit')}>+ Add visit</button>}</div>
          {visits.length < 2 ? <span className="s">Need to come back? Add another visit to this same job. Everything stays on one invoice.</span>
            : <>{visits.map((v, i) => <div key={v.id} className={`vrow ${v.id === job.id ? 'on' : ''}`} role="button" tabIndex={0} onClick={() => nav(`/job/${v.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/job/${v.id}`)}>
              <span className="vn">{i + 1}</span><div style={{ flex: 1, minWidth: 0 }}><b>{dayLabel(dayKey(new Date(v.starts_at)), true)}</b> · {hm(v.starts_at)}–{hm(v.ends_at)}
                <div className="s">{(v.job_assignments ?? []).filter((a: any) => !a.deleted_at).map((a: any) => name(a.member_id)).join(', ') || 'Needs a tech'}{v.visit_note ? ' · ' + v.visit_note : ''}</div></div><StatusPill s={v.status} /></div>)}
              <span className="s" style={{ fontSize: 13 }}>Every visit bills on one invoice.</span></>}
        </div>

        {(job.sites?.site_notes?.length || job.customers?.notes?.length) ? <div className="notes"><b>Site notes</b>{[...(job.sites?.site_notes ?? []), ...(job.customers?.notes ?? [])].map((n: string, i: number) => <div key={i}>{n}</div>)}</div> : null}

        <PrivateNotes job={job} onSave={(list) => run(async () => check(await supabase.from('jobs').update({ private_notes: list }).eq('id', job.id)))} />

        <div className="card"><div className="cardh"><h3>Invoice items</h3>
          {job.status !== 'done' || mgr ? <><button className="btn sm" onClick={() => setModal('book')}>+ Price book</button><button className="btn sm" onClick={() => setModal('line')}>+ Materials</button>{can('discounts') && <button className="btn sm" onClick={() => setModal('disc')}>{root.discount?.value ? '✎ Discount' : '+ Discount'}</button>}</> : null}</div>
          {lines.length ? lines.map((l) => <div key={l.id} className="line" style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '6px 0', borderBottom: '1px solid var(--line)' }}>
            <span style={{ flex: 1 }}>{l.description}{Number(l.qty) !== 1 ? <span className="s"> × {Number(l.qty)}</span> : null}{l.kind === 'part' ? <span className="pill p-sched"> Material</span> : null}</span>
            <span className="mono">{money(Number(l.price) * Number(l.qty))}</span>
            {(can('prices') || can('remove')) && <button className="lnk" onClick={() => run(async () => { check(await supabase.from('job_lines').update({ deleted_at: new Date().toISOString() }).eq('id', l.id)); })}>Remove</button>}</div>)
            : <div className="empty">Nothing billed yet. Add what you did from the price book.</div>}
          <dl className="sum" style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: '4px 16px', margin: 0 }}>
            <dt>Subtotal</dt><dd className="mono" style={{ margin: 0 }}>{money(t.sub)}</dd>
            {t.off > 0 && <><dt>Discount{root.discount?.type === 'pct' ? ` (${root.discount.value}%)` : ''}</dt><dd className="mono" style={{ margin: 0, color: 'var(--ok)' }}>−{money(t.off)}</dd></>}
            <dt>Tax {(Number(company?.tax_rate ?? 0.07) * 100).toFixed(1)}%</dt><dd className="mono" style={{ margin: 0 }}>{money(t.tax)}</dd>
            <dt><b>Total</b></dt><dd className="mono" style={{ margin: 0 }}><b>{money(t.total)}</b></dd>
            {t.paid > 0 && <><dt>Paid</dt><dd className="mono" style={{ margin: 0, color: 'var(--ok)' }}>{money(t.paid)}</dd><dt><b>Still owes</b></dt><dd className="mono" style={{ margin: 0 }}><b>{money(t.due)}</b></dd></>}
          </dl>
          {pays.length > 0 && <div><p className="eyebrow">Payments</p>{pays.map((p) => <div className="prow" key={p.id}><div className="t"><b>{money(Number(p.amount))}</b> · {p.method.replace(/_/g, ' ')}{p.reference ? ` #${p.reference}` : ''}<br />
            <span className="s">{dayLabel(dayKey(new Date(p.taken_at)))} {hm(p.taken_at)}{p.voided_at ? ` · Canceled: ${p.void_reason}` : ''}{Number(p.refunded_amount) > 0 ? ` · Refunded ${money(Number(p.refunded_amount))}` : ''}</span></div>
            {!p.voided_at && (member!.role === 'owner' || (mgr && can('payments'))) && ['cash', 'check', 'zelle'].includes(p.method) && <button className="btn sm danger" onClick={() => { const why = window.prompt?.('Why cancel this payment?') ?? 'Entered by mistake'; run(async () => check(await supabase.rpc('void_payment', { p_payment: p.id, p_reason: why || 'Entered by mistake' }))); }}>Cancel payment</button>}</div>)}</div>}
        </div>

        <Summary root={root} onSave={(s) => run(async () => check(await supabase.from('jobs').update({ summary: s }).eq('id', root.id)))} />
      </div><div className="colB">
        <div className="card"><div className="cardh"><h3>Checklists</h3>{mgr && <button className="btn sm" onClick={() => setModal('checklist')}>+ Add</button>}</div>
          {jcl.length ? jcl.map((x) => { const cl = cls.find((y) => y.id === x.checklist_id); if (!cl) return null; const items = cl.items ?? []; const done = items.filter((_: any, i: number) => x.answers?.[i] != null && x.answers[i] !== '' && x.answers[i] !== false).length;
            return <div key={x.checklist_id} className="prow"><div className="t"><b>{cl.name}</b><br /><span className="s">{done} of {items.length} done</span></div>
              {mgr && <button className="lnk" onClick={() => run(async () => check(await supabase.from('job_checklists').update({ deleted_at: new Date().toISOString() }).eq('job_id', job.id).eq('checklist_id', cl.id)))}>Remove</button>}</div>; })
            : <span className="s">No checklist on this job. Only add one if the tech needs it.</span>}
        </div>
        <div className="card"><h3>Equipment</h3>{units.length ? units.map((u) => <div className="prow" key={u.id}><div className="t"><b>{u.tag ? `${u.tag} · ` : ''}{u.type}</b><br /><span className="s mono">{[u.make, u.model].filter(Boolean).join(' ')}{u.serial ? ` · S/N ${u.serial}` : ''}{u.year ? ` · ${u.year}` : ''}</span></div></div>) : <span className="s">No equipment on file yet. Techs add it from the phone (scan the data plate).</span>}</div>
        <div className="card"><h3>Past calls</h3>{past.length ? past.map((p) => <div className="prow" key={p.id} style={{ cursor: 'pointer' }} onClick={() => nav(`/job/${p.id}`)}><div className="t"><b>{p.type}</b><br /><span className="s">{dayLabel(dayKey(new Date(p.starts_at)))}{p.summary ? ` · ${p.summary}` : ''}</span></div></div>) : <span className="s">First visit. Nothing on file yet.</span>}</div>
        <div className="card"><h3>Customer</h3><Link className="btn" to={`/customer/${job.customer_id}`}>Open {job.customers?.name} →</Link></div>
      </div></div>

      {modal === 'edit' && <EditDispatch job={job} cats={cats} people={people} crew={crew} day={day} onClose={() => setModal(null)} onSave={async (v) => {
        const ok = await run(async () => {
          check(await supabase.from('jobs').update({ starts_at: isoAt(v.day, v.start), ends_at: isoAt(v.day, v.end), type: v.type, category: v.category }).eq('id', job.id));
          for (const m of crew.filter((x) => !v.crew.includes(x))) check(await supabase.from('job_assignments').update({ deleted_at: new Date().toISOString() }).eq('job_id', job.id).eq('member_id', m));
          for (const m of v.crew.filter((x) => !crew.includes(x))) check(await supabase.from('job_assignments').upsert({ job_id: job.id, member_id: m, company_id: c, deleted_at: null }));
        }); if (ok) setModal(null); }} />}
      {modal === 'visit' && <AddVisit root={root} visits={visits} people={people} crew={crew} onClose={() => setModal(null)} onSave={async (v) => {
        const ok = await run(async () => {
          const nv = check(await supabase.from('jobs').insert({ company_id: c, customer_id: root.customer_id, site_id: root.site_id, type: root.type, category: root.category,
            starts_at: isoAt(v.day, v.start), ends_at: isoAt(v.day, v.end), parent_job_id: root.id, visit_number: visits.length + 1, visit_note: v.note || null }).select('id').single()) as any;
          if (v.crew.length) check(await supabase.from('job_assignments').insert(v.crew.map((m) => ({ job_id: nv.id, member_id: m, company_id: c }))));
        }); if (ok) setModal(null); }} />}
      {modal === 'book' && <Modal title="Add from the price book" onClose={() => setModal(null)}>
        {book.length ? <PriceBook book={book} kind={job.customers?.kind} onPick={(desc, price) => run(async () => { check(await supabase.from('job_lines').insert({ company_id: c, job_id: root.id, description: desc, price, qty: 1, kind: 'service', position: lines.length })); setModal(null); })} />
          : <div className="empty">Your price book is empty. Add your prices in <b>Price book</b> (coming next), or use <b>+ Materials</b> to type a line.</div>}
      </Modal>}
      {modal === 'line' && <LineForm onClose={() => setModal(null)} onSave={(l) => run(async () => { check(await supabase.from('job_lines').insert({ company_id: c, job_id: root.id, description: l.d, price: l.p, qty: l.q, kind: 'part', position: lines.length })); setModal(null); })} />}
      {modal === 'disc' && <DiscountForm cur={root.discount} sub={t.sub} onClose={() => setModal(null)} onSave={(d) => run(async () => { check(await supabase.from('jobs').update({ discount: d }).eq('id', root.id)); setModal(null); })} />}
      {modal === 'pay' && <PayForm due={t.due} onClose={() => setModal(null)} onSave={(p) => run(async () => {
        const inv = await syncInvoice();
        check(await supabase.from('payments').insert({ company_id: c, invoice_id: inv, job_id: root.id, customer_id: job.customer_id, method: p.method, amount: p.amount, reference: p.ref || null, status: 'succeeded' }));
        setModal(null); })} />}
      {modal === 'checklist' && <Modal title="Add a checklist" onClose={() => setModal(null)}>
        {cls.filter((x) => !jcl.some((y) => y.checklist_id === x.id)).map((x) => <button key={x.id} className="alert" onClick={() => run(async () => { check(await supabase.from('job_checklists').upsert({ job_id: job.id, checklist_id: x.id, company_id: c, deleted_at: null })); setModal(null); })}><b>{x.name}</b><span className="s" style={{ marginLeft: 'auto' }}>{(x.items ?? []).length} steps</span></button>)}
        {!cls.length && <div className="empty">No checklists yet. Build them in <b>Checklists</b>.</div>}
      </Modal>}
    </>
  );
}

function PrivateNotes({ job, onSave }: { job: any; onSave: (l: string[]) => void }) {
  const [list, setList] = useState<string[]>(job.private_notes?.length ? job.private_notes : ['']);
  const save = (l: string[]) => { const clean = l.map((x) => x.trim()).filter(Boolean); if (JSON.stringify(clean) !== JSON.stringify(job.private_notes ?? [])) onSave(clean); };
  return <div className="card"><div className="cardh"><h3>Private notes</h3><span className="priv">Team only</span>
    <button className="ptplus" style={{ marginLeft: 'auto' }} aria-label="Add another private note" onClick={() => { if (list[list.length - 1]?.trim()) setList([...list, '']); }}>+</button></div>
    {list.map((t, i) => <textarea key={i} className="inp ptbox" aria-label={`Private note ${i + 1}`} value={t} placeholder="Gate codes, follow-ups, who to talk to, what the customer OK'd. Only your team sees this."
      onChange={(e) => setList(list.map((x, k) => (k === i ? e.target.value : x)))} onBlur={() => save(list)} />)}
  </div>;
}

function Summary({ root, onSave }: { root: any; onSave: (s: string) => void }) {
  const [s, setS] = useState(root.summary ?? '');
  return <div className="card"><h3>Summary of work</h3><textarea className="inp" style={{ minHeight: 90, padding: 10 }} value={s} placeholder="What was found and what was done. The customer sees this on the invoice."
    onChange={(e) => setS(e.target.value)} onBlur={() => s !== (root.summary ?? '') && onSave(s)} /></div>;
}

function CrewPick({ people, value, onChange }: { people: any[]; value: string[]; onChange: (v: string[]) => void }) {
  return <div><b>Techs</b> <span className="s">(leave empty for “Needs a tech”)</span><div className="chips" style={{ marginTop: 6 }}>
    {people.map((p) => <button key={p.id} type="button" className="chip" aria-pressed={value.includes(p.id)} onClick={() => onChange(value.includes(p.id) ? value.filter((x) => x !== p.id) : [...value, p.id])}>{p.name}</button>)}</div></div>;
}

function EditDispatch({ job, cats, people, crew, day, onClose, onSave }: { job: any; cats: any[]; people: any[]; crew: string[]; day: string; onClose: () => void; onSave: (v: { day: string; start: number; end: number; type: string; category: string; crew: string[] }) => void }) {
  const [v, setV] = useState({ day, start: minOfIso(job.starts_at), end: minOfIso(job.ends_at), type: job.type, category: job.category ?? '', crew });
  const [e, setE] = useState('');
  return <Modal title="Edit dispatch info" onClose={onClose} onSave={() => { if (v.end <= v.start) return setE('The end time has to be after the start.'); onSave(v); }}>
    <div className="form">
      <label className="field">Date<input type="date" value={v.day} onChange={(x) => setV({ ...v, day: x.target.value })} /></label>
      <TimeInput id="ed_s" label="Arrive from" value={v.start} onChange={(m) => setV({ ...v, start: m, end: v.end > m ? v.end : Math.min(m + 120, 1435) })} />
      <TimeInput id="ed_e" label="Arrive by" value={v.end} onChange={(m) => setV({ ...v, end: m })} />
      <label className="field full">Job description<input value={v.type} onChange={(x) => setV({ ...v, type: x.target.value })} /></label>
    </div>
    <div><b>Category</b><div className="chips" style={{ marginTop: 6 }}>{cats.map((ct) => <button key={ct.id} type="button" className="chip cat" style={{ ['--cc' as any]: ct.c }} aria-pressed={v.category === ct.n} onClick={() => setV({ ...v, category: ct.n })}><i />{ct.n}</button>)}</div></div>
    <CrewPick people={people} value={v.crew} onChange={(crew) => setV({ ...v, crew })} />
    <p className="s" style={{ margin: 0 }}>Type any time, like 7:05, 730 or 2pm.</p>
    {e && <div className="err">{e}</div>}
  </Modal>;
}

function AddVisit({ root, visits, people, crew, onClose, onSave }: { root: any; visits: any[]; people: any[]; crew: string[]; onClose: () => void; onSave: (v: { day: string; start: number; end: number; note: string; crew: string[] }) => void }) {
  const last = visits[visits.length - 1];
  const lastDay = dayKey(new Date(last.starts_at));
  const d = new Date((lastDay > today() ? lastDay : today()) + 'T12:00'); d.setDate(d.getDate() + 1);
  const [v, setV] = useState({ day: dayKey(d), start: minOfIso(root.starts_at), end: minOfIso(root.ends_at), note: '', crew });
  const [e, setE] = useState('');
  return <Modal title={`Add visit ${visits.length + 1}`} saveLabel="Add visit" onClose={onClose} onSave={() => { if (v.end <= v.start) return setE('The end time has to be after the start.'); onSave(v); }}>
    <p className="s" style={{ margin: 0 }}>Same job, same invoice. Use it to come back with the part, finish the install, or check your work.</p>
    <div className="form">
      <label className="field">Date<input type="date" value={v.day} onChange={(x) => setV({ ...v, day: x.target.value })} /></label>
      <TimeInput id="av_s" label="Arrive from" value={v.start} onChange={(m) => setV({ ...v, start: m, end: v.end > m ? v.end : Math.min(m + 120, 1435) })} />
      <TimeInput id="av_e" label="To" value={v.end} onChange={(m) => setV({ ...v, end: m })} />
      <label className="field full">What's this visit for?<input value={v.note} placeholder="Install the new motor, it comes in Thursday" onChange={(x) => setV({ ...v, note: x.target.value })} /></label>
    </div>
    <CrewPick people={people} value={v.crew} onChange={(c) => setV({ ...v, crew: c })} />
    {e && <div className="err">{e}</div>}
  </Modal>;
}

function PriceBook({ book, kind, onPick }: { book: any[]; kind?: string; onPick: (desc: string, price: number) => void }) {
  const [q, setQ] = useState('');
  const rate = kind === 'business' ? 'com' : 'res';
  const list = book.filter((b) => !q || b.name.toLowerCase().includes(q.toLowerCase()));
  return <>
    <input className="inp" placeholder="Search the price book" value={q} onChange={(e) => setQ(e.target.value)} />
    {list.map((b) => { const p = Number(b.prices?.[rate] ?? b.prices?.res ?? Object.values(b.prices ?? {})[0] ?? 0);
      return <button key={b.id} className="alert" onClick={() => onPick(`${b.name} (${rate === 'com' ? 'Commercial' : 'Residential'})`, p)}><span style={{ flex: 1 }}><b>{b.name}</b><br /><span className="s">{b.category}</span></span><b className="mono">{money(p)}</b></button>; })}
  </>;
}

function LineForm({ onClose, onSave }: { onClose: () => void; onSave: (l: { d: string; p: number; q: number }) => void }) {
  const [l, setL] = useState({ d: '', p: '', q: '1' }); const [e, setE] = useState('');
  return <Modal title="Add materials or a line" onClose={onClose} onSave={() => { const p = Number(l.p), q = Number(l.q); if (!l.d.trim()) return setE('Write what it is.'); if (!(p >= 0) || !(q > 0)) return setE('Check the price and quantity.'); onSave({ d: l.d.trim(), p, q }); }}>
    <div className="form"><label className="field full">What is it<input value={l.d} placeholder="Capacitor 45/5 MFD" onChange={(x) => setL({ ...l, d: x.target.value })} /></label>
      <label className="field">Price each<input inputMode="decimal" value={l.p} placeholder="0.00" onChange={(x) => setL({ ...l, p: x.target.value })} /></label>
      <label className="field">Quantity<input inputMode="decimal" value={l.q} onChange={(x) => setL({ ...l, q: x.target.value })} /></label></div>
    {e && <div className="err">{e}</div>}
  </Modal>;
}

function DiscountForm({ cur, sub, onClose, onSave }: { cur: any; sub: number; onClose: () => void; onSave: (d: any) => void }) {
  const [d, setD] = useState({ type: cur?.type ?? 'pct', value: String(cur?.value ?? ''), why: cur?.why ?? '' });
  return <Modal title="Discount" onClose={onClose} onSave={() => onSave(Number(d.value) > 0 ? { type: d.type, value: Number(d.value), why: d.why } : null)}>
    <div className="seg" role="group">{[['pct', '% off'], ['amt', '$ off']].map(([k, l]) => <button key={k} aria-pressed={d.type === k} onClick={() => setD({ ...d, type: k })}>{l}</button>)}</div>
    <div className="form"><label className="field">Amount<input inputMode="decimal" value={d.value} onChange={(x) => setD({ ...d, value: x.target.value })} /></label>
      <label className="field">Why (optional)<input value={d.why} placeholder="Maintenance plan member" onChange={(x) => setD({ ...d, why: x.target.value })} /></label></div>
    <span className="s">Subtotal {money(sub)}. Set the amount to 0 to remove the discount.</span>
  </Modal>;
}

function PayForm({ due, onClose, onSave }: { due: number; onClose: () => void; onSave: (p: { method: string; amount: number; ref: string }) => void }) {
  const [p, setP] = useState({ method: 'cash', amount: due.toFixed(2), ref: '' }); const [e, setE] = useState('');
  return <Modal title="Take payment" saveLabel="Record payment" onClose={onClose} onSave={() => { const a = Number(p.amount); if (!(a > 0)) return setE('Type the amount.'); if (p.method === 'check' && !p.ref.trim()) return setE('Type the check number.'); onSave({ ...p, amount: a }); }}>
    <div className="seg" role="group">{[['cash', 'Cash'], ['check', 'Check'], ['zelle', 'Zelle']].map(([k, l]) => <button key={k} aria-pressed={p.method === k} onClick={() => setP({ ...p, method: k })}>{l}</button>)}</div>
    <div className="form"><label className="field">Amount<input inputMode="decimal" value={p.amount} onChange={(x) => setP({ ...p, amount: x.target.value })} /></label>
      {p.method !== 'cash' && <label className="field">{p.method === 'check' ? 'Check #' : 'Zelle confirmation (optional)'}<input value={p.ref} onChange={(x) => setP({ ...p, ref: x.target.value })} /></label>}</div>
    <span className="s">Owes {money(due)}. Cards and Tap to Pay are taken on the tech's phone once your bank is connected (Bank & payouts).</span>
    {e && <div className="err">{e}</div>}
  </Modal>;
}

