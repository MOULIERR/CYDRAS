// Set up pages like the mockup: Categories & job types, and Checklists (steps techs check off).
import { useState } from 'react';
import { supabase, check } from '../supabase';
import { useSession, isManager } from '../session';
import { useLive } from '../live';
import { Modal, PageH, catsOf, useCompany, type Cat } from '../ui';

const PAL = ['#2a7de1', '#d9480f', '#7b4ccf', '#1f8a4c', '#0b8a8a', '#1c6fb5', '#a07a00', '#c2255c', '#98002e', '#5f6670'];
export const DEFAULT_TYPES = ['Estimate', 'Install', 'Leak / water', 'No cooling', 'No heat', 'PM visit', 'Thermostat'];

function useSettings() {
  const { member } = useSession();
  const c = member!.company_id;
  const company = useCompany(c);
  const [err, setErr] = useState('');
  const save = async (patch: Record<string, unknown>) => {
    setErr('');
    try { check(await supabase.from('companies').update({ settings: { ...(company?.settings ?? {}), ...patch } }).eq('id', c)); } catch (e) { setErr((e as Error).message); }
  };
  return { company, save, err, owner: member!.role === 'owner' };
}

export function Categories() {
  const { company, save, err, owner } = useSettings();
  const cats = catsOf(company);
  const types: string[] = company?.settings?.jobTypes ?? DEFAULT_TYPES;
  const [ed, setEd] = useState<{ i: number; c: Cat } | null>(null);
  const [nt, setNt] = useState('');
  if (!company) return <div className="s">Loading…</div>;
  return (
    <>
      <PageH eyebrow="Set up" title="Categories & job types" />
      {err && <div className="err">{err}</div>}
      {!owner && <div className="s">Only the owner can change these.</div>}
      <div className="cols"><div className="colA">
        <div className="card"><div className="cardh"><h2>Categories</h2>{owner && <button className="btn sm" onClick={() => setEd({ i: -1, c: { id: 'c' + Date.now(), n: '', c: PAL[cats.length % PAL.length] } })}>+ New category</button>}</div>
          <p className="s" style={{ margin: 0 }}>The color tag the crew sees on the schedule, dispatch board and in the new-job notification.</p>
          {cats.map((x, i) => <div className="prow" key={x.id}><span className="ctag" style={{ ['--cc' as any]: x.c }}>{x.n}</span><span className="t" />{owner && <button className="btn sm" onClick={() => setEd({ i, c: x })}>✎ Edit</button>}</div>)}
        </div>
      </div><div className="colB">
        <div className="card"><div className="cardh"><h2>Job types</h2></div><p className="s" style={{ margin: 0 }}>Shown as quick buttons when booking.</p>
          {types.slice().sort().map((t) => <div className="prow" key={t}><b className="t">{t}</b>{owner && <button className="lnk" onClick={() => save({ jobTypes: types.filter((x) => x !== t) })}>Remove</button>}</div>)}
          {owner && <div className="row"><input className="inp" value={nt} placeholder="Duct cleaning" onChange={(e) => setNt(e.target.value)} /><button className="btn sm" onClick={() => { const v = nt.trim(); if (v && !types.some((x) => x.toLowerCase() === v.toLowerCase())) { save({ jobTypes: [...types, v] }); setNt(''); } }}>Add</button></div>}
        </div>
      </div></div>
      {ed && <Modal title={ed.i < 0 ? 'New category' : 'Edit category'} onClose={() => setEd(null)} onSave={() => { if (!ed.c.n.trim()) return; const next = ed.i < 0 ? [...cats, { ...ed.c, n: ed.c.n.trim() }] : cats.map((x, k) => (k === ed.i ? { ...ed.c, n: ed.c.n.trim() } : x)); save({ categories: next }); setEd(null); }}>
        <label className="field">Name<input value={ed.c.n} placeholder="Duct cleaning, Warranty…" onChange={(e) => setEd({ ...ed, c: { ...ed.c, n: e.target.value } })} /></label>
        <div><b>Color</b><div className="row wrap" style={{ marginTop: 8 }}>{PAL.map((p) => <button key={p} type="button" aria-label={`Color ${p}`} aria-pressed={ed.c.c === p} onClick={() => setEd({ ...ed, c: { ...ed.c, c: p } })}
          style={{ width: 34, height: 34, borderRadius: '50%', background: p, border: ed.c.c === p ? '3px solid var(--ink)' : '2px solid var(--surface)', cursor: 'pointer' }} />)}</div></div>
        {ed.i >= 0 && cats.length > 1 && <div><button className="btn sm danger" onClick={() => { save({ categories: cats.filter((_, k) => k !== ed.i) }); setEd(null); }}>Delete category</button> <span className="s">Jobs keep their name, they just lose the color.</span></div>}
      </Modal>}
    </>
  );
}

