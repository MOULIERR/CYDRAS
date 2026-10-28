// Settings pages like the mockup: All settings (search), Alerts & settings, Account & preferences,
// Supply houses, Documents and Count sheets. Saved on the company; only the owner can change most of it.
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase, check } from '../supabase';
import { useSession, isManager } from '../session';
import { Modal, PageH, dayLabel, money, today, useCompany } from '../ui';

export function useCo() {
  const { member } = useSession();
  const c = member!.company_id;
  const company = useCompany(c);
  const owner = member!.role === 'owner';
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState('');
  const save = async (row: Record<string, unknown>, msg = 'Saved') => {
    setErr('');
    try { check(await supabase.from('companies').update(row).eq('id', c)); setSaved(msg); setTimeout(() => setSaved(''), 1800); return true; } catch (e) { setErr((e as Error).message); return false; }
  };
  const saveSettings = (patch: Record<string, unknown>, msg?: string) => save({ settings: { ...(company?.settings ?? {}), ...patch } }, msg);
  return { member: member!, company, owner, err, saved, save, saveSettings, mgr: isManager(member) };
}
export const Msg = ({ err, saved }: { err: string; saved: string }) => <>{err && <div className="err">{err}</div>}{saved && <div className="s" role="status" style={{ fontWeight: 700, color: 'var(--ok)' }}>✓ {saved}</div>}</>;

