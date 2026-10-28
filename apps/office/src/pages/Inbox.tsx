// Inbox, like the mockup: customer texts in one list, plus team chat.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, check, callFunction } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { PageH, dayKey, dayLabel, hm, today } from '../ui';

const when = (iso: string) => (dayKey(new Date(iso)) === today() ? hm(iso) : dayLabel(dayKey(new Date(iso))));
const QUICK = ['On our way!', "We're running about 20 minutes behind.", 'Your invoice is ready. Thank you!'];

export function Inbox() {
  const { member } = useSession();
  const c = member!.company_id;
  const [tab, setTab] = useState<'cust' | 'team'>('cust');
  const [cur, setCur] = useState<string | null>(null);
  const [txt, setTxt] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const { data, reload } = useLive(async () => {
    const msgs = check(await supabase.from('messages').select('id, customer_id, direction, body, status, error, created_at, customers(name)').eq('company_id', c).order('created_at').limit(1000)) as any[];
    const team = check(await supabase.from('team_messages').select('id, from_member, body, created_at').eq('company_id', c).eq('thread', 'all').order('created_at').limit(300)) as any[];
    const people = check(await supabase.from('members').select('id, name').eq('company_id', c)) as any[];
    const customers = check(await supabase.from('customers').select('id, name').eq('company_id', c).is('deleted_at', null).order('name')) as any[];
    return { msgs, team, people, customers };
  }, ['messages', 'team_messages'], c, [c]);
  if (!data) return <div className="s">Loading…</div>;
  const threads = new Map<string, any[]>();
  for (const m of data.msgs) if (m.customer_id) threads.set(m.customer_id, [...(threads.get(m.customer_id) ?? []), m]);
  const ids = [...threads.keys()].sort((a, b) => (threads.get(b)!.at(-1).created_at).localeCompare(threads.get(a)!.at(-1).created_at));
  const open = cur ?? ids[0] ?? null;
  const t = open ? threads.get(open) ?? [] : [];
  const cname = (id: string) => data.customers.find((x) => x.id === id)?.name ?? t[0]?.customers?.name ?? 'Customer';
  const pname = (id: string) => data.people.find((p) => p.id === id)?.name ?? '';

  async function send() {
    const body = txt.trim(); if (!body) return;
    setBusy(true); setErr('');
    try {
      if (tab === 'team') check(await supabase.from('team_messages').insert({ company_id: c, thread: 'all', from_member: member!.id, body }));
      else if (open) await callFunction('send-sms', { company_id: c, customer_id: open, body, kind: 'manual' });
      setTxt(''); reload();
    } catch (e) { setErr((e as Error).message); reload(); }
    setBusy(false);
  }

  return (
    <>
      <PageH eyebrow="Inbox" title={tab === 'cust' ? 'Customer texts' : 'Team chat'} right={<div className="seg" role="group"><button aria-pressed={tab === 'cust'} onClick={() => setTab('cust')}>Customers</button><button aria-pressed={tab === 'team'} onClick={() => setTab('team')}>Team</button></div>} />
      {tab === 'cust' ? <div className="card ibx">
        <div className="ibl">
          <div style={{ padding: 10, borderBottom: '1px solid var(--line)' }}><select className="inp" value="" aria-label="New message to" onChange={(e) => e.target.value && setCur(e.target.value)}><option value="">+ New message to…</option>{data.customers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></div>
          {ids.map((id) => { const L = threads.get(id)!, last = L.at(-1); return <button key={id} aria-current={id === open} onClick={() => setCur(id)}>
            <div className="row"><b style={{ flex: 1 }}>{cname(id)}</b>{last.direction === 'in' && <span className="dot" style={{ background: 'var(--accent)' }} />}<span className="s" style={{ fontSize: 12 }}>{when(last.created_at)}</span></div>
            <div className="s" style={{ fontSize: 13.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{last.body}</div></button>; })}
          {!ids.length && <div className="empty" style={{ margin: 12 }}>No texts yet. Customer replies show up here.</div>}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {open ? <><div className="row" style={{ padding: '12px 16px', borderBottom: '1px solid var(--line)' }}><b style={{ flex: 1 }}>{cname(open)}</b><Link className="btn sm" to={`/customer/${open}`}>Customer</Link></div>
            <div className="msgs">{t.map((m) => <div key={m.id} className={`msg ${m.direction === 'in' ? 'them' : 'me'}`}>{m.body}<div style={{ fontSize: 11, opacity: 0.75, marginTop: 3 }}>{when(m.created_at)}{m.status === 'blocked' || m.status === 'failed' ? ` · Not sent: ${m.error ?? m.status}` : ''}</div></div>)}
              {!t.length && <div className="empty">No messages with {cname(open)} yet.</div>}</div>
            <div className="row wrap" style={{ padding: '8px 16px 0' }}>{QUICK.map((q) => <button key={q} className="chip" onClick={() => setTxt(q)}>{q}</button>)}</div>
            {err && <div className="err" style={{ margin: '8px 16px 0' }}>{err}</div>}
            <div className="row" style={{ padding: '12px 16px 16px' }}><input className="inp" value={txt} placeholder="Type a reply" onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} /><button className="btn pri" disabled={busy} onClick={send}>Send</button></div></>
            : <div className="empty" style={{ margin: 16 }}>Pick a customer to text.</div>}
        </div></div>
        : <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="msgs" style={{ minHeight: 360 }}>{data.team.map((m) => <div key={m.id} className={`msg ${m.from_member === member!.id ? 'me' : 'them'}`}>{m.from_member !== member!.id && <b style={{ display: 'block', fontSize: 12 }}>{pname(m.from_member)}</b>}{m.body}<div style={{ fontSize: 11, opacity: 0.75, marginTop: 3 }}>{when(m.created_at)}</div></div>)}
            {!data.team.length && <div className="empty">No team messages yet. Everyone on your team sees this chat.</div>}</div>
          {err && <div className="err" style={{ margin: '0 16px' }}>{err}</div>}
          <div className="row" style={{ padding: '12px 16px 16px' }}><input className="inp" value={txt} placeholder="Message the whole team" onChange={(e) => setTxt(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && send()} /><button className="btn pri" disabled={busy} onClick={send}>Send</button></div>
        </div>}
    </>
  );
}
