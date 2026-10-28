// Weekly hours from the clock-in button. Approve them, or fix a time (a reason is required and saved).
import { useState } from 'react';
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { hm, workedMinutes, weekPay } from '@cydras/core';

const monday = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const local = (iso: string) => { const d = new Date(iso); return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };
const t = (iso: string) => new Date(iso).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function Timesheets() {
  const { member } = useSession();
  const c = member!.company_id;
  const owner = member!.role === 'owner';
  const [week, setWeek] = useState(monday());
  const [err, setErr] = useState('');
  const [fix, setFix] = useState<{ id: string; clock_in: string; clock_out: string; reason: string } | null>(null);
  const { data, reload } = useLive(async () => {
    const end = new Date(week.getTime() + 7 * 86400000);
    const entries = check(await supabase.from('time_entries').select('*').eq('company_id', c).gte('clock_in', week.toISOString()).lt('clock_in', end.toISOString()).is('deleted_at', null).order('clock_in')) as any[];
    const people = check(await supabase.from('members').select('id, name').eq('company_id', c)) as any[];
    const pay = owner ? (check(await supabase.from('member_pay').select('member_id, hourly_rate').eq('company_id', c)) as any[]) : [];
    return { entries, people, pay };
  }, ['time_entries'], c, [c, week.getTime()]);

  async function approve(ids: string[]) {
    setErr('');
    try { check(await supabase.from('time_entries').update({ approved_at: new Date().toISOString(), approved_by: member!.id }).in('id', ids)); reload(); } catch (e) { setErr((e as Error).message); }
  }
  async function saveFix() {
    if (!fix) return;
    if (!fix.reason.trim()) { setErr('Type a reason for the change.'); return; }
    setErr('');
    try {
      const old = data!.entries.find((e) => e.id === fix.id);
      const edits = [...(old.edits ?? []), { by: member!.name, at: new Date().toISOString(), reason: fix.reason.trim(), from: { clock_in: old.clock_in, clock_out: old.clock_out } }];
      check(await supabase.from('time_entries').update({ clock_in: new Date(fix.clock_in).toISOString(), clock_out: new Date(fix.clock_out).toISOString(), edits, approved_at: null, approved_by: null }).eq('id', fix.id));
      setFix(null); reload();
    } catch (e) { setErr((e as Error).message); }
  }
  const byPerson = new Map<string, any[]>();
  (data?.entries ?? []).forEach((e) => byPerson.set(e.member_id, [...(byPerson.get(e.member_id) ?? []), e]));
  return (
    <>
      <h1>Timesheets</h1>
      <div className="row">
        <button onClick={() => setWeek(new Date(week.getTime() - 7 * 86400000))}>← Week</button>
        <b>Week of {week.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</b>
        <button onClick={() => setWeek(new Date(week.getTime() + 7 * 86400000))}>Week →</button>
      </div>
      {err && <div className="err">{err}</div>}
      {[...byPerson.entries()].map(([mid, list]) => {
        const mins = list.reduce((s, e) => s + workedMinutes(e), 0);
        const rate = data!.pay.find((p) => p.member_id === mid)?.hourly_rate;
        const pay = owner && rate ? weekPay(mins, Number(rate)) : null;
        const waiting = list.filter((e) => e.clock_out && !e.approved_at).map((e) => e.id);
        return (
          <div className="card" key={mid}>
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2>{data!.people.find((p) => p.id === mid)?.name}</h2>
              <span><b>{hm(mins)}</b>{pay && <> · ${pay.pay.toFixed(2)}{pay.otMinutes > 0 ? ` (incl. ${hm(pay.otMinutes)} overtime)` : ''}</>}</span>
              {waiting.length > 0 && <button className="pri" onClick={() => approve(waiting)}>Approve week</button>}
            </div>
            <table><thead><tr><th>In</th><th>Out</th><th>Break</th><th>Worked</th><th>Miles</th><th>Status</th><th></th></tr></thead><tbody>
              {list.map((e) => (
                <tr key={e.id}><td>{t(e.clock_in)}</td><td>{e.clock_out ? t(e.clock_out) : <span className="pill go">Clocked in</span>}</td><td>{e.break_minutes}m</td><td>{hm(workedMinutes(e))}</td><td>{e.miles}</td>
                  <td>{e.approved_at ? <span className="pill ok">Approved</span> : 'Waiting'}{(e.edits ?? []).length > 0 && <div className="muted" title={(e.edits ?? []).map((x: any) => `${x.by}: ${x.reason}`).join('\n')}>Fixed {(e.edits ?? []).length}×</div>}</td>
                  <td>{e.clock_out && <button onClick={() => setFix({ id: e.id, clock_in: local(e.clock_in), clock_out: local(e.clock_out), reason: '' })}>Fix time</button>}</td></tr>
              ))}
            </tbody></table>
          </div>
        );
      })}
      {data && !byPerson.size && <div className="card muted">No hours this week.</div>}
      {fix && (
        <div className="card">
          <h2>Fix a time</h2>
          <div className="grid">
            <label>Clock in<input type="datetime-local" value={fix.clock_in} onChange={(e) => setFix({ ...fix, clock_in: e.target.value })} /></label>
            <label>Clock out<input type="datetime-local" value={fix.clock_out} onChange={(e) => setFix({ ...fix, clock_out: e.target.value })} /></label>
            <label>Reason (saved for the record)<input value={fix.reason} onChange={(e) => setFix({ ...fix, reason: e.target.value })} placeholder="Forgot to clock out" /></label>
          </div>
          <div className="row"><button className="pri" onClick={saveFix}>Save fix</button><button onClick={() => setFix(null)}>Cancel</button></div>
        </div>
      )}
    </>
  );
}