const GROUPS: [string, [string, string, string][]][] = [
  ['Company', [['/account', 'Account & preferences', 'Company name, phone, license, invoice message, tax rate'], ['/billing', 'Bank & payouts', 'Your Cydras plan and card payments'], ['/docs', 'Documents', 'Licenses and insurance with expiry reminders']]],
  ['Team', [['/team', 'Team & permissions', 'Add people, invite codes, pay, who can do what'], ['/timesheets', 'Timesheets', 'Approve hours, fix times with a reason']]],
  ['Jobs', [['/cats', 'Categories & job types', 'Color tags and quick buttons for booking'], ['/checklists', 'Checklists', 'Steps techs check off'], ['/sheets', 'Count sheets', 'Add up estimates by counting vents and units'], ['/pricebook', 'Price book', 'Prices for every task and your materials list']]],
  ['Texts & alerts', [['/settings', 'Alerts & settings', 'Automatic texts to customers and alerts to you']]],
  ['Parts', [['/shopinv', 'Shop inventory', 'Parts in the shop'], ['/techinv', 'Tech inventory', 'What is on each truck'], ['/supply', 'Supply houses', 'Distributors, account numbers and hours']]],
];
export function AllSettings() {
  const [q, setQ] = useState('');
  const G = GROUPS.map(([h, L]) => [h, L.filter((x) => !q || `${x[1]} ${x[2]}`.toLowerCase().includes(q.toLowerCase()))] as const).filter((g) => g[1].length);
  return (
    <>
      <PageH eyebrow="Set up" title="Settings" right={<input className="inp" style={{ width: 'min(360px,100%)' }} placeholder="Search settings, like texts or bank" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search settings" />} />
      {G.length ? <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>{G.map(([h, L]) => <div key={h} className="card"><h3>{h}</h3>
        {L.map(([to, t, d]) => <Link key={to} to={to} className="prow" style={{ color: 'inherit', textDecoration: 'none' }}><span className="t"><b>{t}</b><br /><span className="s">{d}</span></span><span aria-hidden="true">›</span></Link>)}</div>)}</div>
        : <div className="empty">Nothing matches. Try texts, bank, prices, or team.</div>}
    </>
  );
}

const PREFROWS: [string, [string, string][]][] = [
  ['Alerts to you', [['nNew', 'New appointments booked'], ['nResched', 'Reschedules'], ['nNoShow', 'No-shows'], ['nCancel', 'Cancellations'], ['nTexts', 'New customer texts']]],
  ['Texts to customers', [['mConfirm', 'Booking confirmation'], ['mResched', 'Time changed'], ['mOnWay', 'Tech is on the way'], ['mReceipt', 'Receipt after payment']]],
];
export function Alerts() {
  const { company, owner, err, saved, saveSettings } = useCo();
  if (!company) return <div className="s">Loading…</div>;
  const prefs = { nNew: true, nResched: true, nNoShow: true, nCancel: true, nTexts: true, mConfirm: true, mResched: true, mOnWay: true, mReceipt: true, winH: 2, ...(company.settings?.prefs ?? {}) };
  const set = (k: string, v: unknown) => saveSettings({ prefs: { ...prefs, [k]: v } }, 'Saved');
  return (
    <>
      <PageH eyebrow="Set up" title="Alerts & settings" />
      <Msg err={err} saved={saved} />
      {!owner && <p className="s lock" style={{ margin: 0 }}>Only the owner changes these.</p>}
      <div className="grid g2">{PREFROWS.map(([h, rows]) => <div key={h} className="card"><h3>{h}</h3>
        {h === 'Alerts to you' ? <p className="s" style={{ margin: 0 }}>Each one is separate. Turn off no-shows and reschedules and still get new bookings.</p> : <p className="s" style={{ margin: 0 }}>Only sent to customers who agreed to texts. They can reply STOP anytime.</p>}
        {rows.map(([k, l]) => <label key={k} className="prow" style={{ cursor: owner ? 'pointer' : undefined }}><span className="t">{l}</span><input type="checkbox" className="sw" disabled={!owner} checked={!!(prefs as any)[k]} onChange={(e) => set(k, e.target.checked)} aria-label={l} /></label>)}</div>)}
        <div className="card"><h3>Booking</h3><label className="field">Default arrival window<select disabled={!owner} value={prefs.winH} onChange={(e) => set('winH', +e.target.value)}>{[1, 2, 3, 4].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}</select></label></div>
      </div>
    </>
  );
}

export function Account() {
  const { company, owner, err, saved, save, member } = useCo();
  const [f, setF] = useState<any>(null);
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('cyd_theme') || 'system'; } catch { return 'system'; } });
  useEffect(() => { if (company && !f) setF({ name: company.name ?? '', phone: company.phone ?? '', email: company.email ?? '', license: company.license ?? '', invoice_message: company.invoice_message ?? '', tax: String(Number(company.tax_rate ?? 0.07) * 100) }); }, [company, f]);
  useEffect(() => { try { localStorage.setItem('cyd_theme', theme); } catch { /* ignore */ } if (theme === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', theme); }, [theme]);
  if (!company || !f) return <div className="s">Loading…</div>;
  return (
    <>
      <PageH eyebrow="Set up" title="Account & preferences" />
      <Msg err={err} saved={saved} />
      <div className="grid g2">
        <div className="card"><h3>Company</h3><div className="form">
          {([['name', 'Company name'], ['phone', 'Phone'], ['email', 'Email'], ['license', 'Contractor license #']] as const).map(([k, l]) => <label key={k} className="field">{l}<input value={f[k]} disabled={!owner} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
          <label className="field">Sales tax (%)<input inputMode="decimal" value={f.tax} disabled={!owner} onChange={(e) => setF({ ...f, tax: e.target.value })} /></label>
          <label className="field full">Message on every invoice<textarea value={f.invoice_message} disabled={!owner} onChange={(e) => setF({ ...f, invoice_message: e.target.value })} /></label></div>
          {owner ? <div><button className="btn pri" onClick={() => { const t = Number(f.tax); if (!f.name.trim() || !(t >= 0 && t < 30)) return; save({ name: f.name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null, license: f.license.trim() || null, invoice_message: f.invoice_message, tax_rate: t / 100 }); }}>Save</button></div>
            : <p className="s lock" style={{ margin: 0 }}>Only the owner changes company info.</p>}
        </div>
        <div className="card"><h3>Preferences</h3><b>Look</b>
          <div className="seg" role="group" aria-label="Look">{[['system', 'Computer setting'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => <button key={k} aria-pressed={theme === k} onClick={() => setTheme(k)}>{l}</button>)}</div>
          <span className="s">This only changes this computer.</span>
          <div className="dsp"><div className="k">Signed in as</div><div>{member.name}</div><div className="k">Trade</div><div>HVAC</div><div className="k">Plan</div><div><Link to="/billing">See your plan →</Link></div></div>
        </div>
      </div>
    </>
  );
}

type Dist = { id: string; name: string; phone: string; addr: string; hours: string; carries: string; acct: string; notes: string; fav?: boolean };
export function Supply() {
  const { company, owner, err, saved, saveSettings, member } = useCo();
  const [ed, setEd] = useState<Dist | null>(null);
  if (!company) return <div className="s">Loading…</div>;
  const see = owner || !!member.perms?.acctnums;
  const L: Dist[] = company.settings?.suppliers ?? [];
  return (
    <>
      <PageH eyebrow="Set up" title="Supply houses" right={owner && <button className="btn pri" onClick={() => setEd({ id: 'd' + Date.now(), name: '', phone: '', addr: '', hours: '', carries: '', acct: '', notes: '' })}>+ Add supply house</button>} />
      <Msg err={err} saved={saved} />
      <div className="grid g2">{L.map((d) => <div key={d.id} className="card"><div className="cardh"><h3>{d.fav ? '★ ' : ''}{d.name}</h3>{owner && <button className="btn sm" onClick={() => setEd(d)}>✎ Edit</button>}</div>
        <span className="s">{[d.addr, d.hours].filter(Boolean).join(' · ')}</span>{d.carries && <span>{d.carries}</span>}
        <div className="row wrap">{d.phone && <span className="btn sm mono">📞 {d.phone}</span>}{d.addr && <a className="btn sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(d.name + ' ' + d.addr)}`}>📍 Directions</a>}</div>
        <div className="pnote"><b>Account #</b> {see ? (d.acct ? <span className="mono">{d.acct}</span> : <span className="s">Not added</span>) : <span className="s lock">Hidden for your role</span>}{see && d.notes ? <div className="s">{d.notes}</div> : null}</div></div>)}
        {!L.length && <div className="empty">No supply houses yet.{owner ? ' Tap + Add supply house.' : ''}</div>}</div>
      {ed && <Modal title={L.some((x) => x.id === ed.id) ? 'Edit supply house' : 'Add supply house'} onClose={() => setEd(null)} onSave={() => { if (!ed.name.trim()) return; saveSettings({ suppliers: L.some((x) => x.id === ed.id) ? L.map((x) => (x.id === ed.id ? ed : x)) : [...L, ed] }); setEd(null); }}>
        <div className="form">{([['name', 'Name'], ['phone', 'Phone'], ['addr', 'Address'], ['hours', 'Hours'], ['carries', 'Carries'], ['acct', 'Account number'], ['notes', 'Account notes']] as const).map(([k, l]) =>
          <label key={k} className={`field${k === 'addr' || k === 'notes' ? ' full' : ''}`}>{l}<input value={ed[k]} onChange={(e) => setEd({ ...ed, [k]: e.target.value })} /></label>)}</div>
        <label className="row" style={{ fontWeight: 500 }}><input type="checkbox" style={{ width: 18, height: 18 }} checked={!!ed.fav} onChange={(e) => setEd({ ...ed, fav: e.target.checked })} />★ Favorite (shows first for techs)</label>
        {L.some((x) => x.id === ed.id) && <div><button className="btn sm danger" onClick={() => { saveSettings({ suppliers: L.filter((x) => x.id !== ed.id) }); setEd(null); }}>Remove</button></div>}
      </Modal>}
    </>
  );
}

const DOCCATS = ['Insurance', 'License', 'Tax', 'Vehicles', 'Contracts', 'Other'];
type Doc = { id: string; name: string; cat: string; num: string; exp: string };
const daysTo = (d: string) => Math.ceil((new Date(d + 'T12:00').getTime() - new Date(today() + 'T12:00').getTime()) / 86400000);
export function Docs() {
  const { company, owner, err, saved, saveSettings } = useCo();
  const [ed, setEd] = useState<Doc | null>(null);
  const [q, setQ] = useState('');
  if (!company) return <div className="s">Loading…</div>;
  const D: Doc[] = company.settings?.docs ?? [];
  const L = D.filter((d) => !q || `${d.name} ${d.cat} ${d.num}`.toLowerCase().includes(q.toLowerCase()));
  const soon = D.filter((d) => d.exp && daysTo(d.exp) <= 30);
  const stt = (d: Doc) => !d.exp ? <span className="pill p-sched">No expiration</span> : daysTo(d.exp) < 0 ? <span className="pill p-bad">Expired</span> : daysTo(d.exp) <= 30 ? <span className="pill p-warn">Expires in {daysTo(d.exp)} days</span> : <span className="pill p-done">Good until {dayLabel(d.exp)}</span>;
  return (
    <>
      <PageH eyebrow="Set up" title="Documents" right={owner && <button className="btn pri" onClick={() => setEd({ id: 'doc' + Date.now(), name: '', cat: 'Insurance', num: '', exp: '' })}>+ Add document</button>} />
      <Msg err={err} saved={saved} />
      {soon.map((d) => <div key={d.id} className="alert" style={{ borderColor: 'var(--warn)' }}><span className="dot" style={{ background: 'var(--warn)' }} /><span style={{ flex: 1 }}><b>{d.name}</b> {daysTo(d.exp) < 0 ? 'expired' : `expires in ${daysTo(d.exp)} days`}. Renew it and update the date.</span></div>)}
      <input className="inp" style={{ maxWidth: 360 }} placeholder="Search documents" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="grid g2">{DOCCATS.map((cat) => { const ds = L.filter((d) => d.cat === cat); return ds.length ? <div key={cat} className="card"><h3>{cat}</h3>
        {ds.map((d) => <div key={d.id} className="prow"><div className="t"><b>{d.name}</b><br /><span className="s mono">{d.num}</span></div>{stt(d)}{owner && <button className="btn sm" onClick={() => setEd(d)}>✎</button>}</div>)}</div> : null; })}
        {!D.length && <div className="empty">Keep your license, insurance and vehicle papers here. Cydras warns you 30 days before anything expires.</div>}</div>
      {ed && <Modal title={D.some((x) => x.id === ed.id) ? 'Edit document' : 'Add document'} onClose={() => setEd(null)} onSave={() => { if (!ed.name.trim()) return; saveSettings({ docs: D.some((x) => x.id === ed.id) ? D.map((x) => (x.id === ed.id ? ed : x)) : [...D, ed] }); setEd(null); }}>
        <div className="form"><label className="field full">Name<input value={ed.name} placeholder="General liability insurance" onChange={(e) => setEd({ ...ed, name: e.target.value })} /></label>
          <label className="field">Type<select value={ed.cat} onChange={(e) => setEd({ ...ed, cat: e.target.value })}>{DOCCATS.map((x) => <option key={x}>{x}</option>)}</select></label>
          <label className="field">Number<input value={ed.num} placeholder="Policy or license #" onChange={(e) => setEd({ ...ed, num: e.target.value })} /></label>
          <label className="field">Expires (optional)<input type="date" value={ed.exp} onChange={(e) => setEd({ ...ed, exp: e.target.value })} /></label></div>
        <span className="s">Attaching the PDF or photo comes with file storage, next.</span>
        {D.some((x) => x.id === ed.id) && <div><button className="btn sm danger" onClick={() => { saveSettings({ docs: D.filter((x) => x.id !== ed.id) }); setEd(null); }}>Remove</button></div>}
      </Modal>}
    </>
  );
}

type Sheet = { id: string; name: string; items: { n: string; p: number; k: 'num' | 'yn' }[] };
export function Sheets() {
  const { company, owner, mgr, err, saved, saveSettings } = useCo();
  const [ed, setEd] = useState<Sheet | null>(null);
  if (!company) return <div className="s">Loading…</div>;
  const L: Sheet[] = company.settings?.sheets ?? [];
  return (
    <>
      <PageH eyebrow="Set up" title="Estimate count sheets" right={owner && <button className="btn pri" onClick={() => setEd({ id: 's' + Date.now(), name: '', items: [{ n: '', p: 0, k: 'num' }] })}>+ New count sheet</button>} />
      <p className="s" style={{ margin: 0 }}>Count things on site, like vents and units, and the estimate adds itself up. {!owner && mgr ? 'Only the owner changes these.' : ''}</p>
      <Msg err={err} saved={saved} />
      <div className="grid g2">{L.map((c) => <div key={c.id} className="card"><div className="cardh"><h3>{c.name}</h3>{owner && <button className="btn sm" onClick={() => setEd(c)}>✎ Edit</button>}</div>
        {c.items.map((it, i) => <div key={i} className="row" style={{ fontSize: 14 }}><span style={{ flex: 1 }}>{it.n}</span><span className="pill p-sched">{it.k === 'yn' ? 'Yes / No' : 'Count'}</span><span className="mono">{money(it.p)}{it.k === 'num' ? ' ea' : ''}</span></div>)}</div>)}
        {!L.length && <div className="empty">No count sheets yet. Make one for duct cleaning or installs.</div>}</div>
      {ed && <Modal title={L.some((x) => x.id === ed.id) ? 'Edit count sheet' : 'New count sheet'} saveLabel="Save count sheet" onClose={() => setEd(null)} onSave={() => {
        const items = ed.items.filter((i) => i.n.trim()).map((i) => ({ ...i, n: i.n.trim(), p: Number(i.p) || 0 })); if (!ed.name.trim() || !items.length) return;
        const v = { ...ed, name: ed.name.trim(), items }; saveSettings({ sheets: L.some((x) => x.id === ed.id) ? L.map((x) => (x.id === ed.id ? v : x)) : [...L, v] }); setEd(null); }}>
        <label className="field">Name<input value={ed.name} placeholder="Duct cleaning, Install, Dryer vent…" onChange={(e) => setEd({ ...ed, name: e.target.value })} /></label>
        <b>Items to count</b>
        {ed.items.map((it, i) => <div key={i} className="row wrap"><input className="inp" style={{ flex: '1 1 200px' }} value={it.n} placeholder="Supply vents" onChange={(e) => setEd({ ...ed, items: ed.items.map((y, k) => (k === i ? { ...y, n: e.target.value } : y)) })} />
          <label className="row s" style={{ gap: 6 }}>$<input className="inp" style={{ width: 100 }} inputMode="decimal" value={String(it.p)} onChange={(e) => setEd({ ...ed, items: ed.items.map((y, k) => (k === i ? { ...y, p: e.target.value as any } : y)) })} /></label>
          <div className="seg" role="group">{([['num', 'Count it'], ['yn', 'Yes / No']] as const).map(([k, l]) => <button key={k} aria-pressed={it.k === k} onClick={() => setEd({ ...ed, items: ed.items.map((y, z) => (z === i ? { ...y, k } : y)) })}>{l}</button>)}</div>
          <button className="lnk" onClick={() => setEd({ ...ed, items: ed.items.filter((_, z) => z !== i) })}>✕</button></div>)}
        <div><button className="btn sm" onClick={() => setEd({ ...ed, items: [...ed.items, { n: '', p: 0, k: 'num' }] })}>+ Add item</button></div>
        {L.some((x) => x.id === ed.id) && <div><button className="btn sm danger" onClick={() => { saveSettings({ sheets: L.filter((x) => x.id !== ed.id) }); setEd(null); }}>Delete</button></div>}
      </Modal>}
    </>
  );
}

export function Help() {
  return (
    <>
      <PageH eyebrow="Help" title="Help & support" />
      <div className="grid g2">
        <div className="card"><h3>Talk to a person</h3><p style={{ margin: 0 }}>Text or call 7 AM to 7 PM, Monday to Saturday. We answer in English and Spanish.</p><span className="s">Support phone and email go here once Cydras has its business line.</span></div>
        <div className="card"><h3>How-to</h3>
          {[['Book a job', '/jobs?new=1'], ['Move a job on the dispatch board', '/dispatch'], ['Add a tech with an invite code', '/team'], ['Load your prices', '/pricebook'], ['Connect your bank for card payments', '/billing']].map(([t, to]) => <Link key={to} to={to} className="prow" style={{ color: 'inherit', textDecoration: 'none' }}><span className="t">{t}</span><span aria-hidden="true">›</span></Link>)}</div>
      </div>
    </>
  );
}

export function Refer() {
  const { company } = useCo();
  const code = (company?.name ?? 'CYDRAS').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16);
  const link = `https://cydras.vercel.app/signup?ref=${code}`;
  const [copied, setCopied] = useState(false);
  return (
    <>
      <PageH eyebrow="Help" title="Refer a friend" />
      <div className="card" style={{ maxWidth: 640 }}><h2>Give a month, get a month</h2><p style={{ margin: 0 }}>When another shop signs up with your link and stays past the trial, you both get a free month.</p>
        <div style={{ font: '700 30px var(--mono)', letterSpacing: '.06em' }}>{code}</div>
        <div className="row"><input className="inp mono" readOnly value={link} /><button className="btn pri" onClick={async () => { try { await navigator.clipboard.writeText(link); setCopied(true); } catch { /* select instead */ } }}>{copied ? 'Copied' : 'Copy link'}</button></div>
        <span className="s">Free months are added by hand for now while the referral program starts.</span></div>
    </>
  );
}

export function Legal() {
  return (
    <>
      <PageH eyebrow="Help" title="About & legal" />
      <div className="card"><div className="dsp"><div className="k">App</div><div>Cydras Office</div><div className="k">Made for</div><div>HVAC shops</div></div>
        <p className="s" style={{ margin: 0 }}>Terms of Service, Privacy Policy, texting rules and payment rules are being reviewed by a lawyer before Cydras opens to other shops. They will be posted here.</p></div>
    </>
  );
}
