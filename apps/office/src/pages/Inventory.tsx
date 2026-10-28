// Shop inventory and Tech inventory, like the mockup. Trucks are filled from the shop.
// Only people with the "Add parts to trucks" permission (owner and supervisors by default) can change stock.
import { useState } from 'react';
import { supabase, check } from '../supabase';
import { useSession } from '../session';
import { useLive } from '../live';
import { Modal, PageH, money } from '../ui';

function useInventory() {
  const { member } = useSession();
  const c = member!.company_id;
  const canInv = member!.role === 'owner' || !!member!.perms?.inventory;
  const live = useLive(async () => {
    const locs = check(await supabase.from('stock_locations').select('id, name, kind, member_id').eq('company_id', c).is('deleted_at', null).order('name')) as any[];
    const parts = check(await supabase.from('parts').select('*').eq('company_id', c).is('deleted_at', null).order('name')) as any[];
    const stock = check(await supabase.from('stock').select('*').eq('company_id', c)) as any[];
    const people = check(await supabase.from('members').select('id, name, role').eq('company_id', c).eq('active', true).order('name')) as any[];
    return { locs, parts, stock, people };
  }, ['stock', 'parts', 'stock_locations'], c, [c]);
  return { c, canInv, ...live };
}
const qtyAt = (stock: any[], loc?: string, part?: string) => stock.find((s) => s.location_id === loc && s.part_id === part) ?? null;

