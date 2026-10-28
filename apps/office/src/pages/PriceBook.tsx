// Price book, like the mockup: A to Z with Residential, Commercial and After-hours prices, plus the materials list.
import { useState } from 'react';
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { Modal, PageH, money, useCompany } from '../ui';
import { STARTER_ITEMS, STARTER_MATS } from '../starter';

export const TIERS: [string, string][] = [['res', 'Residential'], ['com', 'Commercial'], ['ah', 'After hours']];

export function PriceBook() {
  const { member } = useSession();
  const c = member!.company_id;
  const ed = member!.role === 'owner' || !!member!.perms?.pricebook;
  const company = useCompany(c);
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<any | null>(null);
  const [mat, setMat] = useState<{ i: number; v: [string, string, number] } | null>(null);
  const [err, setErr] = useState('');
  const { data, reload } = useLive(async () => check(await supabase.from('price_items').select('*').eq('company_id', c).is('deleted_at', null).order('name')) as any[], ['price_items'], c, [c]);
  const mats: [string, string, number][] = company?.settings?.materials ?? [];
  const run = async (f: () => Promise<unknown>) => { setErr(''); try { await f(); reload(); return true; } catch (e) { setErr((e as Error).message); return false; } };
  const saveMats = (m: [string, string, number][]) => run(async () => check(await supabase.from('companies').update({ settings: { ...(company?.settings ?? {}), materials: m } }).eq('id', c)));
  const list = (data ?? []).filter((p) => `${p.name} ${p.category}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <>
      <PageH eyebrow="Price book" title="A to Z" right={ed ? <button className="btn pri" onClick={() => setEdit({ name: '', category: '', unit: '', prices: {} })}>+ New item</button> : <span className="s">Only people allowed to edit the price book can change it.</span>} />
      {err && <div className="err">{err}</div>}
      {data && !data.length && ed && <div className="card" style={{ borderColor: 'var(--accent)' }}><h3>Start with common HVAC prices?</h3>
        <span className="s">Loads {STARTER_ITEMS.length} items (diagnostic, capacitor, contactor, motors, refrigerant, PM visit…) and {STARTER_MATS.length} materials. Change any price after.</span>
        <div><button className="btn pri" onClick={() => run(async () => { check(await supabase.from('price_items').insert(STARTER_ITEMS.map((x) => ({ ...x, company_id: c })))); if (!mats.length) await saveMats(STARTER_MATS); })}>Load starter prices</button></div></div>}
      <input className="inp" style={{ maxWidth: 360 }} placeholder="Search items" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card"><div className="tscroll"><table className="tbl"><thead><tr><th>Item</th><th>Group</th>{TIERS.map((t) => <th key={t[0]} className="r">{t[1]}</th>)}<th /></tr></thead><tbody>
        {list.map((p) => <tr key={p.id} className={ed ? 'click' : ''} onClick={() => ed && setEdit(p)}><td><b>{p.name}</b>{p.unit ? <span className="s"> per {p.unit}</span> : null}</td><td className="s">{p.category}</td>
          {TIERS.map(([k]) => <td key={k} className="r mono">{p.prices?.[k] == null ? '—' : money(Number(p.prices[k]))}</td>)}<td className="r">{ed ? '✎' : ''}</td></tr>)}
        {data && !list.length && <tr><td colSpan={6}><div className="empty">{data.length ? 'Nothing matches.' : 'No prices yet.'}</div></td></tr>}
      </tbody></table></div></div>
      <div className="card"><div className="cardh"><h3>Materials list</h3><span className="s">What techs pick from when they add materials</span>{ed && <button className="btn sm" onClick={() => setMat({ i: -1, v: ['', 'ea', 0] })}>+ Add material</button>}</div>
        <div className="tscroll"><table className="tbl"><tbody>{mats.map((m, i) => <tr key={i} className={ed ? 'click' : ''} onClick={() => ed && setMat({ i, v: m })}><td>{m[0]}</td><td className="s">per {m[1]}</td><td className="r mono">{money(m[2])}</td></tr>)}
          {!mats.length && <tr><td><div className="empty">No materials yet.</div></td></tr>}</tbody></table></div></div>

      {edit && <ItemForm item={edit} onClose={() => setEdit(null)}
        onDelete={edit.id ? () => run(async () => { check(await supabase.from('price_items').update({ deleted_at: new Date().toISOString() }).eq('id', edit.id)); setEdit(null); }) : undefined}
        onSave={(v) => run(async () => { check(edit.id ? await supabase.from('price_items').update(v).eq('id', edit.id) : await supabase.from('price_items').insert({ ...v, company_id: c })); setEdit(null); })} />}
      {mat && <MatForm m={mat.v} onClose={() => setMat(null)}
        onDelete={mat.i >= 0 ? () => { saveMats(mats.filter((_, k) => k !== mat.i)); setMat(null); } : undefined}
        onSave={(v) => { saveMats(mat.i >= 0 ? mats.map((x, k) => (k === mat.i ? v : x)) : [...mats, v]); setMat(null); }} />}
    </>
  );
}

function ItemForm({ item, onClose, onSave, onDelete }: { item: any; onClose: () => void; onSave: (v: any) => void; onDelete?: () => void }) {
  const [v, setV] = useState({ name: item.name ?? '', category: item.category ?? '', unit: item.unit ?? '', p: Object.fromEntries(TIERS.map(([k]) => [k, item.prices?.[k] != null ? String(item.prices[k]) : ''])) as Record<string, string> });
  const [e, setE] = useState('');
  return <Modal title={item.id ? 'Edit price' : 'New price book item'} onClose={onClose} onSave={() => {
    if (!v.name.trim()) return setE('Type the item name.');
    const prices = Object.fromEntries(Object.entries(v.p).filter(([, x]) => x !== '').map(([k, x]) => [k, Number(x)]));
    if (Object.values(prices).some((x) => !(x >= 0))) return setE('Check the prices.');
    onSave({ name: v.name.trim(), category: v.category.trim() || 'Other', unit: v.unit.trim() || null, prices });
  }}>
    <div className="form"><label className="field full">Item<input value={v.name} onChange={(x) => setV({ ...v, name: x.target.value })} /></label>
      <label className="field">Group<input value={v.category} placeholder="Electrical, Motors…" onChange={(x) => setV({ ...v, category: x.target.value })} /></label>
      <label className="field">Unit (optional)<input value={v.unit} placeholder="lb, ft" onChange={(x) => setV({ ...v, unit: x.target.value })} /></label>
      {TIERS.map(([k, l]) => <label key={k} className="field">{l} ($)<input inputMode="decimal" value={v.p[k]} onChange={(x) => setV({ ...v, p: { ...v.p, [k]: x.target.value } })} /></label>)}</div>
    {onDelete && <div><button className="btn danger sm" onClick={onDelete}>Delete this item</button></div>}
    {e && <div className="err">{e}</div>}
  </Modal>;
}

function MatForm({ m, onClose, onSave, onDelete }: { m: [string, string, number]; onClose: () => void; onSave: (v: [string, string, number]) => void; onDelete?: () => void }) {
  const [v, setV] = useState({ n: m[0], u: m[1], p: String(m[2] || '') }); const [e, setE] = useState('');
  return <Modal title={m[0] ? 'Edit material' : 'Add material'} onClose={onClose} onSave={() => { if (!v.n.trim()) return setE('Type the material.'); if (!(Number(v.p) >= 0)) return setE('Check the price.'); onSave([v.n.trim(), v.u.trim() || 'ea', Number(v.p)]); }}>
    <div className="form"><label className="field full">Material<input value={v.n} onChange={(x) => setV({ ...v, n: x.target.value })} /></label>
      <label className="field">Per<input value={v.u} placeholder="ea, ft, lb" onChange={(x) => setV({ ...v, u: x.target.value })} /></label>
      <label className="field">Price ($)<input inputMode="decimal" value={v.p} onChange={(x) => setV({ ...v, p: x.target.value })} /></label></div>
    {onDelete && <div><button className="btn danger sm" onClick={onDelete}>Delete</button></div>}
    {e && <div className="err">{e}</div>}
  </Modal>;
}
