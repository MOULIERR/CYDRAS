// Team tasks, like the mockup: to-dos for anyone on the team, with due dates. Overdue ones are red.
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase, check } from '../supabase';
import { useSession, isManager } from '../session';
import { useLive } from '../live';
import { Modal, PageH, addDays, dayLabel, today } from '../ui';

export function Tasks() {
  const { member } = useSession();
  const c = member!.company_id, mgr = isManager(member);
  const [sp] = useSearchParams();
  const [who, setWho] = useState('all');
  const [showDone, setShowDone] = useState(false);
  const [add, setAdd] = useState<any | null>(sp.get('new') ? { title: '', assigned_to: member!.id, due_on: addDays(today(), 1) } : null);
  const [err, setErr] = useState('');
  const { data, error, reload } = useLive(async () => {
    const tasks = check(await supabase.from('tasks').select('*').eq('company_id', c).is('deleted_at', null).order('due_on', { ascending: true, nullsFirst: false })) as any[];
    const people = check(await supabase.from('members').select('id, name').eq('company_id', c).eq('active', true).order('name')) as any[];
    return { tasks, people };
  }, ['tasks'], c, [c]);
  if (error && /tasks/.test(error)) return <><PageH eyebrow="Work" title="Team tasks" /><div className="card" style={{ borderColor: 'var(--warn)' }}><h3>One quick database update needed</h3><span className="s">Team tasks need a new table. Open the <b>Cydras Database Update</b> page Claude sent you, copy, paste it in the Supabase SQL Editor and click Run. Then refresh this page.</span></div></>;
  if (!data) return <div className="s">Loading…</div>;
  const name = (id: string) => data.people.find((p) => p.id === id)?.name ?? '';
  const run = async (f: () => Promise<unknown>) => { setErr(''); try { await f(); reload(); return true; } catch (e) { setErr((e as Error).message); return false; } };
  const list = data.tasks.filter((t) => (who === 'all' || t.assigned_to === who) && (showDone || !t.done_at));
  const late = (t: any) => !t.done_at && t.due_on && t.due_on < today();
  return (
    <>
      <PageH eyebrow="Work" title="Team tasks" right={<button className="btn pri" onClick={() => setAdd({ title: '', assigned_to: mgr ? '' : member!.id, due_on: addDays(today(), 1) })}>+ New task</button>} />
      {err && <div className="err">{err}</div>}
      <div className="row wrap"><div className="chips">{[['all', 'Everyone'], ...data.people.map((p) => [p.id, p.name])].map(([k, l]) => <button key={k} className="chip" aria-pressed={who === k} onClick={() => setWho(k)}>{l}</button>)}</div>
        <label className="row" style={{ fontWeight: 500, marginLeft: 'auto' }}><input type="checkbox" style={{ width: 18, height: 18 }} checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />Show done</label></div>
      <div className="card">{list.map((t) => <div key={t.id} className="prow">
        <input type="checkbox" style={{ width: 22, height: 22 }} aria-label={`Done: ${t.title}`} checked={!!t.done_at} onChange={(e) => run(async () => check(await supabase.from('tasks').update({ done_at: e.target.checked ? new Date().toISOString() : null }).eq('id', t.id)))} />
        <div className="t"><b style={{ textDecoration: t.done_at ? 'line-through' : undefined }}>{t.title}</b><br /><span className="s">{name(t.assigned_to)}{t.created_by !== t.assigned_to ? ` · from ${name(t.created_by)}` : ''}</span></div>
        {t.due_on && <span className={`pill ${late(t) ? 'p-bad' : t.due_on === today() ? 'p-warn' : 'p-sched'}`}>{late(t) ? 'Late · ' : t.due_on === today() ? 'Today · ' : ''}{dayLabel(t.due_on)}</span>}
        {(mgr || t.created_by === member!.id) && <button className="lnk" onClick={() => run(async () => check(await supabase.from('tasks').update({ deleted_at: new Date().toISOString() }).eq('id', t.id)))}>Remove</button>}
      </div>)}
        {!list.length && <div className="empty">{data.tasks.length ? 'Nothing here.' : 'No tasks yet. Tap + New task.'}</div>}</div>
      {add && <Modal title="New task" saveLabel="Save task" onClose={() => setAdd(null)} onSave={() => run(async () => {
        if (!add.title.trim()) throw new Error('Write the task first.');
        if (!add.assigned_to) throw new Error('Pick who it is for.');
        check(await supabase.from('tasks').insert({ company_id: c, created_by: member!.id, assigned_to: add.assigned_to, title: add.title.trim(), due_on: add.due_on || null })); setAdd(null);
      })}>
        <label className="field">Task<input value={add.title} placeholder="Order RTU from Gemaire" onChange={(e) => setAdd({ ...add, title: e.target.value })} /></label>
        <div className="form">
          <label className="field">For<select value={add.assigned_to} disabled={!mgr} onChange={(e) => setAdd({ ...add, assigned_to: e.target.value })}><option value="">Pick one…</option>{data.people.map((p) => <option key={p.id} value={p.id}>{p.id === member!.id ? `${p.name} (you)` : p.name}</option>)}</select></label>
          <label className="field">Due<input type="date" value={add.due_on} onChange={(e) => setAdd({ ...add, due_on: e.target.value })} /></label>
        </div>
        {err && <div className="err">{err}</div>}
      </Modal>}
    </>
  );
}
