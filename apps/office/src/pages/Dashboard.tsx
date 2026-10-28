// What needs you today, who is clocked in, and where they are. Updates live.
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { hm, workedMinutes } from '@cydras/core';

const dayRange = () => { const s = new Date(); s.setHours(0, 0, 0, 0); return [s.toISOString(), new Date(s.getTime() + 86400000).toISOString()]; };
const t = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });

export function Dashboard() {
  const { member } = useSession();
  const c = member!.company_id;
  const { data, error } = useLive(async () => {
    const [from, to] = dayRange();
    const jobs = check(await supabase.from('jobs').select('id, number, type, category, status, starts_at, ends_at, customers(name), job_assignments(member_id, deleted_at)').eq('company_id', c).gte('starts_at', from).lt('starts_at', to).is('deleted_at', null).order('starts_at')) as any[];
    const members = check(await supabase.from('members').select('id, name, role').eq('company_id', c).eq('active', true)) as any[];
    const open = check(await supabase.from('time_entries').select('member_id, clock_in, clock_out, break_minutes, on_break_since').eq('company_id', c).is('clock_out', null).is('deleted_at', null)) as any[];
    const pings = check(await supabase.from('location_pings').select('member_id, at, lat, lng').eq('company_id', c).gte('at', from).order('at', { ascending: false }).limit(200)) as any[];
    return { jobs, members, open, pings };
  }, ['jobs', 'job_assignments', 'time_entries', 'location_pings'], c, [c]);

  if (error) return <div className="err">{error}</div>;
  if (!data) return <div className="muted">Loading…</div>;
  const name = (id: string) => data.members.find((m) => m.id === id)?.name ?? '';
  const needs = data.jobs.filter((j) => !(j.job_assignments ?? []).some((a: any) => !a.deleted_at) && j.status === 'scheduled');
  const lastPing = (id: string) => data.pings.find((p) => p.member_id === id);
  return (
    <>
      <div className="pageh"><div><p className="eyebrow">Dashboard</p><h1>Today</h1></div></div>
      <div className="grid">
        <div className="card kpi"><span className="muted">Jobs today</span><b>{data.jobs.length}</b><span className="muted">{data.jobs.filter((j) => j.status === 'done').length} done</span></div>
        <div className="card kpi"><span className="muted">Needs a tech</span><b style={{ color: needs.length ? 'var(--bad)' : undefined }}>{needs.length}</b></div>
        <div className="card kpi"><span className="muted">Clocked in now</span><b>{data.open.length}</b><span className="muted">{data.open.map((o) => name(o.member_id)).join(', ') || 'Nobody yet'}</span></div>
      </div>
      <div className="card">
        <h2>Crew right now</h2>
        <div className="tscroll"><table><thead><tr><th>Person</th><th>Clocked in</th><th>Worked</th><th>Last seen</th></tr></thead><tbody>
          {data.open.map((o) => { const p = lastPing(o.member_id); return (
            <tr key={o.member_id}><td><b>{name(o.member_id)}</b></td><td>{t(o.clock_in)}{o.on_break_since ? ' · on break' : ''}</td><td>{hm(workedMinutes(o))}</td>
              <td>{p ? <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${p.lat},${p.lng}`}>{t(p.at)} · map</a> : <span className="muted">No location yet</span>}</td></tr>); })}
          {!data.open.length && <tr><td colSpan={4} className="muted">Nobody is clocked in.</td></tr>}
        </tbody></table></div>
        <span className="muted">Location is only shared while someone is clocked in.</span>
      </div>
      <div className="card">
        <h2>Today's jobs</h2>
        <div className="tscroll"><table><thead><tr><th>Time</th><th>Customer</th><th>Work</th><th>Crew</th><th>Status</th></tr></thead><tbody>
          {data.jobs.map((j) => (
            <tr key={j.id}><td>{t(j.starts_at)}–{t(j.ends_at)}</td><td><b>{j.customers?.name}</b><br /><span className="muted">#{j.number}</span></td><td>{j.category ?? j.type}</td>
              <td>{(j.job_assignments ?? []).filter((a: any) => !a.deleted_at).map((a: any) => name(a.member_id)).join(', ') || <span className="pill bad">Needs a tech</span>}</td>
              <td><span className={`pill ${j.status === 'done' ? 'ok' : j.status === 'scheduled' ? '' : 'go'}`}>{j.status.replace(/_/g, ' ')}</span></td></tr>
          ))}
          {!data.jobs.length && <tr><td colSpan={5} className="muted">No jobs today.</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
