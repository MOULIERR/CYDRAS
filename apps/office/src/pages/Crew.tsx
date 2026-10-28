// Crew, like the mockup: each person's status today, then their open and closed jobs.
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { Avatar, CatTag, PageH, StatusPill, catsOf, dayKey, dayLabel, hm, today, useCompany } from '../ui';

const ROLE: Record<string, string> = { owner: 'Owner', supervisor: 'Supervisor', tech: 'Tech', apprentice: 'Apprentice' };

export function Crew() {
  const { member } = useSession();
  const c = member!.company_id;
  const nav = useNavigate();
  const { data } = useLive(async () => {
    const from = new Date(today() + 'T00:00:00'), to = new Date(from.getTime() + 86400000);
    const people = check(await supabase.from('members').select('id, name, role, phone').eq('company_id', c).eq('active', true).order('name')) as any[];
    const jobs = check(await supabase.from('jobs').select('id, status, starts_at, customers(name), job_assignments(member_id, deleted_at)').eq('company_id', c).gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).is('deleted_at', null).neq('status', 'canceled').order('starts_at')) as any[];
    const open = check(await supabase.from('time_entries').select('member_id, clock_in').eq('company_id', c).is('clock_out', null).is('deleted_at', null)) as any[];
    return { people, jobs, open };
  }, ['members', 'jobs', 'job_assignments', 'time_entries'], c, [c]);
  const mine = (id: string) => (data?.jobs ?? []).filter((j) => (j.job_assignments ?? []).some((a: any) => !a.deleted_at && a.member_id === id));
  return (
    <>
      <PageH eyebrow="Crew" title="Your team today" />
      <div className="grid g2">{(data?.people ?? []).map((p, i) => { const js = mine(p.id), live = js.find((j) => j.status === 'on_site' || j.status === 'on_the_way'), on = data!.open.find((o) => o.member_id === p.id);
        return <div key={p.id} className="card" role="button" tabIndex={0} style={{ cursor: 'pointer' }} onClick={() => nav(`/crew/${p.id}`)} onKeyDown={(e) => e.key === 'Enter' && nav(`/crew/${p.id}`)}>
          <div className="row"><Avatar name={p.name} i={i} /><div style={{ flex: 1 }}><b>{p.name}</b><br /><span className="s">{ROLE[p.role]}</span></div>{on ? <span className="pill p-done">Clocked in {hm(on.clock_in)}</span> : <span className="pill p-sched">Not clocked in</span>}</div>
          <span className="s">{live ? `${live.status === 'on_site' ? 'On site' : 'On the way'} · ${live.customers?.name}` : js.length ? `Next: ${hm(js[0].starts_at)} · ${js[0].customers?.name}` : 'Nothing booked today'} · {js.length} job{js.length === 1 ? '' : 's'} today</span>
        </div>; })}</div>
    </>
  );
}

export function Person() {
  const { id = '' } = useParams();
  const { member } = useSession();
  const c = member!.company_id;
  const nav = useNavigate();
  const cats = catsOf(useCompany(c));
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const { data } = useLive(async () => {
    const p = check(await supabase.from('members').select('id, name, role, phone, email').eq('id', id).single()) as any;
    const asg = check(await supabase.from('job_assignments').select('job_id, jobs(id, number, type, category, status, starts_at, parent_job_id, visit_number, customers(name))').eq('member_id', id).is('deleted_at', null)) as any[];
    return { p, jobs: asg.map((a) => a.jobs).filter(Boolean).sort((a: any, b: any) => b.starts_at.localeCompare(a.starts_at)) };
  }, ['job_assignments', 'jobs'], c, [c, id]);
  if (!data) return <div className="s">Loading…</div>;
  const open = data.jobs.filter((j: any) => !['done', 'canceled', 'no_show'].includes(j.status)).reverse(), closed = data.jobs.filter((j: any) => j.status === 'done');
  const list = tab === 'open' ? open : closed;
  return (
    <>
      <div className="pageh"><div><button className="lnk" onClick={() => nav(-1)} style={{ marginBottom: 6 }}>← Back</button><p className="eyebrow">{ROLE[data.p.role]}</p><h1>{data.p.name}</h1></div>
        <div className="row wrap">{data.p.phone && <span className="mono">{data.p.phone}</span>}</div></div>
      <div className="seg" role="group">{([['open', `Open · ${open.length}`], ['closed', `Closed · ${closed.length}`]] as const).map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="card"><div className="tscroll"><table className="tbl"><tbody>{list.map((j: any) => <tr key={j.id} className="click" onClick={() => nav(`/job/${j.id}`)}>
        <td>{dayLabel(dayKey(new Date(j.starts_at)))} · {hm(j.starts_at)}</td><td><b>{j.customers?.name}</b><br /><span className="s">{j.type}{j.parent_job_id ? ` · Visit ${j.visit_number}` : ''}</span></td><td><CatTag cats={cats} name={j.category} /></td><td><StatusPill s={j.status} /></td></tr>)}
        {!list.length && <tr><td><div className="empty">{tab === 'open' ? 'No open jobs.' : 'No finished jobs yet.'}</div></td></tr>}</tbody></table></div></div>
    </>
  );
}
