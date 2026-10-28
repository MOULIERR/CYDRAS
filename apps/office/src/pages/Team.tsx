// Add people with a one-time invite code. They type the code in the app after making a login.
import { useState } from 'react';
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { DEF } from '../perms';

export function Team() {
  const { member } = useSession();
  const c = member!.company_id;
  const owner = member!.role === 'owner';
  const [err, setErr] = useState('');
  const [code, setCode] = useState('');
  const { data, reload } = useLive(async () => {
    const people = check(await supabase.from('members').select('id, name, role, email, phone, active, user_id, perms').eq('company_id', c).order('name')) as any[];
    const invites = check(await supabase.from('invites').select('code, member_id, expires_at, used_at').eq('company_id', c).is('used_at', null)) as any[];
    const pay = owner ? (check(await supabase.from('member_pay').select('member_id, hourly_rate').eq('company_id', c)) as any[]) : [];
    return { people, invites, pay };
  }, ['members', 'invites'], c, [c]);
  const [f, setF] = useState({ name: '', role: 'tech', email: '' });
  async function invite(e: React.FormEvent) {
    e.preventDefault(); setErr(''); setCode('');
    try { setCode(check(await supabase.rpc('create_invite', { p_company: c, p_name: f.name.trim(), p_role: f.role, p_email: f.email || null })) as string); setF({ name: '', role: 'tech', email: '' }); reload(); }
    catch (e) { setErr((e as Error).message); }
  }
  async function setRate(memberId: string, v: string) {
    try { check(await supabase.from('member_pay').upsert({ member_id: memberId, company_id: c, hourly_rate: Number(v) || 0 })); reload(); } catch (e) { setErr((e as Error).message); }
  }
  async function deactivate(memberId: string, active: boolean) {
    try { check(await supabase.from('members').update({ active }).eq('id', memberId)); reload(); } catch (e) { setErr((e as Error).message); }
  }
  return (
    <>
      <div className="pageh"><div><p className="eyebrow">Set up</p><h1>Team &amp; permissions</h1></div></div>
      <form className="card" onSubmit={invite}>
        <h2>Add a person</h2>
        <div className="grid">
          <label>Name<input required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></label>
          <label>Role<select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="tech">Tech</option><option value="apprentice">Apprentice</option>{owner && <option value="supervisor">Supervisor</option>}</select></label>
          <label>Email (optional)<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></label>
        </div>
        {err && <div className="err">{err}</div>}
        {code && <div className="card" style={{ background: '#FFF0E6' }}>Invite code: <b style={{ fontSize: 22, letterSpacing: 2 }}>{code}</b><br /><span className="muted">Send this to them. They download Cydras, make a login, tap "I have an invite code", and type it. It works once and lasts 14 days.</span></div>}
        <div><button className="pri">Make invite code</button></div>
      </form>
      <div className="card">
        <div className="tscroll"><table><thead><tr><th>Name</th><th>Role</th><th>Status</th>{owner && <th>Hourly pay</th>}<th></th></tr></thead><tbody>
          {(data?.people ?? []).map((p) => { const inv = data!.invites.find((i) => i.member_id === p.id); return (
            <tr key={p.id}><td><b>{p.name}</b><br /><span className="muted">{p.email ?? ''}</span></td><td style={{ textTransform: 'capitalize' }}>{p.role}</td>
              <td>{!p.active ? <span className="pill bad">Removed</span> : p.user_id ? <span className="pill ok">Active</span> : <span className="pill">Invite code {inv?.code ?? 'expired'}</span>}</td>
              {owner && <td><input style={{ width: 90 }} type="number" step="0.5" defaultValue={data!.pay.find((x) => x.member_id === p.id)?.hourly_rate ?? ''} onBlur={(e) => setRate(p.id, e.target.value)} /></td>}
              <td>{p.role !== 'owner' && p.id !== member!.id && <button className={p.active ? 'danger' : ''} onClick={() => deactivate(p.id, !p.active)}>{p.active ? 'Remove' : 'Bring back'}</button>}</td></tr>); })}
        </tbody></table></div>
        {owner && <span className="muted">Only you (the owner) can see pay rates.</span>}
      </div>
      {owner && <Perms people={(data?.people ?? []).filter((p) => p.role !== 'owner' && p.active)} onSave={async (id, perms) => { setErr(''); try { check(await supabase.from('members').update({ perms }).eq('id', id)); reload(); } catch (e) { setErr((e as Error).message); } }} />}
    </>
  );
}

const PERMS: [string, string][] = [['schedule', 'Schedule appointments'], ['assign', 'Assign techs to jobs'], ['allJobs', "See everyone's jobs"], ['customers', 'Add customers'], ['estimates', 'Create estimates'], ['payments', 'Take payments'], ['prices', 'Change prices on a job'], ['discounts', 'Give discounts'], ['remove', 'Remove notes, equipment, and files'], ['pricebook', 'Edit the price book'], ['acctnums', 'See supply house account numbers'], ['inventory', 'Add parts to trucks'], ['seePrices', 'See prices and totals']];

function Perms({ people, onSave }: { people: any[]; onSave: (id: string, perms: Record<string, boolean>) => void }) {
  const [sel, setSel] = useState<string>('');
  const p = people.find((x) => x.id === (sel || people[0]?.id));
  if (!p) return null;
  const eff = (k: string) => (p.perms && k in p.perms ? !!p.perms[k] : !!DEF[p.role]?.[k]);
  return <div className="card"><div className="cardh"><h2>Who can do what</h2>
    <select className="inp" style={{ width: 'auto' }} value={p.id} onChange={(e) => setSel(e.target.value)}>{people.map((x) => <option key={x.id} value={x.id}>{x.name} · {x.role}</option>)}</select></div>
    <span className="s">Starts from the role's normal settings. Turn single things on or off for this person.</span>
    {PERMS.map(([k, l]) => <label key={k} className="prow" style={{ flexDirection: 'row', cursor: 'pointer' }}><span className="t">{l}</span>
      <input type="checkbox" className="sw" checked={eff(k)} onChange={(e) => onSave(p.id, { ...(p.perms ?? {}), [k]: e.target.checked })} /></label>)}
  </div>;
}
