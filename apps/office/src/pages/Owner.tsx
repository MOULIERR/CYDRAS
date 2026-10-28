// Owner pages like the mockup: Revenue watch, Job costing, Reports (download), Switch software (import customers),
// plus Tech scorecards.
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { PageH, dayKey, dayLabel, money, money0 } from '../ui';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const paidValue = (p: any) => (p.status === 'succeeded' && !p.voided_at ? Number(p.amount) - Number(p.refunded_amount ?? 0) : 0);

export function Revenue() {
  const { member } = useSession();
  const c = member!.company_id;
  const y = new Date().getFullYear();
  const { data } = useLive(async () => check(await supabase.from('payments').select('amount, refunded_amount, voided_at, status, taken_at').eq('company_id', c).gte('taken_at', new Date(y - 1, 0, 1).toISOString())) as any[], ['payments'], c, [c]);
  const [cur, last] = useMemo(() => {
    const a = Array(12).fill(0), b = Array(12).fill(0);
    for (const p of data ?? []) { const d = new Date(p.taken_at); (d.getFullYear() === y ? a : b)[d.getMonth()] += paidValue(p); }
    return [a, b];
  }, [data, y]);
  if (!data) return <div className="s">Loading…</div>;
  const m = new Date().getMonth();
  const ytd = cur.slice(0, m + 1).reduce((s, x) => s + x, 0), lytd = last.slice(0, m + 1).reduce((s, x) => s + x, 0);
  const max = Math.max(1, ...cur, ...last);
  const W = 720, H = 240, bw = W / 12;
  return (
    <>
      <PageH eyebrow="Owner" title="Revenue watch" />
      <div className="grid g4">
        <div className="card kpi"><span className="eyebrow">This year so far</span><b>{money0(ytd)}</b></div>
        <div className="card kpi"><span className="eyebrow">Same time last year</span><b>{money0(lytd)}</b></div>
        <div className="card kpi"><span className="eyebrow">Change</span><b style={{ color: ytd >= lytd ? 'var(--ok)' : 'var(--bad)' }}>{lytd ? `${ytd >= lytd ? '▲' : '▼'} ${Math.abs((ytd - lytd) / lytd * 100).toFixed(1)}%` : '—'}</b><span className="s">{lytd ? '' : 'Shows once you have last year in Cydras'}</span></div>
        <div className="card kpi"><span className="eyebrow">{MON[m]} so far</span><b>{money0(cur[m])}</b><span className="s">{MON[m]} last year: {money0(last[m])}</span></div>
      </div>
      <div className="card"><div className="cardh"><h2>Money in by month</h2><span className="s">■ {y} &nbsp; <span style={{ opacity: 0.45 }}>■ {y - 1}</span></span></div>
        <div className="tscroll"><svg viewBox={`0 -16 ${W} ${H + 46}`} style={{ width: '100%', minWidth: 560, height: 'auto' }} role="img" aria-label={`Money in by month, ${y} vs ${y - 1}`}>
          {[0.25, 0.5, 0.75, 1].map((f) => <g key={f}><line x1="0" x2={W} y1={H - H * f} y2={H - H * f} stroke="var(--line)" /><text x="2" y={H - H * f - 3} fontSize="10" fill="var(--muted)">{money0(max * f)}</text></g>)}
          {MON.map((n, i) => <g key={n}>
            <rect x={i * bw + bw * 0.18} y={H - (last[i] / max) * H} width={bw * 0.3} height={(last[i] / max) * H} fill="var(--accent)" opacity="0.35" rx="3" />
            <rect x={i * bw + bw * 0.5} y={H - (cur[i] / max) * H} width={bw * 0.3} height={(cur[i] / max) * H} fill="var(--accent)" rx="3" />
            <text x={i * bw + bw / 2} y={H + 18} fontSize="12" textAnchor="middle" fill="var(--muted)">{n}</text></g>)}
        </svg></div>
        <span className="s">Counts payments taken (cash, check, Zelle and card), minus refunds and canceled payments.</span></div>
    </>
  );
}