type Item = { t: string; k: 'ck' | 'yn' | 'tx' | 'ct' };
const KINDS: [Item['k'], string][] = [['ck', 'Checkbox'], ['yn', 'Yes / No'], ['tx', 'Write-in'], ['ct', 'Count']];

export function Checklists() {
  const { member } = useSession();
  const c = member!.company_id, mgr = isManager(member);
  const [ed, setEd] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const { data, reload } = useLive(async () => check(await supabase.from('checklists').select('*').eq('company_id', c).is('deleted_at', null).order('name')) as any[], ['checklists'], c, [c]);
  const run = async (f: () => Promise<unknown>) => { setErr(''); try { await f(); reload(); setEd(null); } catch (e) { setErr((e as Error).message); } };
  return (
    <>
      <PageH eyebrow="Checklists" title="Job checklists" right={mgr && <button className="btn pri" onClick={() => setEd({ name: '', items: [{ t: '', k: 'ck' }] })}>+ New checklist</button>} />
      <p className="s" style={{ margin: 0 }}>The owner and supervisors build these. Techs fill them out on the job. A checklist is only on a job when someone picks it.</p>
      {err && <div className="err">{err}</div>}
      <div className="grid g2">
        {(data ?? []).map((x) => <div className="card" key={x.id}><div className="cardh"><h3>{x.name}</h3>{mgr && <button className="btn sm" onClick={() => setEd({ ...x, items: (x.items ?? []).map((i: any) => (typeof i === 'string' ? { t: i, k: 'ck' } : i)) })}>✎ Edit</button>}</div>
          <span className="s">{(x.items ?? []).length} steps</span>
          {(x.items ?? []).slice(0, 6).map((it: any, i: number) => <div key={i} className="row" style={{ fontSize: 14 }}><span className="pill p-sched">{KINDS.find((k) => k[0] === (it.k ?? 'ck'))?.[1]}</span>{it.t ?? it}</div>)}
          {(x.items ?? []).length > 6 && <span className="s">+{x.items.length - 6} more</span>}</div>)}
        {data && !data.length && <div className="empty">No checklists yet. Tap + New checklist.</div>}
      </div>
      {ed && <Modal title={ed.id ? 'Edit checklist' : 'New checklist'} saveLabel="Save checklist" onClose={() => setEd(null)} onSave={() => {
        const items = (ed.items as Item[]).map((i) => ({ ...i, t: i.t.trim() })).filter((i) => i.t);
        if (!ed.name.trim() || !items.length) return setErr('Give it a name and at least one step.');
        run(async () => check(ed.id ? await supabase.from('checklists').update({ name: ed.name.trim(), items }).eq('id', ed.id) : await supabase.from('checklists').insert({ company_id: c, name: ed.name.trim(), items })));
      }}>
        <label className="field">Checklist name<input value={ed.name} placeholder="PM visit · rooftop unit" onChange={(e) => setEd({ ...ed, name: e.target.value })} /></label>
        <b>Steps</b><span className="s">Pick Count for anything with more than one, like units or vents. The tech taps + for each one.</span>
        {(ed.items as Item[]).map((it, i) => <div key={i} className="row">
          <input className="inp" value={it.t} placeholder="Check capacitor and contactor" onChange={(e) => setEd({ ...ed, items: ed.items.map((y: Item, k: number) => (k === i ? { ...y, t: e.target.value } : y)) })} />
          <select className="inp" style={{ width: 130 }} value={it.k} onChange={(e) => setEd({ ...ed, items: ed.items.map((y: Item, k: number) => (k === i ? { ...y, k: e.target.value } : y)) })}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <button className="lnk" aria-label="Remove step" onClick={() => setEd({ ...ed, items: ed.items.filter((_: Item, k: number) => k !== i) })}>✕</button></div>)}
        <div><button className="btn sm" onClick={() => setEd({ ...ed, items: [...ed.items, { t: '', k: 'ck' }] })}>+ Add step</button></div>
        {ed.id && <div><button className="btn sm danger" onClick={() => run(async () => check(await supabase.from('checklists').update({ deleted_at: new Date().toISOString() }).eq('id', ed.id)))}>Delete checklist</button> <span className="s">It comes off future jobs. Jobs that already have it keep their answers.</span></div>}
      </Modal>}
    </>
  );
}