export function ShopInventory() {
  const { c, canInv, data, reload } = useInventory();
  const [q, setQ] = useState('');
  const [add, setAdd] = useState<any | null>(null);
  const [send, setSend] = useState<any | null>(null);
  const [err, setErr] = useState('');
  if (!data) return <div className="s">Loading…</div>;
  const shop = data.locs.find((l) => l.kind === 'shop');
  const trucks = data.locs.filter((l) => l.kind === 'truck');
  const run = async (f: () => Promise<unknown>) => { setErr(''); try { await f(); reload(); return true; } catch (e) { setErr((e as Error).message); return false; } };
  const list = data.parts.filter((p) => `${p.name} ${p.part_number ?? ''} ${p.supplier ?? ''}`.toLowerCase().includes(q.toLowerCase()));
  const low = data.parts.filter((p) => { const s = qtyAt(data.stock, shop?.id, p.id); return s && s.qty <= s.min_qty; });
  return (
    <>
      <PageH eyebrow="Inventory" title="Shop inventory" right={canInv && <button className="btn pri" onClick={() => setAdd({ name: '', part_number: '', cost: '', supplier: '', qty: '', min: '1' })}>+ New part</button>} />
      <p className="s" style={{ margin: 0 }}>Everything in the shop. Trucks are stocked from here: tap <b>Send to truck</b>. {!canInv && 'Only the owner and supervisors can change stock.'}</p>
      {err && <div className="err">{err}</div>}
      <div className="grid g4">
        <div className="card kpi"><span className="eyebrow">Parts</span><b>{data.parts.length}</b></div>
        <div className="card kpi"><span className="eyebrow">Value in the shop</span><b>{money(data.parts.reduce((a, p) => a + Number(p.cost) * (qtyAt(data.stock, shop?.id, p.id)?.qty ?? 0), 0))}</b></div>
        <div className="card kpi"><span className="eyebrow">Running low</span><b style={{ color: low.length ? 'var(--bad)' : undefined }}>{low.length}</b><span className="s">{low.length ? 'Reorder soon' : 'All stocked'}</span></div>
        <div className="card kpi"><span className="eyebrow">Trucks</span><b>{trucks.length}</b></div>
      </div>
      <input className="inp" style={{ maxWidth: 360 }} placeholder="Search parts" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card"><div className="tscroll"><table className="tbl"><thead><tr><th>Part</th><th>Part #</th><th>Supplier</th><th className="r">Cost</th><th className="r">In shop</th><th className="r">Min</th><th /></tr></thead><tbody>
        {list.map((p) => { const s = qtyAt(data.stock, shop?.id, p.id); const isLow = s && s.qty <= s.min_qty; return <tr key={p.id}>
          <td><b>{p.name}</b></td><td className="mono">{p.part_number ?? '—'}</td><td className="s">{p.supplier ?? '—'}</td><td className="r mono">{money(Number(p.cost))}</td>
          <td className="r mono">{s?.qty ?? 0}{isLow ? <span className="pill p-bad"> Low</span> : null}</td><td className="r mono">{s?.min_qty ?? 0}</td>
          <td className="r">{canInv && <div className="row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn sm" onClick={() => setAdd({ id: p.id, name: p.name, part_number: p.part_number ?? '', cost: String(p.cost), supplier: p.supplier ?? '', qty: String(s?.qty ?? 0), min: String(s?.min_qty ?? 1) })}>✎</button>
            <button className="btn sm" disabled={!trucks.length || !(s?.qty > 0)} onClick={() => setSend({ part: p, have: s?.qty ?? 0, to: trucks[0]?.id, qty: '1' })}>Send to truck</button></div>}</td></tr>; })}
        {!list.length && <tr><td colSpan={7}><div className="empty">{data.parts.length ? 'No parts match.' : 'No parts yet. Tap + New part to add what you keep in the shop.'}</div></td></tr>}
      </tbody></table></div></div>
      {add && <Modal title={add.id ? 'Edit part' : 'New part'} onClose={() => setAdd(null)} onSave={() => run(async () => {
        if (!add.name.trim()) throw new Error('Type the part name.');
        let shopId = shop?.id;
        if (!shopId) shopId = (check(await supabase.from('stock_locations').insert({ company_id: c, name: 'Shop', kind: 'shop' }).select('id').single()) as any).id;
        const row = { name: add.name.trim(), part_number: add.part_number.trim() || null, cost: Number(add.cost) || 0, supplier: add.supplier.trim() || null };
        const pid = add.id ?? (check(await supabase.from('parts').insert({ ...row, company_id: c }).select('id').single()) as any).id;
        if (add.id) check(await supabase.from('parts').update(row).eq('id', add.id));
        check(await supabase.from('stock').upsert({ location_id: shopId, part_id: pid, company_id: c, qty: Math.max(0, Math.floor(Number(add.qty) || 0)), min_qty: Math.max(0, Math.floor(Number(add.min) || 0)) }));
        setAdd(null);
      })}>
        <div className="form"><label className="field full">Part<input value={add.name} placeholder="Capacitor 45/5 MFD" onChange={(e) => setAdd({ ...add, name: e.target.value })} /></label>
          <label className="field">Part #<input value={add.part_number} onChange={(e) => setAdd({ ...add, part_number: e.target.value })} /></label>
          <label className="field">Supplier<input value={add.supplier} placeholder="Tropic Supply" onChange={(e) => setAdd({ ...add, supplier: e.target.value })} /></label>
          <label className="field">Your cost ($)<input inputMode="decimal" value={add.cost} onChange={(e) => setAdd({ ...add, cost: e.target.value })} /></label>
          <label className="field">How many in the shop<input inputMode="numeric" value={add.qty} onChange={(e) => setAdd({ ...add, qty: e.target.value })} /></label>
          <label className="field">Warn me when it gets to<input inputMode="numeric" value={add.min} onChange={(e) => setAdd({ ...add, min: e.target.value })} /></label></div>
        {add.id && <div><button className="btn sm danger" onClick={() => run(async () => { check(await supabase.from('parts').update({ deleted_at: new Date().toISOString() }).eq('id', add.id)); setAdd(null); })}>Delete part</button></div>}
      </Modal>}
      {send && <Modal title={`Send ${send.part.name}`} saveLabel="Send to truck" onClose={() => setSend(null)} onSave={() => run(async () => { check(await supabase.rpc('move_stock', { p_from: shop!.id, p_to: send.to, p_part: send.part.id, p_qty: Math.floor(Number(send.qty) || 0) })); setSend(null); })}>
        <span className="s">{send.have} in the shop. It comes out of the shop and goes on the truck.</span>
        <div className="form"><label className="field">Truck<select value={send.to} onChange={(e) => setSend({ ...send, to: e.target.value })}>{trucks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
          <label className="field">How many<input inputMode="numeric" value={send.qty} onChange={(e) => setSend({ ...send, qty: e.target.value })} /></label></div>
      </Modal>}
    </>
  );
}

export function TechInventory() {
  const { c, canInv, data, reload } = useInventory();
  const [sel, setSel] = useState('');
  const [add, setAdd] = useState<any | null>(null);
  const [newTruck, setNewTruck] = useState<any | null>(null);
  const [err, setErr] = useState('');
  if (!data) return <div className="s">Loading…</div>;
  const shop = data.locs.find((l) => l.kind === 'shop');
  const trucks = data.locs.filter((l) => l.kind === 'truck');
  const truck = trucks.find((t) => t.id === sel) ?? trucks[0];
  const run = async (f: () => Promise<unknown>) => { setErr(''); try { await f(); reload(); return true; } catch (e) { setErr((e as Error).message); return false; } };
  const onTruck = truck ? data.stock.filter((s) => s.location_id === truck.id && s.qty > 0) : [];
  const partOf = (id: string) => data.parts.find((p) => p.id === id);
  const lowCount = (t: any) => data.stock.filter((s) => s.location_id === t.id && s.qty <= s.min_qty && s.min_qty > 0).length;
  const noTruck = data.people.filter((p) => !trucks.some((t) => t.member_id === p.id));
  return (
    <>
      <PageH eyebrow="Inventory" title="Tech inventory" right={canInv && noTruck.length > 0 && <button className="btn" onClick={() => setNewTruck({ member: noTruck[0].id })}>+ Add truck</button>} />
      {err && <div className="err">{err}</div>}
      {!trucks.length ? <div className="empty">No trucks yet. {canInv ? 'Tap + Add truck to give a tech their truck.' : ''}</div> : <>
        <div className="seg" role="group" aria-label="Truck">{trucks.map((t) => <button key={t.id} aria-pressed={truck?.id === t.id} onClick={() => setSel(t.id)}>{t.name}{lowCount(t) ? ` · ${lowCount(t)} low` : ''}</button>)}</div>
        <div className="card"><div className="cardh"><h2>{truck?.name}</h2>{canInv && shop && <button className="btn sm pri" onClick={() => setAdd({ part: '', qty: '1' })}>+ Add from shop</button>}</div>
          <span className="s">Parts come out of the shop when you add them. When a tech uses a part on a job, it comes off the truck.</span>
          <div className="tscroll"><table className="tbl"><thead><tr><th>Part</th><th className="r">On truck</th><th className="r">Min</th><th /></tr></thead><tbody>
            {onTruck.map((s) => { const p = partOf(s.part_id); return <tr key={s.part_id}><td><b>{p?.name}</b><br /><span className="s mono">{p?.part_number}</span></td>
              <td className="r mono">{s.qty}{s.qty <= s.min_qty && s.min_qty > 0 ? <span className="pill p-bad"> Low</span> : null}</td><td className="r mono">{s.min_qty}</td>
              <td className="r">{canInv && shop && <button className="btn sm" onClick={() => run(async () => check(await supabase.rpc('move_stock', { p_from: truck.id, p_to: shop.id, p_part: s.part_id, p_qty: 1 })))}>Return 1 to shop</button>}</td></tr>; })}
            {!onTruck.length && <tr><td colSpan={4}><div className="empty">This truck is empty.</div></td></tr>}
          </tbody></table></div></div></>}
      {add && truck && shop && <Modal title={`Add to ${truck.name}`} saveLabel="Add to truck" onClose={() => setAdd(null)} onSave={() => run(async () => { if (!add.part) throw new Error('Pick a part.'); check(await supabase.rpc('move_stock', { p_from: shop.id, p_to: truck.id, p_part: add.part, p_qty: Math.floor(Number(add.qty) || 0) })); setAdd(null); })}>
        <div className="form"><label className="field full">Part (from the shop)<select value={add.part} onChange={(e) => setAdd({ ...add, part: e.target.value })}><option value="">Pick one…</option>
          {data.parts.map((p) => { const s = qtyAt(data.stock, shop.id, p.id); return <option key={p.id} value={p.id} disabled={!(s?.qty > 0)}>{p.name} · {s?.qty ?? 0} in shop</option>; })}</select></label>
          <label className="field">How many<input inputMode="numeric" value={add.qty} onChange={(e) => setAdd({ ...add, qty: e.target.value })} /></label></div>
      </Modal>}
      {newTruck && <Modal title="Add a truck" onClose={() => setNewTruck(null)} onSave={() => run(async () => { const m = data.people.find((p) => p.id === newTruck.member); check(await supabase.from('stock_locations').insert({ company_id: c, kind: 'truck', member_id: newTruck.member, name: `${m?.name.split(' ')[0]}'s truck` })); setNewTruck(null); })}>
        <label className="field">Whose truck<select value={newTruck.member} onChange={(e) => setNewTruck({ member: e.target.value })}>{noTruck.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      </Modal>}
    </>
  );
}