export function Costing() {
  const { member } = useSession();
  const c = member!.company_id;
  const nav = useNavigate();
  const { data } = useLive(async () => {
    const since = new Date(); since.setDate(since.getDate() - 90);
    const jobs = check(await supabase.from('jobs').select('id, number, type, status, starts_at, status_times, parent_job_id, customers(name), job_assignments(member_id, deleted_at)').eq('company_id', c).eq('status', 'done').gte('starts_at', since.toISOString()).is('deleted_at', null).order('starts_at', { ascending: false })) as any[];
    const lines = check(await supabase.from('job_lines').select('job_id, price, qty, kind, part_sku').eq('company_id', c).is('deleted_at', null)) as any[];
    const parts = check(await supabase.from('parts').select('id, part_number, cost').eq('company_id', c)) as any[];
    const pay = check(await supabase.from('member_pay').select('member_id, hourly_rate').eq('company_id', c)) as any[];
    return { jobs, lines, parts, pay };
  }, ['jobs', 'job_lines'], c, [c]);
  if (!data) return <div className="s">Loading…</div>;
  const rows = data.jobs.filter((j) => !j.parent_job_id).map((j) => {
    const L = data.lines.filter((l) => l.job_id === j.id);
    const rev = L.reduce((a, l) => a + Number(l.price) * Number(l.qty), 0);
    const parts = L.filter((l) => l.kind === 'part').reduce((a, l) => a + Number(data.parts.find((p) => p.id === l.part_sku || p.part_number === l.part_sku)?.cost ?? Number(l.price) * 0.5) * Number(l.qty), 0);
    const st = j.status_times ?? {}, mins = st.on_site && st.done ? Math.max(0, (new Date(st.done).getTime() - new Date(st.on_site).getTime()) / 60000) : 0;
    const rate = (j.job_assignments ?? []).filter((a: any) => !a.deleted_at).reduce((a: number, x: any) => a + Number(data.pay.find((p) => p.member_id === x.member_id)?.hourly_rate ?? 0), 0);
    const labor = (mins / 60) * rate, profit = rev - parts - labor;
    return { j, rev, parts, labor, profit, pct: rev ? (profit / rev) * 100 : 0 };
  });
  const tot = rows.reduce((a, r) => ({ rev: a.rev + r.rev, profit: a.profit + r.profit }), { rev: 0, profit: 0 });
  return (
    <>
      <PageH eyebrow="Owner" title="Job costing" />
      <p className="s" style={{ margin: 0 }}>Last 90 days of finished jobs. Parts use your cost from inventory. Labor uses time on site (Start job to Done) × each tech's hourly pay from Team.</p>
      <div className="grid g4"><div className="card kpi"><span className="eyebrow">Billed</span><b>{money0(tot.rev)}</b></div><div className="card kpi"><span className="eyebrow">Profit after parts & labor</span><b style={{ color: tot.profit >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{money0(tot.profit)}</b><span className="s">{tot.rev ? `${(tot.profit / tot.rev * 100).toFixed(0)}% margin` : ''}</span></div></div>
      <div className="card"><div className="tscroll"><table className="tbl"><thead><tr><th>Job</th><th>Customer</th><th className="r">Billed</th><th className="r">Parts</th><th className="r">Labor</th><th className="r">Profit</th></tr></thead><tbody>
        {rows.map((r) => <tr key={r.j.id} className="click" onClick={() => nav(`/job/${r.j.id}`)}><td>{dayLabel(dayKey(new Date(r.j.starts_at)))}<br /><span className="s">#{r.j.number} · {r.j.type}</span></td><td><b>{r.j.customers?.name}</b></td>
          <td className="r mono">{money(r.rev)}</td><td className="r mono">{money(r.parts)}</td><td className="r mono">{r.labor ? money(r.labor) : '—'}</td><td className="r mono" style={{ color: r.profit >= 0 ? 'var(--ok)' : 'var(--bad)' }}>{money(r.profit)} <span className="s">{r.rev ? `${r.pct.toFixed(0)}%` : ''}</span></td></tr>)}
        {!rows.length && <tr><td colSpan={6}><div className="empty">No finished jobs in the last 90 days yet.</div></td></tr>}</tbody></table></div></div>
    </>
  );
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const keys = Object.keys(rows[0]);
  const esc = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [keys.join(','), ...rows.map((r) => keys.map((k) => esc(r[k])).join(','))].join('\n');
}
function download(name: string, text: string) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
export function Reports() {
  const { member } = useSession();
  const c = member!.company_id;
  const y = new Date().getFullYear();
  const [from, setFrom] = useState(`${y}-01-01`);
  const [to, setTo] = useState(dayKey(new Date()));
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const range = () => [new Date(from + 'T00:00:00').toISOString(), new Date(new Date(to + 'T00:00:00').getTime() + 86400000).toISOString()];
  const REPORTS: [string, string, () => Promise<Record<string, unknown>[]>][] = [
    ['jobs', 'Jobs', async () => { const [a, b] = range(); return (check(await supabase.from('jobs').select('number, starts_at, status, category, type, customers(name)').eq('company_id', c).gte('starts_at', a).lt('starts_at', b).is('deleted_at', null).order('starts_at')) as any[]).map((j) => ({ job: j.number, date: dayKey(new Date(j.starts_at)), customer: j.customers?.name, category: j.category, work: j.type, status: j.status })); }],
    ['invoices', 'Invoices', async () => { const [a, b] = range(); return (check(await supabase.from('invoices').select('number, issued_at, subtotal, tax, total, status, customers!invoices_customer_id_fkey(name)').eq('company_id', c).gte('issued_at', a).lt('issued_at', b).is('deleted_at', null).order('issued_at')) as any[]).map((i) => ({ invoice: i.number, date: dayKey(new Date(i.issued_at)), customer: i.customers?.name, subtotal: i.subtotal, tax: i.tax, total: i.total, status: i.status })); }],
    ['payments', 'Payments', async () => { const [a, b] = range(); return (check(await supabase.from('payments').select('taken_at, method, amount, refunded_amount, voided_at, reference, customers(name)').eq('company_id', c).gte('taken_at', a).lt('taken_at', b).order('taken_at')) as any[]).map((p) => ({ date: dayKey(new Date(p.taken_at)), customer: p.customers?.name, method: p.method, amount: p.amount, refunded: p.refunded_amount, canceled: p.voided_at ? 'yes' : '', reference: p.reference })); }],
    ['customers', 'Customers', async () => (check(await supabase.from('customers').select('name, kind, contact, customer_contacts(kind, value), sites(address)').eq('company_id', c).is('deleted_at', null).order('name')) as any[]).map((x) => ({ name: x.name, type: x.kind, contact: x.contact, phone: x.customer_contacts?.find((y: any) => y.kind === 'phone')?.value, email: x.customer_contacts?.find((y: any) => y.kind === 'email')?.value, address: x.sites?.[0]?.address }))],
    ['hours', 'Timesheets', async () => { const [a, b] = range(); const ppl = check(await supabase.from('members').select('id, name').eq('company_id', c)) as any[]; return (check(await supabase.from('time_entries').select('member_id, clock_in, clock_out, break_minutes, miles, approved_at').eq('company_id', c).gte('clock_in', a).lt('clock_in', b).is('deleted_at', null).order('clock_in')) as any[]).map((t) => ({ person: ppl.find((p) => p.id === t.member_id)?.name, in: t.clock_in, out: t.clock_out, break_min: t.break_minutes, hours: t.clock_out ? (((new Date(t.clock_out).getTime() - new Date(t.clock_in).getTime()) / 60000 - t.break_minutes) / 60).toFixed(2) : '', miles: t.miles, approved: t.approved_at ? 'yes' : '' })); }],
  ];
  return (
    <>
      <PageH eyebrow="Owner" title="Reports" />
      <div className="card"><div className="form"><label className="field">From<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label><label className="field">To<input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label></div>
        <span className="s">Each report downloads as a spreadsheet file (CSV) that opens in Excel, Google Sheets or Numbers.</span></div>
      {err && <div className="err">{err}</div>}
      <div className="grid g4">{REPORTS.map(([k, l, f]) => <div key={k} className="card"><h3>{l}</h3><button className="btn" disabled={!!busy} onClick={async () => { setBusy(k); setErr(''); try { const rows = await f(); if (!rows.length) setErr(`No ${l.toLowerCase()} in those dates.`); else download(`cydras-${k}-${from}-to-${to}.csv`, toCsv(rows)); } catch (e) { setErr((e as Error).message); } setBusy(''); }}>{busy === k ? 'Making…' : 'Download'}</button></div>)}</div>
    </>
  );
}

function parseCsv(text: string): string[][] {
  const out: string[][] = []; let row: string[] = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') q = false; else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); out.push(row); }
  return out.filter((r) => r.some((x) => x.trim()));
}
const GUESS: Record<string, RegExp> = { name: /^(customer|name|full ?name|company|display ?name)/i, phone: /phone|mobile|cell/i, email: /e-?mail/i, address: /address|street/i, city: /^city/i, state: /^state/i, zip: /zip|postal/i, kind: /type|kind/i, contact: /contact|first/i };
export function Import() {
  const { member } = useSession();
  const c = member!.company_id;
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false); const [done, setDone] = useState(''); const [err, setErr] = useState('');
  const head = rows?.[0] ?? [], body = rows?.slice(1) ?? [];
  const val = (r: string[], k: string) => (map[k] != null && map[k] >= 0 ? (r[map[k]] ?? '').trim() : '');
  async function load(f: File) {
    setDone(''); setErr('');
    const r = parseCsv(await f.text()); if (r.length < 2) return setErr('That file has no customers in it.');
    const m: Record<string, number> = {}; for (const [k, re] of Object.entries(GUESS)) m[k] = r[0].findIndex((h) => re.test(h)); setRows(r); setMap(m);
  }
  async function go() {
    setBusy(true); setErr(''); let n = 0;
    try {
      for (const r of body) {
        const name = val(r, 'name'); if (!name) continue;
        const k = val(r, 'kind').toLowerCase(); const kind = /bus|com/.test(k) ? 'business' : /condo/.test(k) ? 'condo' : 'home';
        const cu = check(await supabase.from('customers').insert({ company_id: c, name, kind, contact: val(r, 'contact') || null }).select('id').single()) as any;
        const contacts = [val(r, 'phone') && { company_id: c, customer_id: cu.id, kind: 'phone', value: val(r, 'phone'), label: 'Phone', is_primary: true }, val(r, 'email') && { company_id: c, customer_id: cu.id, kind: 'email', value: val(r, 'email'), label: 'Email', is_primary: true }].filter(Boolean);
        if (contacts.length) check(await supabase.from('customer_contacts').insert(contacts));
        const addr = [val(r, 'address'), val(r, 'city'), [val(r, 'state'), val(r, 'zip')].filter(Boolean).join(' ')].filter(Boolean).join(', ');
        if (addr) check(await supabase.from('sites').insert({ company_id: c, customer_id: cu.id, address: addr, is_primary: true }));
        n++;
      }
      setDone(`Imported ${n} customers.`); setRows(null);
    } catch (e) { setErr(`Stopped after ${n}: ${(e as Error).message}`); }
    setBusy(false);
  }
  return (
    <>
      <PageH eyebrow="Owner" title="Switch software" />
      <div className="card" style={{ maxWidth: 760 }}><h3>Bring your customers over</h3>
        <p className="s" style={{ margin: 0 }}>Export your customer list from ServiceTitan, Housecall Pro, Jobber or QuickBooks as a CSV file, then pick it here. Imported customers are not signed up for texts until they agree.</p>
        <label className="btn" style={{ alignSelf: 'flex-start' }}>Pick a CSV file<input type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && load(e.target.files[0])} /></label>
        {done && <div className="s" style={{ color: 'var(--ok)', fontWeight: 700 }}>✓ {done}</div>}
        {err && <div className="err">{err}</div>}
        {rows && <>
          <b>Match the columns</b><div className="form">{Object.keys(GUESS).map((k) => <label key={k} className="field" style={{ textTransform: 'capitalize' }}>{k}<select value={map[k] ?? -1} onChange={(e) => setMap({ ...map, [k]: +e.target.value })}><option value={-1}>— skip —</option>{head.map((h, i) => <option key={i} value={i}>{h}</option>)}</select></label>)}</div>
          <b>First 5 customers</b><div className="tscroll"><table className="tbl"><thead><tr><th>Name</th><th>Phone</th><th>Email</th><th>Address</th></tr></thead><tbody>{body.slice(0, 5).map((r, i) => <tr key={i}><td>{val(r, 'name')}</td><td>{val(r, 'phone')}</td><td>{val(r, 'email')}</td><td>{val(r, 'address')}</td></tr>)}</tbody></table></div>
          <div><button className="btn pri" disabled={busy || map.name == null || map.name < 0} onClick={go}>{busy ? 'Importing…' : `Import ${body.length} customers`}</button></div></>}
      </div>
    </>
  );
}

