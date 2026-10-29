// One job, like the phone mockup: who/where/when, status steps, On my way → Start job → Finish,
// invoice (price book, truck parts, materials, discount), payment, estimate, checklist, photos,
// summary, private notes and visits. Works with no signal (except card payments, texts and photos).
import { useMemo, useState } from 'react';
import { Alert, Image, Linking, Pressable, Text, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { newId, totals, formatMoney } from '@cydras/core';
import { useSession, can, isManager } from '../../src/lib/session';
import { save, call, useRows, useSyncState } from '../../src/lib/sync';
import { supabase, callFunction } from '../../src/lib/supabase';
import { useTapToPay, sendPayLink } from '../../src/lib/tapToPay';
import { useCompany, fmtTime, fmtDay, dayKey, openMaps, useQuery, check, catColor } from '../../src/lib/data';
import { Screen, Card, H1, T, Eyebrow, SecHead, SmallBtn, Button, Field, Sheet, Line, Chips, Chip, Seg, StatusPill, Icon, Avatar } from '../../src/ui/kit';
import { CatTag } from '../../src/ui/jobs';
import { F, shadow, useT, useTheme } from '../../src/ui/theme';

const STEPS = [['scheduled', 'Scheduled'], ['on_the_way', 'On the way'], ['on_site', 'On site'], ['done', 'Done']] as const;
const NEXT: Record<string, { to: string; label: string }> = { scheduled: { to: 'on_the_way', label: 'On my way' }, on_the_way: { to: 'on_site', label: 'Start job' }, on_site: { to: 'done', label: 'Finish job' } };
const TIERS: [string, string][] = [['res', 'Residential'], ['com', 'Commercial'], ['ah', 'After hours']];
type SheetK = null | 'book' | 'parts' | 'line' | 'disc' | 'pay' | 'est' | 'check' | 'visit' | 'photos';

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useSession();
  const { online } = useSyncState();
  const t = useT();
  const { prefs } = useTheme();
  const company = useCompany();
  const job = useRows<any>('jobs', (j) => j.id === id, [id])[0];
  const rootId: string = job?.parent_job_id ?? id;
  const root = useRows<any>('jobs', (j) => j.id === rootId, [rootId])[0] ?? job;
  const visits = useRows<any>('jobs', (j) => j.id === rootId || j.parent_job_id === rootId, [rootId]).sort((a, b) => (a.visit_number ?? 1) - (b.visit_number ?? 1));
  const customer = useRows<any>('customers', (c) => c.id === job?.customer_id, [job?.customer_id])[0];
  const sites = useRows<any>('sites', (s) => s.customer_id === job?.customer_id, [job?.customer_id]);
  const site = sites.find((s) => s.id === job?.site_id) ?? sites.find((s) => s.is_primary) ?? sites[0];
  const phone = useRows<any>('customer_contacts', (c) => c.customer_id === job?.customer_id && c.kind === 'phone', [job?.customer_id]).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
  const asg = useRows<any>('job_assignments', (a) => a.job_id === id, [id]);
  const team = useRows<any>('members');
  const lines = useRows<any>('job_lines', (l) => l.job_id === rootId, [rootId]).sort((a, b) => a.position - b.position);
  const invoice = useRows<any>('invoices', (i) => i.job_id === rootId, [rootId])[0];
  const pays = useRows<any>('payments', (p) => p.job_id === rootId || (!!invoice && p.invoice_id === invoice.id), [rootId, invoice?.id]);
  const book = useRows<any>('price_items', (p) => p.active !== false);
  const myTruck = useRows<any>('stock_locations', (l) => l.kind === 'truck' && l.member_id === member?.id, [member?.id])[0];
  const truckStock = useRows<any>('stock', (s) => s.location_id === myTruck?.id && s.qty > 0, [myTruck?.id]);
  const parts = useRows<any>('parts');
  const checklists = useRows<any>('checklists');
  const jcl = useRows<any>('job_checklists', (x) => x.job_id === id, [id]);
  const units = useRows<any>('units', (u) => u.customer_id === job?.customer_id, [job?.customer_id]);
  const ests = useRows<any>('estimates', (e) => e.job_id === rootId, [rootId]);
  const [summary, setSummary] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[] | null>(null);
  const [sheet, setSheet] = useState<SheetK>(null);
  const [tier, setTier] = useState('res');
  const [f, setF] = useState<any>({});
  const [busy, setBusy] = useState(false);
  const tap = useTapToPay(member?.company_id ?? '');

  const showPrices = can(member, 'seePrices') && !(job?.hide_prices && !isManager(member));
  const tt = useMemo(() => totals(lines.map((l) => ({ price: Number(l.price), qty: Number(l.qty) })), Number(company?.tax_rate ?? 0.07), root?.discount ?? null,
    pays.map((p) => ({ amount: Number(p.amount), refunded_amount: Number(p.refunded_amount ?? 0), voided_at: p.voided_at, status: p.status }))), [lines, pays, company, root]);
  const $ = (n: number) => (showPrices ? formatMoney(n) : '$ ——');
  if (!job || !member) return <Screen><T s>Loading…</T></Screen>;

  const crew = asg.filter((a) => !a.deleted_at).map((a) => team.find((m) => m.id === a.member_id)).filter(Boolean);
  const next = job.parent_job_id && job.status === 'on_site' ? { to: 'done', label: 'Finish visit' } : NEXT[job.status];
  const stepIdx = Math.max(0, STEPS.findIndex(([k]) => k === job.status));
  const closed = job.status === 'done' || job.status === 'canceled';
  const notesAll = [...(site?.site_notes ?? []), ...(customer?.notes ?? [])] as string[];

  async function advance() {
    const now = new Date().toISOString();
    await save('jobs', { id: job.id, status: next.to, status_times: { ...(job.status_times ?? {}), [next.to]: now } });
    if (next.to === 'on_the_way') {
      if (!online) return Alert.alert('On the way', "No signal, so the customer wasn't texted. Call them if you need to.");
      try {
        await callFunction('send-sms', { company_id: member!.company_id, customer_id: job.customer_id, kind: 'on_my_way', body: `Hi, this is ${member!.name.split(' ')[0]} from ${company?.name ?? 'us'}. I'm on my way to you now.` });
      } catch (e) { Alert.alert('On the way', `The customer was not texted: ${(e as Error).message}`); }
    }
    if (next.to === 'done') await ensureInvoice();
  }
  async function ensureInvoice() {
    const row = { company_id: member!.company_id, customer_id: job.customer_id, job_id: rootId, subtotal: tt.sub - tt.off, tax: tt.tax, total: tt.total };
    if (invoice) { await save('invoices', { id: invoice.id, ...row }); return invoice.id as string; }
    const inv = newId(); await save('invoices', { id: inv, ...row }); return inv;
  }
  const addLine = async (l: Record<string, unknown>) => { await save('job_lines', { id: newId(), company_id: member!.company_id, job_id: rootId, qty: 1, kind: 'service', position: lines.length, ...l }); };
  async function addPart(s: any) {
    const p = parts.find((x) => x.id === s.part_id);
    await addLine({ description: p?.name ?? 'Part', price: Number(p?.price ?? p?.cost ?? 0), kind: 'part', part_sku: s.part_id });
    await call('use_part', { p_location: s.location_id, p_part: s.part_id, p_qty: 1 });
    setSheet(null);
  }
  async function cash(method: 'cash' | 'check' | 'zelle') {
    const inv = await ensureInvoice();
    await save('payments', { id: newId(), company_id: member!.company_id, invoice_id: inv, job_id: rootId, customer_id: job.customer_id, method, amount: tt.due, reference: f.ref?.trim() || null, status: 'succeeded', refunded_amount: 0 });
    setSheet(null); setF({});
    Alert.alert('Payment saved', `${formatMoney(tt.due)} by ${method}.`);
  }
  async function card() {
    if (!online) return Alert.alert('No signal', 'Card payments need signal. Take cash or check, or send a pay link later.');
    const ok = await tap.charge(await ensureInvoice());
    if (!ok) Alert.alert('Card not taken', tap.message);
  }
  async function link() {
    if (!online) return Alert.alert('No signal', 'Try again when you have signal.');
    try { const r = await sendPayLink(await ensureInvoice()); await Linking.openURL(r.url); } catch (e) { Alert.alert('Could not make a pay link', (e as Error).message); }
  }

  const tile = (icon: string, label: string, sub: string, k: SheetK) => <Pressable key={label} accessibilityRole="button" onPress={() => setSheet(k)} style={({ pressed }) => ({ flex: 1, minWidth: 0, minHeight: 88, alignItems: 'center', justifyContent: 'center', gap: 3, padding: 8, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 16, transform: [{ scale: pressed ? 0.97 : 1 }], ...shadow(t) })}>
    <Icon name={icon} size={26} color={t.accent} /><Text style={{ fontFamily: F.display, fontSize: 15, letterSpacing: 0.5, textTransform: 'uppercase', color: t.ink }}>{label}</Text><Text numberOfLines={1} style={{ fontFamily: F.body, fontSize: 11.5, color: t.muted, textAlign: 'center' }}>{sub}</Text></Pressable>;

  return (
    <Screen bar={<>{phone ? <View style={{ width: 70 }}><Button kind="secondary" title="" icon="phone" onPress={() => Linking.openURL(`tel:${phone.value}`)} /></View> : null}
      {next ? <Button title={next.label} onPress={advance} /> : <Button kind="secondary" title={job.status === 'done' ? 'Job done ✓' : 'Closed'} onPress={() => {}} disabled />}</>}>
      <Stack.Screen options={{ title: `Job ${job.number ?? ''}` }} />
      <Card>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <T mono s size={14}>#{job.number ?? '—'}</T>{visits.length > 1 ? <T s size={14}>· Visit {job.visit_number ?? 1} of {visits.length}</T> : null}
          <View style={{ flex: 1 }} /><StatusPill s={job.status} /></View>
        <CatTag company={company} name={job.category} />
        <Pressable onPress={() => router.push(`/customer/${job.customer_id}`)}><H1>{customer?.name ?? 'Customer'}</H1></Pressable>
        <T s>{job.type}{job.callback ? ' · Callback' : ''}</T>
        <T mono size={15}>{fmtDay(job.starts_at)} · {fmtTime(job.starts_at)}–{fmtTime(job.ends_at)}</T>
        {site ? <Pressable onPress={() => openMaps(site.address, prefs.mapApp)} style={{ flexDirection: 'row', gap: 6, alignItems: 'flex-start', marginTop: 2 }}><Icon name="pin" size={18} color={t.accent} /><Text style={{ flex: 1, fontFamily: F.semi, fontSize: 16, color: t.ink, textDecorationLine: 'underline', textDecorationColor: t.accent }}>{site.address}</Text></Pressable> : null}
        {crew.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>{crew.map((m: any) => <View key={m.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: t.line, borderRadius: 999, paddingVertical: 4, paddingLeft: 4, paddingRight: 12 }}><Avatar name={m.name} size={30} /><T b size={15}>{m.name}</T></View>)}</View>
          : <T b color={t.bad}>Needs a tech</T>}
        <View style={{ flexDirection: 'row', marginTop: 10 }}>{STEPS.map(([k, l], i) => <View key={k} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          {i < STEPS.length - 1 ? <View style={{ position: 'absolute', top: 13, left: '50%', right: '-50%', height: 2, backgroundColor: i < stepIdx ? t.accent : t.line }} /> : null}
          <View style={{ width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: i < stepIdx || (i === stepIdx && k === 'done') ? t.accent : i === stepIdx ? t.surface : t.chip, borderWidth: i === stepIdx && k !== 'done' ? 2.5 : 0, borderColor: t.accent }}>
            <Text style={{ fontFamily: F.bold, fontSize: 13, color: i < stepIdx || (i === stepIdx && k === 'done') ? t.accentInk : i === stepIdx ? t.accent : t.muted }}>{i < stepIdx || (i === stepIdx && k === 'done') ? '✓' : i + 1}</Text></View>
          <Text style={{ fontFamily: i === stepIdx ? F.semi : F.body, fontSize: 11.5, color: i === stepIdx ? t.ink : t.muted, textAlign: 'center' }}>{l}{job.status_times?.[k] ? `\n${fmtTime(job.status_times[k])}` : ''}</Text></View>)}</View>
      </Card>

      {notesAll.length ? <View style={{ backgroundColor: t.chip, borderWidth: 1.5, borderStyle: 'dashed', borderColor: t.line, borderRadius: 12, padding: 14, gap: 6 }}>
        <Eyebrow>Site notes · team only</Eyebrow>{notesAll.map((n, i) => <View key={i} style={{ flexDirection: 'row', gap: 8 }}><Icon name="lock" size={16} color={t.warn} /><T style={{ flex: 1 }} size={15.5}>{n}</T></View>)}</View> : null}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        {tile('invoice', 'Invoice', showPrices ? $(tt.total) : `${lines.length} item${lines.length === 1 ? '' : 's'}`, null)}
        {can(member, 'payments') && showPrices ? tile('money', 'Payment', tt.total > 0 && tt.due <= 0 ? 'Paid ✓' : tt.total ? `${$(tt.due)} due` : 'Nothing yet', 'pay') : null}
        {can(member, 'estimates') ? tile('estimate', 'Estimate', ests.length ? `${ests.length} made` : 'Options', 'est') : null}
        {tile('camera', 'Photos', 'Before & after', 'photos')}
      </View>

      <View><SecHead title="Invoice">{!closed || isManager(member) ? <SmallBtn title="+ Add" onPress={() => setSheet('book')} /> : null}</SecHead>
        <Card style={{ gap: 0 }}>
          {lines.map((l) => <Pressable key={l.id} onLongPress={() => !closed && Alert.alert('Remove this line?', l.description, [{ text: 'Keep', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => save('job_lines', { id: l.id, deleted_at: new Date().toISOString() }) }])}>
            <Line left={`${l.description}${Number(l.qty) !== 1 ? ` × ${l.qty}` : ''}`} right={$(Number(l.price) * Number(l.qty))} /></Pressable>)}
          {!lines.length ? <T s style={{ paddingVertical: 8 }}>Nothing added yet. Tap + Add.</T> : null}
          {root?.discount?.value ? <Line left={`Discount${root.discount.why ? ` · ${root.discount.why}` : ''}`} right={`−${$(tt.off)}`} color={t.ok} /> : null}
          <View style={{ paddingTop: 10, gap: 2 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T s>Subtotal</T><T mono s>{$(tt.sub - tt.off)}</T></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T s>Tax</T><T mono s>{$(tt.tax)}</T></View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}><Text style={{ fontFamily: F.display, fontSize: 30, color: t.ink }}>Total</Text><Text style={{ fontFamily: F.display, fontSize: 30, color: t.ink }}>{$(tt.total)}</Text></View>
            {tt.paid ? <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T s color={t.ok}>Paid</T><T mono color={t.ok}>{$(tt.paid)}</T></View> : null}
            {tt.paid && tt.due > 0 ? <T b color={t.bad}>Still owes {$(tt.due)}</T> : null}
          </View>
          {lines.length ? <T s size={12.5} style={{ marginTop: 6 }}>Press and hold a line to remove it.</T> : null}
        </Card>
        {can(member, 'payments') && showPrices && tt.total > 0 && tt.due > 0 ? <View style={{ marginTop: 10 }}><Button title={`Take payment · ${$(tt.due)}`} onPress={() => setSheet('pay')} icon="money" /></View> : null}
      </View>

      <Field label="Summary of work" hint="The customer sees this on the invoice." multiline value={summary ?? root?.summary ?? ''} onChangeText={setSummary}
        onBlur={() => summary !== null && summary !== root?.summary && save('jobs', { id: rootId, summary })} placeholder="What you found and what you fixed, in plain words" />

      <PrivateNotes value={notes ?? (job.private_notes ?? [])} onChange={setNotes}
        onDone={(list) => { const clean = list.map((x) => x.trim()).filter(Boolean); if (JSON.stringify(clean) !== JSON.stringify(job.private_notes ?? [])) save('jobs', { id: job.id, private_notes: clean }); }} />

      <View><SecHead title={`Checklists · ${jcl.length}`}>{isManager(member) || !closed ? <SmallBtn title="+ Add" onPress={() => setSheet('check')} /> : null}</SecHead>
        {jcl.length ? <View style={{ gap: 10 }}>{jcl.map((x) => { const cl = checklists.find((c) => c.id === x.checklist_id); return cl ? <ChecklistCard key={x.checklist_id} cl={cl} jc={x} locked={closed && !isManager(member)} /> : null; })}</View> : <T s>No checklist on this job.</T>}</View>

      <View><SecHead title={`Visits on this job · ${visits.length}`}>{isManager(member) ? <SmallBtn title="+ Add visit" onPress={() => { setF({ day: dayKey(new Date(Date.now() + 86400000)), start: '8:00 AM', hours: '2', note: '' }); setSheet('visit'); }} /> : null}</SecHead>
        <Card style={{ gap: 0, paddingVertical: 4 }}>{visits.map((v, i) => <Pressable key={v.id} disabled={v.id === job.id} onPress={() => router.push(`/job/${v.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: i === visits.length - 1 ? 0 : 1, borderColor: t.line }}>
          <T mono b style={{ width: 26 }}>{i + 1}</T><View style={{ flex: 1 }}><T b>{fmtDay(v.starts_at)} · {fmtTime(v.starts_at)}{v.id === job.id ? '  (this one)' : ''}</T>{v.visit_note ? <T s size={14}>{v.visit_note}</T> : null}</View><StatusPill s={v.status} /></Pressable>)}
          <T s size={13} style={{ paddingVertical: 6 }}>Every visit bills on one invoice.</T></Card></View>

      {units.length ? <View><Eyebrow style={{ marginBottom: 8 }}>Equipment here</Eyebrow><View style={{ gap: 8 }}>{units.map((u) => <Card key={u.id}><T b>{[u.tag, u.type].filter(Boolean).join(' · ')}</T><T s mono size={13.5}>{[u.make, u.model, u.serial && `S/N ${u.serial}`, u.year].filter(Boolean).join(' · ')}</T></Card>)}</View></View> : null}

      {/* ---------- sheets ---------- */}
      <Sheet open={sheet === 'book'} onClose={() => setSheet(null)} title="Add to invoice">
        <Seg value={tier} onChange={setTier} options={TIERS} />
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}><SmallBtn title="+ Truck part" icon="truck" onPress={() => setSheet('parts')} /><SmallBtn title="+ Custom line" onPress={() => { setF({ d: '', p: '', q: '1' }); setSheet('line'); }} />{can(member, 'discounts') ? <SmallBtn title="Discount" icon="tag" onPress={() => { setF({ type: root?.discount?.type ?? 'pct', value: String(root?.discount?.value ?? ''), why: root?.discount?.why ?? '' }); setSheet('disc'); }} /> : null}</View>
        {book.sort((a, b) => (a.category + a.name).localeCompare(b.category + b.name)).map((p) => { const price = Number(p.prices?.[tier] ?? p.prices?.res ?? 0); return <Pressable key={p.id} onPress={async () => { await addLine({ description: p.name, price, price_item_id: p.id, unit: p.unit ?? null }); setSheet(null); }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? t.chip : t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12 })}>
          <View style={{ flex: 1 }}><T b>{p.name}</T><T s size={13}>{p.category}{p.unit ? ` · per ${p.unit}` : ''}</T></View><T mono>{$(price)}</T></Pressable>; })}
        {!book.length ? <T s>No price book yet. The owner adds prices on the office website.</T> : null}
      </Sheet>
      <Sheet open={sheet === 'parts'} onClose={() => setSheet(null)} title="Parts on your truck">
        {truckStock.map((s) => { const p = parts.find((x) => x.id === s.part_id); return <Pressable key={s.part_id} onPress={() => addPart(s)} style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: pressed ? t.chip : t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 12 })}>
          <View style={{ flex: 1 }}><T b>{p?.name ?? 'Part'}</T><T s size={13}>{s.qty} on the truck{p?.part_number ? ` · ${p.part_number}` : ''}</T></View><T mono>{$(Number(p?.price ?? p?.cost ?? 0))}</T></Pressable>; })}
        {!truckStock.length ? <T s>Nothing on your truck. Ask the office to fill it from the shop.</T> : null}
      </Sheet>
      <Sheet open={sheet === 'line'} onClose={() => setSheet(null)} title="Custom line" footer={<Button title="Add" onPress={async () => { if (!f.d?.trim()) return Alert.alert('Write what it is'); await addLine({ description: f.d.trim(), price: Number(f.p) || 0, qty: Number(f.q) || 1, kind: f.part ? 'part' : 'service' }); setSheet(null); }} />}>
        <Field label="What is it" value={f.d ?? ''} onChangeText={(v) => setF({ ...f, d: v })} placeholder="Part or item name" autoFocus />
        <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label="Price" value={f.p ?? ''} onChangeText={(v) => setF({ ...f, p: v })} keyboardType="decimal-pad" /></View><View style={{ flex: 1 }}><Field label="How many" value={f.q ?? '1'} onChangeText={(v) => setF({ ...f, q: v })} keyboardType="decimal-pad" /></View></View>
        <Chips><Chip label="Labor / service" on={!f.part} onPress={() => setF({ ...f, part: false })} /><Chip label="Part / material" on={!!f.part} onPress={() => setF({ ...f, part: true })} /></Chips>
        {(company?.settings?.materials ?? []).length ? <><Eyebrow>Your materials</Eyebrow><Chips>{(company.settings.materials as any[]).slice(0, 40).map((m: any, i: number) => { const n = Array.isArray(m) ? m[0] : m.n ?? m.name ?? String(m); const pr = Array.isArray(m) ? m[2] : m.p ?? m.price; return <Chip key={i} label={n} onPress={() => setF({ ...f, d: n, p: pr != null ? String(pr) : '', part: true })} />; })}</Chips></> : null}
      </Sheet>
      <Sheet open={sheet === 'disc'} onClose={() => setSheet(null)} title="Discount" footer={<>{root?.discount ? <Button kind="secondary" title="Remove" onPress={async () => { await save('jobs', { id: rootId, discount: null }); setSheet(null); }} /> : null}<Button title="Save" onPress={async () => { const v = Number(f.value) || 0; await save('jobs', { id: rootId, discount: v ? { type: f.type, value: v, why: f.why?.trim() || undefined } : null }); setSheet(null); }} /></>}>
        <Seg value={f.type ?? 'pct'} onChange={(v) => setF({ ...f, type: v })} options={[['pct', '% off'], ['amt', '$ off']]} />
        <Field label={f.type === 'amt' ? 'Dollars off' : 'Percent off'} value={f.value ?? ''} onChangeText={(v) => setF({ ...f, value: v })} keyboardType="decimal-pad" />
        <Field label="Why (shows on the invoice)" value={f.why ?? ''} onChangeText={(v) => setF({ ...f, why: v })} placeholder="Plan member, senior, first-time customer" />
      </Sheet>
      <Sheet open={sheet === 'pay'} onClose={() => setSheet(null)} title={`Take ${$(tt.due)}`}>
        <Button title={tap.available ? 'Tap to Pay (card)' : 'Tap to Pay (real app only)'} icon="card" onPress={card} disabled={!tap.available} busy={tap.step === 'connecting' || tap.step === 'confirming'} />
        {tap.step !== 'idle' ? <T s color={tap.step === 'error' ? t.bad : t.ink}>{tap.message}</T> : null}
        <Button title="Text a pay link" kind="secondary" onPress={link} />
        <Field label="Check # or note (optional)" value={f.ref ?? ''} onChangeText={(v) => setF({ ...f, ref: v })} />
        <View style={{ flexDirection: 'row', gap: 8 }}><Button title="Cash" kind="secondary" onPress={() => cash('cash')} /><Button title="Check" kind="secondary" onPress={() => cash('check')} /><Button title="Zelle" kind="secondary" onPress={() => cash('zelle')} /></View>
      </Sheet>
      <EstimateSheet open={sheet === 'est'} onClose={() => setSheet(null)} job={job} rootId={rootId} ests={ests} book={book} showPrices={showPrices} addLine={addLine} />
      <Sheet open={sheet === 'check'} onClose={() => setSheet(null)} title="Add a checklist">
        {checklists.filter((c) => !jcl.some((x) => x.checklist_id === c.id)).map((c) => <Pressable key={c.id} onPress={async () => { await save('job_checklists', { job_id: id, checklist_id: c.id, company_id: member!.company_id, answers: {}, deleted_at: null }, ['job_id', 'checklist_id']); setSheet(null); }}
          style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', backgroundColor: pressed ? t.chip : t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 14 })}><T b style={{ flex: 1 }}>{c.name}</T><T s size={13}>{(c.items ?? []).length} steps</T></Pressable>)}
        {!checklists.length ? <T s>No checklists yet. The owner builds them on the office website.</T> : null}
      </Sheet>
      <Sheet open={sheet === 'visit'} onClose={() => setSheet(null)} title="Add another visit" footer={<Button title="Save visit" busy={busy} onPress={async () => {
        const m = /^(\d{1,2})(?::(\d{2}))?\s*([ap])?/i.exec((f.start ?? '').trim()); if (!m) return Alert.alert('Type a start time like 8:00 AM');
        let h = Number(m[1]) % 12; if ((m[3] ?? (Number(m[1]) < 7 ? 'p' : 'a')).toLowerCase() === 'p') h += 12;
        const s = new Date(f.day + 'T00:00:00'); s.setHours(h, Number(m[2] ?? 0)); const e = new Date(s.getTime() + (Number(f.hours) || 2) * 3600000);
        setBusy(true); const vid = newId();
        await save('jobs', { id: vid, company_id: member!.company_id, customer_id: job.customer_id, site_id: job.site_id, type: root.type, category: root.category, starts_at: s.toISOString(), ends_at: e.toISOString(), status: 'scheduled', parent_job_id: rootId, visit_number: visits.length + 1, visit_note: f.note?.trim() || null });
        for (const a of asg.filter((x) => !x.deleted_at)) await save('job_assignments', { job_id: vid, member_id: a.member_id, company_id: member!.company_id }, ['job_id', 'member_id']);
        setBusy(false); setSheet(null);
      }} />}>
        <Field label="Day (YYYY-MM-DD)" value={f.day ?? ''} onChangeText={(v) => setF({ ...f, day: v })} />
        <View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Field label="Start" value={f.start ?? ''} onChangeText={(v) => setF({ ...f, start: v })} /></View><View style={{ flex: 1 }}><Field label="Hours" value={f.hours ?? ''} onChangeText={(v) => setF({ ...f, hours: v })} keyboardType="decimal-pad" /></View></View>
        <Field label="What's this visit for" value={f.note ?? ''} onChangeText={(v) => setF({ ...f, note: v })} placeholder="Install the new part" />
        <T s size={13.5}>Same techs as this visit. It bills on the same invoice.</T>
      </Sheet>
      <PhotosSheet open={sheet === 'photos'} onClose={() => setSheet(null)} jobId={id} companyId={member.company_id} online={online} />
    </Screen>
  );
}

function PrivateNotes({ value, onChange, onDone }: { value: string[]; onChange: (v: string[]) => void; onDone: (v: string[]) => void }) {
  const t = useT();
  const list = value.length ? value : [''];
  return <View style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Icon name="lock" size={18} color={t.ink} /><T b style={{ flex: 1 }}>Private notes · team only</T>
      <Pressable accessibilityLabel="Add another private note" onPress={() => { if (list[list.length - 1].trim()) onChange([...list, '']); }} style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: t.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: t.accent, fontSize: 24, fontFamily: F.bold, marginTop: -2 }}>+</Text></Pressable></View>
    <T s size={14}>Never on invoices, texts or the customer portal.</T>
    {list.map((x, i) => <Field key={i} accessibilityLabel={`Private note ${i + 1}`} multiline value={x} placeholder="Gate codes, follow-ups, who to talk to, what the customer OK'd" onChangeText={(v) => onChange(list.map((y, k) => (k === i ? v : y)))} onBlur={() => onDone(list)} style={{ backgroundColor: t.chip, borderStyle: 'dashed' }} />)}
  </View>;
}

function ChecklistCard({ cl, jc, locked }: { cl: any; jc: any; locked: boolean }) {
  const t = useT();
  const items: { t: string; k: 'ck' | 'yn' | 'tx' | 'ct' }[] = cl.items ?? [];
  const a = jc.answers ?? {};
  const done = items.filter((_, i) => a[i] != null && a[i] !== '' && a[i] !== false).length;
  const set = (i: number, v: unknown) => !locked && save('job_checklists', { job_id: jc.job_id, checklist_id: jc.checklist_id, answers: { ...a, [i]: v } }, ['job_id', 'checklist_id']);
  return <Card style={{ gap: 4 }}>
    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}><T b>{cl.name}</T><T s size={14}>{done} of {items.length}</T></View>
    {items.map((it, i) => <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopWidth: 1, borderColor: t.line }}>
      <T style={{ flex: 1 }} size={16}>{it.t}</T>
      {it.k === 'ck' ? <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!a[i] }} onPress={() => set(i, !a[i])} style={{ width: 34, height: 34, borderRadius: 9, borderWidth: 2, borderColor: a[i] ? t.ok : t.line, backgroundColor: a[i] ? t.ok : 'transparent', alignItems: 'center', justifyContent: 'center' }}>{a[i] ? <Text style={{ color: '#fff', fontFamily: F.bold, fontSize: 18 }}>✓</Text> : null}</Pressable>
        : it.k === 'yn' ? <View style={{ flexDirection: 'row', gap: 6 }}>{['Yes', 'No'].map((v) => <Chip key={v} label={v} on={a[i] === v} onPress={() => set(i, a[i] === v ? null : v)} />)}</View>
          : it.k === 'ct' ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Pressable onPress={() => set(i, Math.max(0, Number(a[i] ?? 0) - 1))} style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22, color: t.ink }}>−</Text></Pressable>
            <T mono size={18} style={{ minWidth: 30, textAlign: 'center' }}>{a[i] ?? 0}</T><Pressable onPress={() => set(i, Number(a[i] ?? 0) + 1)} style={{ width: 40, height: 40, borderRadius: 10, borderWidth: 1.5, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 22, color: t.ink }}>+</Text></Pressable></View>
            : <View style={{ width: '50%' }}><Field value={String(a[i] ?? '')} onChangeText={(v) => set(i, v)} placeholder="Write it" style={{ minHeight: 42, fontSize: 15 }} /></View>}
    </View>)}
  </Card>;
}

function EstimateSheet({ open, onClose, job, rootId, ests, book, showPrices, addLine }: { open: boolean; onClose: () => void; job: any; rootId: string; ests: any[]; book: any[]; showPrices: boolean; addLine: (l: Record<string, unknown>) => Promise<void> }) {
  const t = useT();
  const { member } = useSession();
  const [edit, setEdit] = useState<any | null>(null);
  const tot = (o: any) => (o.lines ?? []).reduce((a: number, l: any) => a + Number(l.p) * Number(l.q ?? 1), 0);
  const $ = (n: number) => (showPrices ? formatMoney(n) : '$ ——');
  async function saveEst(status?: string) {
    const row = { id: edit.id ?? newId(), company_id: member!.company_id, customer_id: job.customer_id, job_id: rootId, title: edit.title?.trim() || null, options: edit.options, status: status ?? edit.status ?? 'draft', ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}) };
    await save('estimates', row); setEdit(null);
  }
  async function approve(e: any, i: number) {
    await save('estimates', { id: e.id, status: 'approved', picked: i, answered_at: new Date().toISOString() });
    for (const l of e.options[i].lines ?? []) await addLine({ description: l.d, price: Number(l.p), qty: Number(l.q ?? 1) });
    Alert.alert('Approved', `${e.options[i].name} was added to the invoice.`);
  }
  if (edit) return <Sheet open={open} onClose={() => setEdit(null)} title={edit.id ? 'Edit estimate' : 'New estimate'} footer={<><Button kind="secondary" title="Save" onPress={() => saveEst()} /><Button title="Mark sent" onPress={() => saveEst('sent')} /></>}>
    <Field label="Title" value={edit.title ?? ''} onChangeText={(v) => setEdit({ ...edit, title: v })} placeholder="Repair or replace" />
    {edit.options.map((o: any, oi: number) => <Card key={oi} style={{ gap: 8 }}>
      <Field label={`Option ${oi + 1}`} value={o.name} onChangeText={(v) => setEdit({ ...edit, options: edit.options.map((x: any, k: number) => (k === oi ? { ...x, name: v } : x)) })} />
      {(o.lines ?? []).map((l: any, li: number) => <Line key={li} left={`${l.d}${Number(l.q ?? 1) !== 1 ? ` × ${l.q}` : ''}`} right={$(Number(l.p) * Number(l.q ?? 1))} />)}
      <T b size={18}>Total {$(tot(o))}</T>
      <Eyebrow>Add from price book</Eyebrow>
      <Chips>{book.slice(0, 40).map((p) => <Chip key={p.id} label={p.name} onPress={() => setEdit({ ...edit, options: edit.options.map((x: any, k: number) => (k === oi ? { ...x, lines: [...(x.lines ?? []), { d: p.name, p: Number(p.prices?.res ?? 0), q: 1 }] } : x)) })} />)}</Chips>
      <CustomLine onAdd={(l) => setEdit({ ...edit, options: edit.options.map((x: any, k: number) => (k === oi ? { ...x, lines: [...(x.lines ?? []), l] } : x)) })} />
    </Card>)}
    <Button kind="secondary" title="+ Add another option" onPress={() => setEdit({ ...edit, options: [...edit.options, { name: `Option ${edit.options.length + 1}`, lines: [] }] })} />
  </Sheet>;
  return <Sheet open={open} onClose={onClose} title="Estimates" footer={<Button title="+ New estimate" onPress={() => setEdit({ title: '', options: [{ name: 'Repair', lines: [] }, { name: 'Replace', lines: [] }] })} />}>
    {ests.map((e) => <Card key={e.id} style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><T b style={{ flex: 1 }}>{e.title || 'Estimate'}{e.number ? ` #${e.number}` : ''}</T><T s size={13}>{({ draft: 'Not sent', sent: 'Waiting on customer', approved: 'Approved', declined: 'Not approved' } as any)[e.status]}</T></View>
      {(e.options ?? []).map((o: any, i: number) => <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: e.picked === i ? 2 : 1, borderColor: e.picked === i ? t.ok : t.line, borderRadius: 12, padding: 10 }}>
        <View style={{ flex: 1 }}><T b>{o.name}</T><T s size={13}>{(o.lines ?? []).map((l: any) => l.d).join(', ') || 'No items'}</T></View><T mono>{$(tot(o))}</T>
        {e.status === 'sent' || e.status === 'draft' ? <SmallBtn title="Approved" onPress={() => Alert.alert('Customer approved this option?', `${o.name} · ${$(tot(o))} gets added to the invoice.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Yes, approved', onPress: () => approve(e, i) }])} /> : null}</View>)}
      {e.status === 'draft' || e.status === 'sent' ? <View style={{ flexDirection: 'row', gap: 8 }}><SmallBtn title="Edit" onPress={() => setEdit({ ...e })} /><SmallBtn title="Not approved" onPress={() => save('estimates', { id: e.id, status: 'declined', answered_at: new Date().toISOString() })} /></View> : null}
    </Card>)}
    {!ests.length ? <T s>No estimates on this job. Give the customer options, like repair or replace.</T> : null}
  </Sheet>;
}
function CustomLine({ onAdd }: { onAdd: (l: { d: string; p: number; q: number }) => void }) {
  const [d, setD] = useState(''); const [p, setP] = useState('');
  return <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
    <View style={{ flex: 2 }}><Field label="Custom item" value={d} onChangeText={setD} placeholder="Item name" style={{ minHeight: 46, fontSize: 16 }} /></View>
    <View style={{ flex: 1 }}><Field label="Price" value={p} onChangeText={setP} keyboardType="decimal-pad" style={{ minHeight: 46, fontSize: 16 }} /></View>
    <View style={{ width: 70 }}><Button small title="Add" onPress={() => { if (d.trim()) { onAdd({ d: d.trim(), p: Number(p) || 0, q: 1 }); setD(''); setP(''); } }} /></View>
  </View>;
}

function PhotosSheet({ open, onClose, jobId, companyId, online }: { open: boolean; onClose: () => void; jobId: string; companyId: string; online: boolean }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const q = useQuery(async () => {
    if (!open) return [];
    const rows = check(await supabase.from('job_media').select('id, storage_path, kind, caption, taken_at').eq('job_id', jobId).is('deleted_at', null).order('taken_at')) as any[];
    const signed = rows.length ? (await supabase.storage.from('job-media').createSignedUrls(rows.map((r) => r.storage_path), 3600)).data ?? [] : [];
    return rows.map((r, i) => ({ ...r, url: signed[i]?.signedUrl }));
  }, [open, jobId]);
  async function add(camera: boolean) {
    if (!online) return Alert.alert('No signal', 'Photos upload when you have signal. Take them with the camera app for now.');
    const perm = camera ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert('Allow the camera', 'Turn on camera or photos for Cydras in your phone settings.');
    const r = camera ? await ImagePicker.launchCameraAsync({ quality: 0.6 }) : await ImagePicker.launchImageLibraryAsync({ quality: 0.6, allowsMultipleSelection: true, selectionLimit: 10 });
    if (r.canceled) return;
    setBusy(true);
    try {
      for (const a of r.assets) {
        const path = `${companyId}/${jobId}/${newId()}.jpg`;
        const body = await (await fetch(a.uri)).arrayBuffer();
        const up = await supabase.storage.from('job-media').upload(path, body, { contentType: 'image/jpeg' });
        if (up.error) throw new Error(up.error.message);
        check(await supabase.from('job_media').insert({ company_id: companyId, job_id: jobId, storage_path: path, kind: 'photo' }));
      }
      q.reload();
    } catch (e) { Alert.alert('Photo not saved', (e as Error).message); }
    setBusy(false);
  }
  return <Sheet open={open} onClose={onClose} title="Photos" footer={<><Button kind="secondary" title="From photos" onPress={() => add(false)} busy={busy} /><Button title="Take photo" icon="camera" onPress={() => add(true)} busy={busy} /></>}>
    {q.error ? <T s color={t.bad}>{q.error}</T> : null}
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{(q.data ?? []).map((m: any) => <Pressable key={m.id} onPress={() => m.url && Linking.openURL(m.url)} style={{ width: '32%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: t.chip }}>{m.url ? <Image source={{ uri: m.url }} style={{ width: '100%', height: '100%' }} /> : null}</Pressable>)}</View>
    {q.data && !q.data.length ? <T s>No photos yet. Take before and after photos of the equipment and the work.</T> : null}
  </Sheet>;
}
