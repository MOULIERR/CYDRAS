// Dashboard, same layout as the mockup: numbers on top, then what needs you, today's jobs, and the crew.
import { useNavigate, Link } from 'react-router-dom';
import { supabase, check } from '../supabase';
import { useSession, isManager } from '../session';
import { useLive } from '../live';
import { Avatar, CatTag, PageH, StatusPill, catsOf, dayLabel, hm, money, money0, paidOn, today, useCompany } from '../ui';

export function Dashboard() {
  const { member } = useSession();
  const c = member!.company_id, owner = member!.role === 'owner', mgr = isManager(member);
  const nav = useNavigate();
  const company = useCompany(c);
  const cats = catsOf(company);
  const { data, error, reload } = useLive(async () => {
    const t = today(), from = new Date(t + 'T00:00:00'), to = new Date(from.getTime() + 86400000);
    const yr = new Date(from.getFullYear(), 0, 1);
    const ly0 = new Date(from.getFullYear() - 1, 0, 1), ly1 = new Date(from.getFullYear() - 1, from.getMonth(), from.getDate() + 1);
    const jobs = check(await supabase.from('jobs').select('id, number, type, category, status, starts_at, ends_at, parent_job_id, visit_number, customers(name), job_assignments(member_id, deleted_at)')
      .eq('company_id', c).gte('starts_at', from.toISOString()).lt('starts_at', to.toISOString()).is('deleted_at', null).neq('status', 'canceled').order('starts_at')) as any[];
    const people = check(await supabase.from('members').select('id, name, role').eq('company_id', c).eq('active', true).order('name')) as any[];
    const open = check(await supabase.from('time_entries').select('member_id, clock_in').eq('company_id', c).is('clock_out', null).is('deleted_at', null)) as any[];
    const invs = check(await supabase.from('invoices').select('id, job_id, total, issued_at, status, payments(amount, refunded_amount, voided_at, status)').eq('company_id', c).is('deleted_at', null).neq('status', 'void')) as any[];
    const msgs = check(await supabase.from('messages').select('id, body, direction, created_at, customer_id, customers(name)').eq('company_id', c).order('created_at', { ascending: false }).limit(5)) as any[];
    let paidToday = 0, ytd = 0, lytd = 0, paidCount = 0;
    if (owner) {
      const pays = check(await supabase.from('payments').select('amount, refunded_amount, voided_at, status, taken_at').eq('company_id', c).gte('taken_at', ly0.toISOString())) as any[];
      for (const p of pays) {
        if (p.status !== 'succeeded' || p.voided_at) continue;
        const v = Number(p.amount) - Number(p.refunded_amount ?? 0), d = new Date(p.taken_at);
        if (d >= from) { paidToday += v; paidCount++; }
        if (d >= yr) ytd += v; else if (d < ly1) lytd += v;
      }
    }
    return { jobs, people, open, invs, msgs, paidToday, paidCount, ytd, lytd };
  }, ['jobs', 'job_assignments', 'time_entries', 'invoices', 'payments', 'messages'], c, [c, owner]);

  if (error) return <div className="err">{error}</div>;
  if (!data) return <div className="s">Loading…</div>;
  const crewOf = (j: any) => (j.job_assignments ?? []).filter((a: any) => !a.deleted_at).map((a: any) => a.member_id);
  const name = (id: string) => data.people.find((p) => p.id === id)?.name ?? '';
  const un = data.jobs.filter((j) => !crewOf(j).length && j.status === 'scheduled');
  const owedOf = (i: any) => Math.max(0, Number(i.total) - paidOn(i.payments ?? []));
  const owed = data.invs.reduce((a, i) => a + owedOf(i), 0);
  const overdue = data.invs.filter((i) => owedOf(i) > 0.004 && Date.now() - new Date(i.issued_at).getTime() > 30 * 86400000).length;
  const invOf = (jobId: string) => data.invs.find((i) => i.job_id === jobId);
  const techs = data.people.filter((p) => p.role !== 'owner');
  const first = member!.name.split(' ')[0];
  const hr = new Date().getHours();

  async function assign(jobId: string, memberId: string) {
    check(await supabase.from('job_assignments').upsert({ job_id: jobId, member_id: memberId, company_id: c, deleted_at: null }));
    reload();
  }
  const go = (id: string) => nav(`/job/${id}`);

  return (
    <>
      <PageH eyebrow={dayLabel(today(), true)} title={`Good ${hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening'}, ${first}`}
        right={mgr && <Link className="btn" to="/dispatch">Open dispatch board</Link>} />
      <div className="grid g4">
        {owner
          ? <div className="card kpi"><span className="eyebrow">Collected today</span><b>{money(data.paidToday)}</b><span className="s">{data.paidCount} payment{data.paidCount === 1 ? '' : 's'}</span></div>
          : <div className="card kpi"><span className="eyebrow">Jobs today</span><b>{data.jobs.length}</b><span className="s">{data.jobs.filter((j) => j.status === 'done').length} done so far</span></div>}
        <div className="card kpi"><span className="eyebrow">Needs a tech</span><b style={{ color: un.length ? 'var(--bad)' : undefined }}>{un.length}</b><span className="s">{un.length ? "Assign before they're late" : 'Everyone is covered'}</span></div>
        <div className="card kpi"><span className="eyebrow">Unpaid invoices</span><b>{money0(owed)}</b><span className="s">{overdue} over 30 days</span></div>
        {owner
          ? <div className="card kpi"><span className="eyebrow">This year vs last</span><b>{money0(data.ytd)}</b><span className="s" style={{ color: data.ytd >= data.lytd ? 'var(--ok)' : 'var(--bad)' }}>{data.lytd ? `${data.ytd >= data.lytd ? '▲' : '▼'} ${Math.abs((data.ytd - data.lytd) / data.lytd * 100).toFixed(1)}%` : 'First year in Cydras'}</span></div>
          : <div className="card kpi"><span className="eyebrow">Clocked in now</span><b>{data.open.length}</b><span className="s">{data.open.map((o) => name(o.member_id).split(' ')[0]).join(', ') || 'Nobody yet'}</span></div>}
      </div>
      <div className="cols"><div className="colA">
        {un.length > 0 && <div className="card" style={{ borderColor: 'var(--accent)' }}>
          <div className="cardh"><h2>Needs a tech</h2><span className="s">Pick someone to send</span></div>
          {un.map((j) => <div className="prow" key={j.id}><div className="t"><div className="row wrap"><CatTag cats={cats} name={j.category} /><b>{j.customers?.name}</b></div><span className="s">{hm(j.starts_at)}–{hm(j.ends_at)} · {j.type}{j.parent_job_id ? ` · Visit ${j.visit_number}` : ''}</span></div>
            {mgr && <div className="row wrap">{techs.slice(0, 4).map((t) => <button key={t.id} className="btn sm" onClick={() => assign(j.id, t.id)}>{t.name.split(' ')[0]}</button>)}</div>}</div>)}
        </div>}
        <div className="card"><div className="cardh"><h2>Today's jobs</h2><Link className="btn sm" to="/jobs">All jobs</Link></div>
          <div className="tscroll"><table className="tbl"><thead><tr><th>Time</th><th>Customer</th><th>Category</th><th>Crew</th><th>Status</th>{owner && <th className="r">Invoice</th>}</tr></thead><tbody>
            {data.jobs.map((j) => <tr key={j.id} className="click" onClick={() => go(j.id)}><td className="mono">{hm(j.starts_at)}</td>
              <td><b>{j.customers?.name}</b><br /><span className="s">{j.type}{j.parent_job_id ? ` · Visit ${j.visit_number}` : ''}</span></td><td><CatTag cats={cats} name={j.category} /></td>
              <td><div className="row" style={{ gap: 4 }}>{crewOf(j).length ? crewOf(j).map((m: string, i: number) => <Avatar key={m} name={name(m)} i={data.people.findIndex((p) => p.id === m) + i * 0} />) : <span className="pill p-warn">Needs a tech</span>}</div></td>
              <td><StatusPill s={j.status} /></td>{owner && <td className="r mono">{invOf(j.id) ? money(Number(invOf(j.id).total)) : '—'}</td>}</tr>)}
            {!data.jobs.length && <tr><td colSpan={6}><div className="empty">No jobs today. Tap <b>+ New appointment</b> to book one.</div></td></tr>}
          </tbody></table></div></div>
        <div className="card"><div className="cardh"><h2>Where's the crew</h2></div>
          {techs.length ? techs.map((p, i) => { const js = data.jobs.filter((j) => crewOf(j).includes(p.id)); const live = js.find((j) => j.status === 'on_site' || j.status === 'on_the_way'); const on = data.open.find((o) => o.member_id === p.id);
            return <div className="prow" key={p.id}><Avatar name={p.name} i={i + 1} /><div className="t"><b>{p.name}</b> <span className="s">· {p.role}{on ? ` · clocked in ${hm(on.clock_in)}` : ''}</span><br />
              <span className="s">{live ? `${live.status === 'on_site' ? 'On site' : 'On the way'} · ${live.customers?.name}` : js.length ? `Next: ${hm(js[0].starts_at)} · ${js[0].customers?.name}` : 'Nothing booked today'}</span></div><span className="s">{js.length} job{js.length === 1 ? '' : 's'}</span></div>; })
            : <div className="empty">No techs yet. Add your crew in <Link to="/team">Team & permissions</Link>.</div>}
        </div>
      </div><div className="colB">
        <div className="card"><div className="cardh"><h3>Messages</h3><Link className="btn sm" to="/inbox">Inbox</Link></div>
          {data.msgs.length ? data.msgs.map((m) => <div className="alert" key={m.id}><span className="dot" style={{ background: m.direction === 'in' ? 'var(--accent)' : 'var(--line)' }} /><span style={{ flex: 1 }}><b>{m.customers?.name ?? 'Customer'}</b><br /><span className="s">{m.body}</span></span></div>)
            : <div className="empty">No texts yet. Customer replies show up here.</div>}
        </div>
        <div className="card"><div className="cardh"><h3>Clocked in</h3>{mgr && <Link className="btn sm" to="/timesheets">Timesheets</Link>}</div>
          {data.open.length ? data.open.map((o) => <div className="prow" key={o.member_id}><span className="dot" style={{ background: 'var(--ok)' }} /><span className="t"><b>{name(o.member_id)}</b><br /><span className="s">Since {hm(o.clock_in)}</span></span></div>)
            : <div className="empty">Nobody is clocked in.</div>}
          <span className="s" style={{ fontSize: 13 }}>Location is only shared while someone is clocked in.</span>
        </div>
      </div></div>
    </>
  );
}