export function Scorecards() {
  const { member } = useSession();
  const c = member!.company_id;
  const [days, setDays] = useState(30);
  const { data } = useLive(async () => {
    const since = new Date(); since.setDate(since.getDate() - days);
    const jobs = check(await supabase.from('jobs').select('id, status, callback, parent_job_id, job_assignments(member_id, deleted_at)').eq('company_id', c).gte('starts_at', since.toISOString()).is('deleted_at', null)) as any[];
    const lines = check(await supabase.from('job_lines').select('job_id, price, qty').eq('company_id', c).is('deleted_at', null)) as any[];
    const people = check(await supabase.from('members').select('id, name, role').eq('company_id', c).eq('active', true).order('name')) as any[];
    return { jobs, lines, people };
  }, ['jobs', 'job_lines'], c, [c, days]);
  if (!data) return <div className="s">Loading…</div>;
  const rev = (jobId: string) => data.lines.filter((l) => l.job_id === jobId).reduce((a, l) => a + Number(l.price) * Number(l.qty), 0);
  const cards = data.people.filter((p) => p.role !== 'owner' || data.jobs.some((j) => (j.job_assignments ?? []).some((a: any) => a.member_id === p.id))).map((p) => {
    const mine = data.jobs.filter((j) => (j.job_assignments ?? []).some((a: any) => !a.deleted_at && a.member_id === p.id));
    const done = mine.filter((j) => j.status === 'done');
    const money1 = done.reduce((a, j) => a + rev(j.parent_job_id ?? j.id) / Math.max(1, (j.job_assignments ?? []).filter((x: any) => !x.deleted_at).length), 0);
    return { p, done: done.length, total: mine.length, money: money1, avg: done.length ? money1 / done.length : 0, callbacks: mine.filter((j) => j.callback).length };
  });
  return (
    <>
      <PageH eyebrow="Work" title="Tech scorecards" right={<div className="seg" role="group">{[7, 30, 90].map((d) => <button key={d} aria-pressed={days === d} onClick={() => setDays(d)}>{d} days</button>)}</div>} />
      <p className="s" style={{ margin: 0 }}>Revenue is split evenly when more than one tech is on a job.</p>
      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,320px),1fr))' }}>{cards.map((x) => <div key={x.p.id} className="card"><div className="cardh"><h3>{x.p.name}</h3><span className="s" style={{ textTransform: 'capitalize' }}>{x.p.role}</span></div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 12 }}>
          <div className="kpi"><span className="eyebrow">Jobs done</span><b>{x.done}</b><span className="s">of {x.total}</span></div>
          <div className="kpi"><span className="eyebrow">Revenue</span><b>{money0(x.money)}</b></div>
          <div className="kpi"><span className="eyebrow">Avg ticket</span><b>{money0(x.avg)}</b></div>
          <div className="kpi"><span className="eyebrow">Callbacks</span><b style={{ color: x.callbacks ? 'var(--bad)' : undefined }}>{x.callbacks}</b></div></div></div>)}
        {!cards.length && <div className="empty">No techs yet.</div>}</div>
    </>
  );
}
