// Invoices & payments, like the mockup: All invoices (find by customer name), Who owes you (by age), Payments.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { PageH, dayKey, dayLabel, money, paidOn } from '../ui';

export function Invoices() {
  const { member } = useSession();
  const c = member!.company_id;
  const nav = useNavigate();
  const [tab, setTab] = useState<'all' | 'owe' | 'pays'>('owe');
  const [q, setQ] = useState('');
  const { data } = useLive(async () => {
    const invs = check(await supabase.from('invoices').select('id, number, job_id, total, status, issued_at, customers!invoices_customer_id_fkey(name), payments(amount, refunded_amount, voided_at, status)').eq('company_id', c).is('deleted_at', null).order('issued_at', { ascending: false })) as any[];
    const pays = check(await supabase.from('payments').select('id, amount, method, reference, refunded_amount, voided_at, void_reason, status, taken_at, job_id, customers(name)').eq('company_id', c).order('taken_at', { ascending: false }).limit(300)) as any[];
    return { invs, pays };
  }, ['invoices', 'payments'], c, [c]);

  const due = (i: any) => Math.max(0, Number(i.total) - paidOn(i.payments ?? []));
  const age = (i: any) => Math.floor((Date.now() - new Date(i.issued_at).getTime()) / 86400000);
  const match = (n?: string) => !q || (n ?? '').toLowerCase().includes(q.toLowerCase());
  const invs = (data?.invs ?? []).filter((i) => i.status !== 'void' && match(i.customers?.name));
  const open = invs.filter((i) => due(i) > 0.004);
  const buckets: [string, any[]][] = [['0–30 days', open.filter((i) => age(i) <= 30)], ['31–60 days', open.filter((i) => age(i) > 30 && age(i) <= 60)], ['61–90 days', open.filter((i) => age(i) > 60 && age(i) <= 90)], ['90+ days', open.filter((i) => age(i) > 90)]];
  const tabs = <div className="seg" role="group" aria-label="Section">{([['all', 'All invoices'], ['owe', 'Who owes you'], ['pays', 'Payments']] as const).map(([k, l]) => <button key={k} aria-pressed={tab === k} onClick={() => setTab(k)}>{l}</button>)}</div>;
  const open1 = (i: any) => i.job_id && nav(`/job/${i.job_id}`);
  const row = (i: any) => <tr key={i.id} className="click" onClick={() => open1(i)}><td className="mono">INV-{i.number ?? '—'}</td><td><b>{i.customers?.name}</b></td><td>{dayLabel(dayKey(new Date(i.issued_at)))}</td>
    <td className="r mono">{money(Number(i.total))}</td><td className="r">{due(i) > 0.004 ? <span className="pill p-warn">Owes {money(due(i))}</span> : <span className="pill p-done">Paid</span>}</td></tr>;

  return (
    <>
      <PageH eyebrow="Invoices & payments" title={tab === 'all' ? 'All invoices' : tab === 'owe' ? 'Who owes you' : 'Payments'} right={tabs} />
      <input className="inp" style={{ maxWidth: 360 }} placeholder="Find by customer name" value={q} onChange={(e) => setQ(e.target.value)} />
      {tab === 'owe' && <>
        <div className="grid g4">{buckets.map(([l, L]) => <div key={l} className="card kpi"><span className="eyebrow">{l}</span><b style={{ color: l !== '0–30 days' && L.length ? 'var(--bad)' : undefined }}>{money(L.reduce((a, i) => a + due(i), 0))}</b><span className="s">{L.length} invoice{L.length === 1 ? '' : 's'}</span></div>)}</div>
        <div className="card"><div className="tscroll"><table className="tbl"><thead><tr><th>Invoice</th><th>Customer</th><th>Sent</th><th className="r">Total</th><th className="r">Status</th></tr></thead><tbody>
          {open.map(row)}{!open.length && <tr><td colSpan={5}><div className="empty">Nobody owes you money right now.</div></td></tr>}</tbody></table></div></div></>}
      {tab === 'all' && <div className="card"><div className="tscroll"><table className="tbl"><thead><tr><th>Invoice</th><th>Customer</th><th>Sent</th><th className="r">Total</th><th className="r">Status</th></tr></thead><tbody>
        {invs.map(row)}{!invs.length && <tr><td colSpan={5}><div className="empty">{q ? 'No invoices for that name.' : 'No invoices yet. They are made when a job gets paid or finished.'}</div></td></tr>}</tbody></table></div></div>}
      {tab === 'pays' && <div className="card"><div className="tscroll"><table className="tbl"><thead><tr><th>When</th><th>Customer</th><th>Method</th><th className="r">Amount</th><th>Status</th></tr></thead><tbody>
        {(data?.pays ?? []).filter((p) => match(p.customers?.name)).map((p) => <tr key={p.id} className={p.job_id ? 'click' : ''} onClick={() => p.job_id && nav(`/job/${p.job_id}`)}>
          <td>{dayLabel(dayKey(new Date(p.taken_at)))}</td><td><b>{p.customers?.name}</b></td><td>{p.method.replace(/_/g, ' ')}{p.reference ? ` #${p.reference}` : ''}</td><td className="r mono">{money(Number(p.amount))}</td>
          <td>{p.voided_at ? <span className="pill p-bad">Canceled</span> : Number(p.refunded_amount) > 0 ? <span className="pill p-warn">Refunded {money(Number(p.refunded_amount))}</span> : p.status === 'succeeded' ? <span className="pill p-done">Paid</span> : <span className="pill">{p.status}</span>}</td></tr>)}
        {!(data?.pays ?? []).length && <tr><td colSpan={5}><div className="empty">No payments yet.</div></td></tr>}</tbody></table></div></div>}
    </>
  );
}
