// Book jobs and assign techs. The tech gets a push notification when they're put on a job.
import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, check } from '../supabase';
import { useSession, isManager } from '../session';
import { useLive } from '../live';
import { catsOf, useCompany } from '../ui';

const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

export function Jobs() {
  const { member } = useSession();
  const c = member!.company_id;
  const cats = catsOf(useCompany(c));
  const [day, setDay] = useState(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; });
  const [err, setErr] = useState('');
  const { data, reload } = useLive(async () => {
    const to = new Date(day.getTime() + 7 * 86400000);
    const jobs = check(await supabase.from('jobs').select('id, number, type, category, status, starts_at, ends_at, customer_id, site_id, private_notes, parent_job_id, visit_number, visit_note, customers(name), job_assignments(member_id, deleted_at)')
      .eq('company_id', c).gte('starts_at', day.toISOString()).lt('starts_at', to.toISOString()).is('deleted_at', null).order('starts_at')) as any[];
    const customers = check(await supabase.from('customers').select('id, name').eq('company_id', c).is('deleted_at', null).order('name')) as any[];
    const techs = check(await supabase.from('members').select('id, name, role').eq('company_id', c).eq('active', true).order('name')) as any[];
    return { jobs, customers, techs };
  }, ['jobs', 'job_assignments', 'customers'], c, [c, day.getTime()]);

  const [f, setF] = useState(() => { const s = new Date(); s.setMinutes(0, 0, 0); s.setHours(s.getHours() + 1); return { customer: '', type: '', category: 'No cooling', start: local(s), end: local(new Date(s.getTime() + 7200000)), tech: '' }; });
  async function book(e: React.FormEvent) {
    e.preventDefault(); setErr('');
    try {
      const job = check(await supabase.from('jobs').insert({ company_id: c, customer_id: f.customer, type: f.type || f.category, category: f.category, starts_at: new Date(f.start).toISOString(), ends_at: new Date(f.end).toISOString() }).select('id').single()) as any;
      if (f.tech) check(await supabase.from('job_assignments').insert({ job_id: job.id, member_id: f.tech, company_id: c }));
      setF({ ...f, type: '', tech: '' }); reload();
    } catch (e) { setErr((e as Error).message); }
  }
  async function assign(jobId: string, memberId: string) {
    setErr('');
    try { check(await supabase.from('job_assignments').upsert({ job_id: jobId, member_id: memberId, company_id: c, deleted_at: null })); reload(); } catch (e) { setErr((e as Error).message); }
  }
  async function unassign(jobId: string, memberId: string) {
    try { check(await supabase.from('job_assignments').update({ deleted_at: new Date().toISOString() }).eq('job_id', jobId).eq('member_id', memberId)); reload(); } catch (e) { setErr((e as Error).message); }
  }
  const [open, setOpen] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);
  const [visitFor, setVisitFor] = useState<any | null>(null);
  const [vf, setVf] = useState({ start: '', end: '', note: '' });
  function openVisit(j: any) {
    const s0 = new Date(j.starts_at); s0.setDate(s0.getDate() + 1);
    setVisitFor(visitFor?.id === j.id ? null : j); setVf({ start: local(s0), end: local(new Date(s0.getTime() + (new Date(j.ends_at).getTime() - new Date(j.starts_at).getTime()))), note: '' });
  }
  async function addVisit(j: any) {
    setErr('');
    try {
      const rootId = j.parent_job_id ?? j.id;
      const { count } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).or(`id.eq.${rootId},parent_job_id.eq.${rootId}`);
      const v = check(await supabase.from('jobs').insert({ company_id: c, customer_id: j.customer_id, site_id: j.site_id, type: j.type, category: j.category,
        starts_at: new Date(vf.start).toISOString(), ends_at: new Date(vf.end).toISOString(), parent_job_id: rootId, visit_number: (count ?? 1) + 1, visit_note: vf.note.trim() || null }).select('id').single()) as any;
      const crew = (j.job_assignments ?? []).filter((a: any) => !a.deleted_at);
      if (crew.length) check(await supabase.from('job_assignments').insert(crew.map((a: any) => ({ job_id: v.id, member_id: a.member_id, company_id: c }))));
      setVisitFor(null); reload();
    } catch (e) { setErr((e as Error).message); }
  }
  function openNotes(j: any) { setOpen(open === j.id ? null : j.id); setDraft(j.private_notes?.length ? [...j.private_notes] : ['']); }
  async function saveNotes(jobId: string, list: string[]) {
    const clean = list.map((x) => x.trim()).filter(Boolean);
    try { check(await supabase.from('jobs').update({ private_notes: clean }).eq('id', jobId)); } catch (e) { setErr((e as Error).message); }
  }
  const mgr = isManager(member);
  const name = (id: string) => data?.techs.find((t) => t.id === id)?.name ?? '';
  return (
    <>
      <div className="pageh"><div><p className="eyebrow">Work</p><h1>Jobs & dispatch</h1></div></div>
      {mgr && data && (
        <form className="card" onSubmit={book}>
          <h2>Book a job</h2>
          <div className="grid">
            <label>Customer<select required value={f.customer} onChange={(e) => setF({ ...f, customer: e.target.value })}><option value="">Pick one…</option>{data.customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
            <label>Category<select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>{cats.map((x) => <option key={x.id}>{x.n}</option>)}</select></label>
            <label>What's wrong<input value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} placeholder="RTU-2 not cooling" /></label>
            <label>Arrive from<input type="datetime-local" step={300} value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} /></label>
            <label>Arrive by<input type="datetime-local" step={300} value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} /></label>
            <label>Tech<select value={f.tech} onChange={(e) => setF({ ...f, tech: e.target.value })}><option value="">Needs a tech</option>{data.techs.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
          </div>
          {err && <div className="err">{err}</div>}
          <div><button className="pri">Book job</button></div>
        </form>
      )}
      <div className="row">
        <button onClick={() => setDay(new Date(day.getTime() - 7 * 86400000))}>← Week</button>
        <button onClick={() => { const d = new Date(); d.setHours(0, 0, 0, 0); setDay(d); }}>This week</button>
        <button onClick={() => setDay(new Date(day.getTime() + 7 * 86400000))}>Week →</button>
      </div>
      <div className="card">
        <div className="tscroll"><table><thead><tr><th>When</th><th>Customer</th><th>Work</th><th>Crew</th><th>Status</th><th>Private notes</th></tr></thead><tbody>
          {(data?.jobs ?? []).map((j) => { const crew = (j.job_assignments ?? []).filter((a: any) => !a.deleted_at); return (
            <Fragment key={j.id}><tr>
              <td>{new Date(j.starts_at).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</td>
              <td><Link to={`/job/${j.id}`}><b>{j.customers?.name}</b></Link><br /><span className="muted">#{j.number}</span></td><td>{j.category ?? j.type}{j.parent_job_id ? <span className="pill"> Visit {j.visit_number}</span> : null}<br /><span className="muted">{j.visit_note ?? j.type}</span></td>
              <td>{crew.map((a: any) => <div key={a.member_id}>{name(a.member_id)} {mgr && <button className="danger" onClick={() => unassign(j.id, a.member_id)}>×</button>}</div>)}
                {mgr && <select value="" onChange={(e) => e.target.value && assign(j.id, e.target.value)} style={{ marginTop: 4 }}><option value="">+ Add tech</option>{data!.techs.filter((x) => !crew.some((a: any) => a.member_id === x.id)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</td>
              <td><span className={`pill ${j.status === 'done' ? 'ok' : j.status === 'scheduled' ? '' : 'go'}`}>{j.status.replace(/_/g, ' ')}</span></td>
              <td>{mgr && <button onClick={() => openVisit(j)} style={{ marginBottom: 4 }}>+ Visit</button>}<br /><button onClick={() => openNotes(j)}>🔒 {j.private_notes?.length ? `${j.private_notes.length} note${j.private_notes.length > 1 ? 's' : ''}` : 'Add'}</button></td>
            </tr>
            {visitFor?.id === j.id && <tr><td colSpan={6}>
              <b>Add another visit to this job</b> <span className="muted">Same customer, same invoice.</span>
              <div className="grid" style={{ marginTop: 8 }}>
                <label>Arrive from<input type="datetime-local" step={300} value={vf.start} onChange={(e) => setVf({ ...vf, start: e.target.value })} /></label>
                <label>Arrive by<input type="datetime-local" step={300} value={vf.end} onChange={(e) => setVf({ ...vf, end: e.target.value })} /></label>
                <label>What's this visit for?<input value={vf.note} placeholder="Install the new motor" onChange={(e) => setVf({ ...vf, note: e.target.value })} /></label>
              </div>
              <div className="row"><button className="pri" onClick={() => addVisit(j)}>Add visit</button><button onClick={() => setVisitFor(null)}>Cancel</button></div>
            </td></tr>}
            {open === j.id && <tr><td colSpan={6}>
              <div className="row" style={{ justifyContent: 'space-between' }}><b>Private notes · Team only</b>
                <button aria-label="Add another private note" onClick={() => { if (draft[draft.length - 1]?.trim()) setDraft([...draft, '']); }}>+</button></div>
              <span className="muted">Never on invoices, texts, or the customer portal.</span>
              {draft.map((t, i) => <textarea key={i} aria-label={`Private note ${i + 1}`} rows={3} style={{ width: '100%', marginTop: 8, background: '#F1F1EF', borderStyle: 'dashed' }} value={t}
                placeholder="Gate codes, follow-ups, who to talk to, what the customer OK'd" onChange={(e) => setDraft(draft.map((x, k) => (k === i ? e.target.value : x)))} onBlur={() => saveNotes(j.id, draft)} />)}
            </td></tr>}
            </Fragment>); })}
          {!data?.jobs.length && <tr><td colSpan={6} className="muted">No jobs this week.</td></tr>}
        </tbody></table></div>
      </div>
    </>
  );
}
