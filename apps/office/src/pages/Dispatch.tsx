// Dispatch board, same as the mockup: one row per person, 6 AM to 5 PM, drag a job to another person or time.
// It snaps every 5 minutes and shows the exact time while you drag. On a phone, press and hold first.
import { useEffect, useRef, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase, check } from '../supabase';
import { useSession, isManager } from '../session';
import { useLive } from '../live';
import { Avatar, PageH, addDays, catOf, catsOf, dayKey, dayLabel, dayStart, hm, today, useCompany } from '../ui';

const START = 360, END = 1020, COLS = (END - START) / 5; // 6:00 AM – 5:00 PM in 5-minute columns
const minOf = (iso: string) => { const d = new Date(iso); return d.getHours() * 60 + d.getMinutes(); };
const fmtMin = (m: number) => { const h = Math.floor(m / 60), mm = m % 60; return `${h % 12 || 12}:${String(mm).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`; };

export function Dispatch() {
  const { member } = useSession();
  const c = member!.company_id, mgr = isManager(member);
  const nav = useNavigate();
  const cats = catsOf(useCompany(c));
  const [day, setDay] = useState(today());
  const [view, setView] = useState<'day' | 'two'>(() => { try { return localStorage.getItem('cyd_dv') === 'two' ? 'two' : 'day'; } catch { return 'day'; } });
  const [wk, setWk] = useState(today()); // first day of the 2-week view
  const pickView = (v: 'day' | 'two') => { setView(v); try { localStorage.setItem('cyd_dv', v); } catch { /* ignore */ } };
  const [msg, setMsg] = useState('');
  const { data, reload } = useLive(async () => {
    const from = dayStart(view === 'two' ? wk : day), to = dayStart(addDays(view === 'two' ? wk : day, view === 'two' ? 14 : 1));
    const jobs = check(await supabase.from('jobs').select('id, type, category, status, starts_at, ends_at, parent_job_id, visit_number, customers(name), job_assignments(member_id, deleted_at)')
      .eq('company_id', c).gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).is('deleted_at', null).neq('status', 'canceled').order('starts_at')) as any[];
    const people = check(await supabase.from('members').select('id, name, role').eq('company_id', c).eq('active', true).order('name')) as any[];
    return { jobs, people };
  }, ['jobs', 'job_assignments'], c, [c, day, view, wk]);

  const crewOf = (j: any): string[] => (j.job_assignments ?? []).filter((a: any) => !a.deleted_at).map((a: any) => a.member_id);
  const col = (m: number) => 2 + Math.max(0, Math.min(COLS - 1, Math.round((m - START) / 5)));

  async function move(jobId: string, from: string, to: string, newStart: number | null, newDay?: string) {
    const j = data!.jobs.find((x) => x.id === jobId); if (!j) return;
    const len = (new Date(j.ends_at).getTime() - new Date(j.starts_at).getTime()) / 60000;
    if (newDay) newStart = minOf(j.starts_at);
    try {
      if (newStart != null) {
        const s = dayStart(newDay ?? day); s.setMinutes(newStart);
        check(await supabase.from('jobs').update({ starts_at: s.toISOString(), ends_at: new Date(s.getTime() + len * 60000).toISOString() }).eq('id', jobId));
      }
      if (from !== to) {
        if (from !== '_un') check(await supabase.from('job_assignments').update({ deleted_at: new Date().toISOString() }).eq('job_id', jobId).eq('member_id', from));
        if (to === '_un') { for (const m of crewOf(j)) check(await supabase.from('job_assignments').update({ deleted_at: new Date().toISOString() }).eq('job_id', jobId).eq('member_id', m)); }
        else check(await supabase.from('job_assignments').upsert({ job_id: jobId, member_id: to, company_id: c, deleted_at: null }));
      }
      setMsg(newDay ? `Moved to ${dayLabel(newDay)} at ${fmtMin(newStart!)}` : newStart != null ? `Moved to ${fmtMin(newStart)}` : 'Updated'); reload();
    } catch (e) { setMsg((e as Error).message); }
  }

  // Drag: mouse and pen right away, touch after press-and-hold (same as the mockup).
  const board = useRef<HTMLDivElement>(null);
  const moveRef = useRef(move); moveRef.current = move;
  useEffect(() => {
    if (!mgr) return;
    const DR: any = {}; let justEnded = 0;
    const target = (x: number, y: number) => { for (const el of document.elementsFromPoint(x, y)) { if ((el as HTMLElement).classList.contains('dragghost')) continue; const t = (el as HTMLElement).closest('[data-droptype]'); if (t) return t as HTMLElement; } return null; };
    const minAt = (x: number) => { const db = board.current; if (!db) return null; const r = db.getBoundingClientRect(), w = r.width - 150; const m = START + ((x - DR.dx - r.left - 150) / w) * (END - START); return Math.max(START, Math.min(END - 5, Math.round(m / 5) * 5)); };
    const start = () => { const r = DR.src.getBoundingClientRect(); DR.on = true; DR.dx = DR.x0 - r.left; DR.dy = DR.y0 - r.top; const g = DR.src.cloneNode(true); g.className += ' dragghost'; g.removeAttribute('data-drag'); g.style.width = Math.min(240, r.width) + 'px'; g.style.height = r.height + 'px'; g.style.left = (DR.x0 - DR.dx) + 'px'; g.style.top = (DR.y0 - DR.dy) + 'px'; document.body.appendChild(g); DR.g = g; DR.src.classList.add('dragsrc'); navigator.vibrate?.(15); };
    const mv = (x: number, y: number) => { DR.g.style.left = (x - DR.dx) + 'px'; DR.g.style.top = (y - DR.dy) + 'px'; const t = target(x, y); if (t !== DR.t) { DR.t?.classList.remove('dropon'); DR.t = t; t?.classList.add('dropon'); }
      if (t && t.dataset.droptype === 'cell') { DR.min = null; if (!DR.tag) { DR.tag = document.createElement('span'); DR.tag.className = 'dragtime'; DR.g.appendChild(DR.tag); } DR.tag.textContent = dayLabel(t.dataset.day!); }
      else if (t) { DR.min = minAt(x); if (!DR.tag) { DR.tag = document.createElement('span'); DR.tag.className = 'dragtime'; DR.g.appendChild(DR.tag); } DR.tag.textContent = fmtMin(DR.min); } else if (DR.tag) { DR.tag.textContent = ''; DR.min = null; }
      const sc = DR.src.closest('.tscroll'); if (sc) { const b = sc.getBoundingClientRect(); if (x < b.left + 60) sc.scrollLeft -= 14; else if (x > b.right - 60) sc.scrollLeft += 14; } };
    const end = (drop: boolean) => { clearTimeout(DR.lp); if (DR.on) { DR.g?.remove(); DR.src.classList.remove('dragsrc'); DR.t?.classList.remove('dropon'); justEnded = Date.now(); if (drop && DR.t) moveRef.current(DR.src.dataset.drag, DR.src.dataset.from, DR.t.dataset.drop, DR.min, DR.t.dataset.day); } Object.keys(DR).forEach((k) => delete DR[k]); };
    const down = (e: PointerEvent) => { if (e.button > 0) return; const src = (e.target as HTMLElement).closest('[data-drag]') as HTMLElement; if (!src) return; DR.src = src; DR.x0 = e.clientX; DR.y0 = e.clientY; DR.type = e.pointerType; if (e.pointerType === 'touch') DR.lp = setTimeout(() => DR.src && start(), 380); };
    const pm = (e: PointerEvent) => { if (!DR.src) return; if (DR.on) { e.preventDefault(); mv(e.clientX, e.clientY); return; } const d = Math.hypot(e.clientX - DR.x0, e.clientY - DR.y0); if (DR.type === 'touch') { if (d > 10) end(false); return; } if (d > 6) { start(); mv(e.clientX, e.clientY); } };
    const tm = (e: TouchEvent) => { if (DR.on) e.preventDefault(); };
    const up = () => DR.src && end(true), cancel = () => DR.src && end(false);
    const clk = (e: MouseEvent) => { if (Date.now() - justEnded < 350) { e.stopPropagation(); e.preventDefault(); } };
    document.addEventListener('pointerdown', down); document.addEventListener('pointermove', pm, { passive: false }); document.addEventListener('touchmove', tm, { passive: false });
    document.addEventListener('pointerup', up); document.addEventListener('pointercancel', cancel); document.addEventListener('click', clk, true);
    return () => { document.removeEventListener('pointerdown', down); document.removeEventListener('pointermove', pm); document.removeEventListener('touchmove', tm); document.removeEventListener('pointerup', up); document.removeEventListener('pointercancel', cancel); document.removeEventListener('click', clk, true); };
  }, [mgr, view]);

  const rows = [{ id: '_un', name: 'Needs a tech', role: '' }, ...(data?.people ?? [])];
  const nowCol = day === today() ? col(minOf(new Date().toISOString())) : null;
  const cells: React.ReactNode[] = [<div key="corner" className="dbt" />];
  for (let i = 0; i < 22; i += 2) { const m = START + i * 30; cells.push(<div key={'h' + i} className={`dbh ${nowCol && nowCol >= 2 + i * 6 && nowCol < 2 + (i + 2) * 6 ? 'now' : ''}`} style={{ gridColumn: `${2 + i * 6}/span 12`, gridRow: 1 }}>{fmtMin(m).replace(':00', '')}</div>); }
  rows.forEach((r, ri) => {
    const gr = ri + 2, mine = (data?.jobs ?? []).filter((j) => (r.id === '_un' ? !crewOf(j).length : crewOf(j).includes(r.id)));
    cells.push(<div key={'t' + r.id} className="dbt" style={{ gridRow: gr, gridColumn: 1, alignSelf: 'start' }}>{r.id === '_un' ? <span className="pill p-warn">Needs a tech</span> : <><Avatar name={r.name} i={ri} /><div><b>{r.name}</b><br /><span className="s">{mine.length} job{mine.length === 1 ? '' : 's'}</span></div></>}</div>);
    for (let i = 0; i < 22; i++) cells.push(<div key={`s${r.id}${i}`} className="slot" style={{ gridRow: gr, gridColumn: `${2 + i * 6}/span 6` }} data-drop={r.id} data-droptype="slot" />);
    const lanes: number[] = [];
    mine.forEach((j) => {
      const a = col(minOf(j.starts_at)), b = Math.max(a + 1, col(minOf(j.ends_at)));
      let L = lanes.findIndex((e) => e <= a); if (L < 0) { L = lanes.length; lanes.push(0); } lanes[L] = b;
      const ct = catOf(cats, j.category);
      cells.push(<button key={`b${r.id}${j.id}`} className={`blk ${r.id === '_un' ? 'un' : ''}`} data-drag={mgr ? j.id : undefined} data-from={r.id} onClick={() => nav(`/job/${j.id}`)}
        style={{ gridRow: gr, gridColumn: `${a}/${b}`, ['--cc' as any]: ct.c, marginTop: L * 58 }} title={`${j.customers?.name} · ${hm(j.starts_at)}–${hm(j.ends_at)}`}>
        <b>{j.customers?.name}</b>{ct.n}{j.parent_job_id ? ` · Visit ${j.visit_number}` : ''} · {hm(j.starts_at)}</button>);
    });
  });

  return (
    <>
      <PageH eyebrow="Dispatch board" title={view === 'two' ? `${dayLabel(wk)} – ${dayLabel(addDays(wk, 13))}` : dayLabel(day, true)} right={<>
        <div className="seg" role="group" aria-label="View"><button aria-pressed={view === 'day'} onClick={() => pickView('day')}>Day</button><button aria-pressed={view === 'two'} onClick={() => pickView('two')}>2 weeks</button></div>
        {view === 'two' ? <><button className="btn sm" onClick={() => setWk(addDays(wk, -14))} aria-label="Earlier 2 weeks">‹</button><button className="btn sm" onClick={() => setWk(today())}>This week</button><button className="btn sm" onClick={() => setWk(addDays(wk, 14))} aria-label="Next 2 weeks">›</button></> : <>
        <div className="seg" role="group" aria-label="Day">{[-1, 0, 1, 2].map((n) => { const x = addDays(today(), n); return <button key={n} aria-pressed={x === day} onClick={() => setDay(x)}>{n === 0 ? 'Today' : dayStart(x).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' })}</button>; })}</div>
        <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} style={{ width: 'auto' }} aria-label="Pick a day" /></>}
        {mgr && <Link className="btn pri" to="/jobs?new=1">+ New appointment</Link>}</>} />
      <div className="card">
        <div className="row wrap s" style={{ fontSize: 13.5 }}><span>{mgr ? (view === 'two' ? 'Drag a job to another person or day to move it. It keeps the same time. Click a day to open that day. Click a job to open it.' : 'Drag a job to another person or time to move it. It snaps every 5 minutes and shows the exact time while you drag (on a phone or tablet, press and hold first). Click a job to open it.') : 'Click a job to open it.'}</span><span style={{ flex: 1 }} />
          {cats.map((x) => <span key={x.id} className="ctag" style={{ ['--cc' as any]: x.c }}>{x.n}</span>)}</div>
        {msg && <div className="s" role="status" style={{ fontWeight: 700 }}>{msg}</div>}
        {view === 'two' ? <TwoWeeks start={wk} rows={rows} jobs={data?.jobs ?? []} crewOf={crewOf} cats={cats} mgr={mgr} onDay={(d) => { setDay(d); pickView('day'); }} onJob={(id) => nav(`/job/${id}`)} />
          : <div className="tscroll"><div className="db" ref={board} style={{ gridTemplateColumns: `150px repeat(${COLS},minmax(0,1fr))` }}>{cells}</div></div>}
      </div>
    </>
  );
}

/** Two weeks at a glance: one row per person, one column per day. Drag a job to another person or day. */
function TwoWeeks({ start, rows, jobs, crewOf, cats, mgr, onDay, onJob }: { start: string; rows: any[]; jobs: any[]; crewOf: (j: any) => string[]; cats: any; mgr: boolean; onDay: (d: string) => void; onJob: (id: string) => void }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(start, i));
  const t = today();
  return <div className="tscroll"><div className="tw" style={{ gridTemplateColumns: `150px repeat(14, minmax(96px, 1fr))` }}>
    <div className="dbt" />
    {days.map((d) => { const n = jobs.filter((j) => dayKey(new Date(j.starts_at)) === d).length; const wd = dayStart(d).getDay(); return <button key={d} className={`twh${d === t ? ' now' : ''}${wd === 0 || wd === 6 ? ' we' : ''}`} onClick={() => onDay(d)} title="Open this day">
      <b>{dayStart(d).toLocaleDateString('en-US', { weekday: 'short' })}</b> {dayStart(d).getDate()}<br /><span className="s">{n} job{n === 1 ? '' : 's'}</span></button>; })}
    {rows.map((r, ri) => <div key={r.id} style={{ display: 'contents' }}>
      <div className="dbt">{r.id === '_un' ? <span className="pill p-warn">Needs a tech</span> : <><Avatar name={r.name} i={ri} /><b>{r.name}</b></>}</div>
      {days.map((d) => { const mine = jobs.filter((j) => dayKey(new Date(j.starts_at)) === d && (r.id === '_un' ? !crewOf(j).length : crewOf(j).includes(r.id)));
        return <div key={d} className={`twc${d === t ? ' now' : ''}`} data-drop={r.id} data-day={d} data-droptype={mgr ? 'cell' : undefined}>
          {mine.map((j) => { const ct = catOf(cats, j.category); return <button key={j.id} className={`blk tj${r.id === '_un' ? ' un' : ''}`} data-drag={mgr ? j.id : undefined} data-from={r.id} onClick={() => onJob(j.id)} style={{ ['--cc' as any]: ct.c }} title={`${j.customers?.name} · ${hm(j.starts_at)}–${hm(j.ends_at)}`}>
            <b>{hm(j.starts_at)}</b>{j.customers?.name}</button>; })}</div>; })}
    </div>)}
  </div></div>;
}
