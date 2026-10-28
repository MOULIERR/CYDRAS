// Schedule, like the mockup: Week and Month views, filter by person, click a day to see it or book it.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase, check } from '../supabase';
import { useSession, isManager } from '../session';
import { useLive } from '../live';
import { Modal, PageH, addDays, catOf, catsOf, dayKey, dayLabel, dayStart, hm, today, useCompany } from '../ui';

const MN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function Schedule() {
  const { member } = useSession();
  const c = member!.company_id, mgr = isManager(member);
  const nav = useNavigate();
  const cats = catsOf(useCompany(c));
  const [view, setView] = useState<'week' | 'month'>(() => { try { return (localStorage.getItem('cyd_sv') as any) || 'week'; } catch { return 'week'; } });
  const [base, setBase] = useState(today());
  const [who, setWho] = useState('all');
  const [pick, setPick] = useState<string | null>(null);
  const setV = (v: 'week' | 'month') => { setView(v); try { localStorage.setItem('cyd_sv', v); } catch { /* ignore */ } };

  const b = dayStart(base);
  const mon = addDays(base, -((b.getDay() + 6) % 7));
  const first = new Date(b.getFullYear(), b.getMonth(), 1, 12);
  const gridStart = dayKey(new Date(first.getFullYear(), first.getMonth(), 1 - ((first.getDay() + 6) % 7), 12));
  const from = view === 'week' ? mon : gridStart, days = view === 'week' ? 7 : 42;
  const { data } = useLive(async () => {
    const jobs = check(await supabase.from('jobs').select('id, type, category, status, starts_at, ends_at, parent_job_id, visit_number, customers(name), job_assignments(member_id, deleted_at)')
      .eq('company_id', c).gte('starts_at', dayStart(from).toISOString()).lt('starts_at', dayStart(addDays(from, days)).toISOString()).is('deleted_at', null).neq('status', 'canceled').order('starts_at')) as any[];
    const people = check(await supabase.from('members').select('id, name').eq('company_id', c).eq('active', true).order('name')) as any[];
    return { jobs, people };
  }, ['jobs', 'job_assignments'], c, [c, from, days]);

  const crewOf = (j: any): string[] => (j.job_assignments ?? []).filter((a: any) => !a.deleted_at).map((a: any) => a.member_id);
  const name = (m: string) => data?.people.find((p) => p.id === m)?.name ?? '';
  const on = (d: string) => (data?.jobs ?? []).filter((j) => dayKey(new Date(j.starts_at)) === d && (who === 'all' || (who === '_un' ? !crewOf(j).length : crewOf(j).includes(who))));
  const label = (j: any) => `${j.type}${j.parent_job_id ? ` · Visit ${j.visit_number}` : ''}`;
  const move = (n: number) => setBase(view === 'week' ? addDays(base, n * 7) : dayKey(new Date(b.getFullYear(), b.getMonth() + n, 1, 12)));
  const book = (d: string) => nav(`/jobs?new=1&d=${d}`);

  const toggle = <div className="seg" role="group" aria-label="View"><button aria-pressed={view === 'week'} onClick={() => setV('week')}>Week</button><button aria-pressed={view === 'month'} onClick={() => setV('month')}>Month</button></div>;
  const title = view === 'week' ? `Week of ${dayStart(mon).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}` : `${MN[b.getMonth()]} ${b.getFullYear()}`;
  return (
    <>
      <PageH eyebrow="Schedule" title={title} right={<>{toggle}
        <button className="btn sm" onClick={() => move(-1)}>← Prev</button><button className="btn sm" onClick={() => setBase(today())}>{view === 'week' ? 'This week' : 'This month'}</button><button className="btn sm" onClick={() => move(1)}>Next →</button>
        {view === 'month' && <><select className="inp" style={{ width: 'auto', minHeight: 34 }} aria-label="Month" value={b.getMonth()} onChange={(e) => setBase(dayKey(new Date(b.getFullYear(), +e.target.value, 1, 12)))}>{MN.map((n, i) => <option key={n} value={i}>{n}</option>)}</select>
          <select className="inp" style={{ width: 'auto', minHeight: 34 }} aria-label="Year" value={b.getFullYear()} onChange={(e) => setBase(dayKey(new Date(+e.target.value, b.getMonth(), 1, 12)))}>{[...Array(5)].map((_, i) => { const y = new Date().getFullYear() - 1 + i; return <option key={y}>{y}</option>; })}</select></>}
        {mgr && <Link className="btn pri" to="/jobs?new=1">+ New appointment</Link>}</>} />
      <div className="row wrap"><div className="chips">{[['all', 'Everyone'], ['_un', 'Needs a tech'], ...(data?.people ?? []).map((p) => [p.id, p.name])].map(([k, l]) => <button key={k} className="chip" aria-pressed={who === k} onClick={() => setWho(k)}>{l}</button>)}</div>
        <span style={{ flex: 1 }} /><span className="s">{view === 'month' ? 'Click a day to see it or book it.' : 'Click a job to open it.'} To move a job to another time or person, use the Dispatch board.</span></div>

      {view === 'week' ? <div className="tscroll"><div className="week">{[...Array(7)].map((_, i) => { const d = addDays(mon, i), js = on(d);
        return <div key={d} className={`day ${d === today() ? 'today' : ''}`}><div className="row"><b style={{ flex: 1 }}>{dayStart(d).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</b><span className="s">{js.length}</span></div>
          {js.length ? js.map((j) => <button key={j.id} className="wjob" style={{ ['--cc' as any]: catOf(cats, j.category).c }} onClick={() => nav(`/job/${j.id}`)}><b>{hm(j.starts_at)}</b> · {catOf(cats, j.category).n}<br />{j.customers?.name}<br /><span className="s">{crewOf(j).map(name).join(', ') || 'Needs a tech'}</span></button>) : <span className="s" style={{ fontSize: 13 }}>Open</span>}
          {mgr && <button className="btn sm ghost" onClick={() => book(d)}>+ Add</button>}</div>; })}</div></div>
        : <div className="tscroll"><div className="month">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => <div key={d} className="mhd">{d}</div>)}
          {[...Array(42)].map((_, i) => { const d = addDays(gridStart, i), js = on(d), inM = dayStart(d).getMonth() === b.getMonth();
            return <button key={d} className={`mday ${inM ? '' : 'out'} ${d === today() ? 'today' : ''}`} onClick={() => setPick(d)} aria-label={`${dayLabel(d, true)}, ${js.length} jobs`}>
              <span className="dn"><b>{dayStart(d).getDate()}</b>{js.length ? <span className="s" style={{ fontSize: 12 }}>{js.length}</span> : null}</span>
              {js.slice(0, 3).map((j) => <span key={j.id} className="mjob" style={{ ['--cc' as any]: catOf(cats, j.category).c }}>{hm(j.starts_at).replace(':00', '')} {j.customers?.name}</span>)}
              {js.length > 3 && <span className="s" style={{ fontSize: 12 }}>+{js.length - 3} more</span>}</button>; })}</div></div>}

      {pick && <Modal title={dayLabel(pick, true)} onClose={() => setPick(null)} onSave={mgr ? () => book(pick) : undefined} saveLabel="+ Book this day">
        {on(pick).length ? on(pick).map((j) => <button key={j.id} className="alert" onClick={() => nav(`/job/${j.id}`)}><span className="dot" style={{ background: catOf(cats, j.category).c }} />
          <span style={{ flex: 1 }}><b>{hm(j.starts_at)}–{hm(j.ends_at)}</b> · {j.customers?.name}<br /><span className="s">{catOf(cats, j.category).n} · {label(j)} · {crewOf(j).map(name).join(', ') || 'Needs a tech'}</span></span></button>)
          : <div className="empty">Nothing booked this day.</div>}
        <button className="btn" onClick={() => { setBase(pick); setV('week'); setPick(null); }}>Open that week</button>
      </Modal>}
    </>
  );
}
