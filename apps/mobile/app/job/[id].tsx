// One job: status, details, invoice, parts, payment. Works with no signal (except card payments and texts).
import { useMemo, useState } from 'react';
import { Alert, Linking, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { newId, totals, formatMoney } from '@cydras/core';
import { useSession, can, isManager } from '../../src/lib/session';
import { save, call, useRows, useSyncState } from '../../src/lib/sync';
import { callFunction } from '../../src/lib/supabase';
import { useTapToPay, sendPayLink } from '../../src/lib/tapToPay';
import { fmtTime, fmtDay, STATUS } from '../../src/lib/data';
import { Screen, Card, H1, H2, Small, Button, Field, Row, Eyebrow, C } from '../../src/ui/kit';

const NEXT: Record<string, { to: string; label: string }> = {
  scheduled: { to: 'on_the_way', label: 'On my way' },
  on_the_way: { to: 'on_site', label: 'Start job' },
  on_site: { to: 'done', label: 'Finish & invoice' },
};

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useSession();
  const { online } = useSyncState();
  const router = useRouter();
  const job = useRows<any>('jobs', (j) => j.id === id, [id])[0];
  // A job can have more visits (come back with the part). Billing always lives on the first visit.
  const rootId: string = job?.parent_job_id ?? id;
  const root = useRows<any>('jobs', (j) => j.id === rootId, [rootId])[0] ?? job;
  const visits = useRows<any>('jobs', (j) => (j.id === rootId || j.parent_job_id === rootId) && !j.deleted_at, [rootId]).sort((a, b) => (a.visit_number ?? 1) - (b.visit_number ?? 1));
  const customer = useRows<any>('customers', (c) => c.id === job?.customer_id, [job?.customer_id])[0];
  const site = useRows<any>('sites', (s) => s.id === job?.site_id, [job?.site_id])[0];
  const phone = useRows<any>('customer_contacts', (c) => c.customer_id === job?.customer_id && c.kind === 'phone', [job?.customer_id]).sort((a, b) => Number(b.is_primary) - Number(a.is_primary))[0];
  const lines = useRows<any>('job_lines', (l) => l.job_id === rootId, [rootId]).sort((a, b) => a.position - b.position);
  const invoice = useRows<any>('invoices', (i) => i.job_id === rootId, [rootId])[0];
  const pays = useRows<any>('payments', (p) => p.job_id === rootId || (invoice && p.invoice_id === invoice.id), [rootId, invoice?.id]);
  const company = useRows<any>('companies', (c) => c.id === member?.company_id, [member?.company_id])[0];
  const book = useRows<any>('price_items', (p) => p.active);
  const myTruck = useRows<any>('stock_locations', (l) => l.kind === 'truck' && l.member_id === member?.id, [member?.id])[0];
  const truckStock = useRows<any>('stock', (s) => s.location_id === myTruck?.id && s.qty > 0, [myTruck?.id]);
  const parts = useRows<any>('parts');
  const [summary, setSummary] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[] | null>(null);
  const [picker, setPicker] = useState<'book' | 'parts' | 'pay' | null>(null);
  const tap = useTapToPay(member?.company_id ?? '');

  const showPrices = can(member, 'seePrices') && !(job?.hide_prices && !isManager(member));
  const t = useMemo(() => totals(lines.map((l) => ({ price: Number(l.price), qty: Number(l.qty) })), Number(company?.tax_rate ?? 0.07), root?.discount ?? null,
    pays.map((p) => ({ amount: Number(p.amount), refunded_amount: Number(p.refunded_amount ?? 0), voided_at: p.voided_at, status: p.status }))), [lines, pays, company, root]);
  const $ = (n: number) => (showPrices ? formatMoney(n) : '$ ——');

  if (!job || !member) return <Screen><Small>Loading…</Small></Screen>;
  const next = job.parent_job_id && job.status === 'on_site' ? { to: 'done', label: 'Finish visit' } : NEXT[job.status];

  async function advance() {
    const now = new Date().toISOString();
    await save('jobs', { id: job.id, status: next.to, status_times: { ...(job.status_times ?? {}), [next.to]: now } });
    if (next.to === 'on_the_way') {
      if (!online) return Alert.alert('On the way', "No signal, so the customer wasn't texted. Call them if you need to.");
      try {
        await callFunction('send-sms', { company_id: member!.company_id, customer_id: job.customer_id, kind: 'on_my_way',
          body: `Hi, this is ${member!.name.split(' ')[0]} from ${company?.name ?? 'us'}. I'm on my way to you now.` });
      } catch (e) { Alert.alert('On the way', `Customer was not texted: ${(e as Error).message}`); }
    }
    if (next.to === 'done') await ensureInvoice();
  }
  async function ensureInvoice() {
    const row = { company_id: member!.company_id, customer_id: job.customer_id, job_id: rootId, subtotal: t.sub - t.off, tax: t.tax, total: t.total };
    if (invoice) { if (can(member, 'prices')) await save('invoices', { id: invoice.id, ...row }); return invoice.id; }
    const inv = newId(); await save('invoices', { id: inv, ...row }); return inv;
  }
  async function addBook(item: any, rate: string) {
    await save('job_lines', { id: newId(), company_id: member!.company_id, job_id: rootId, description: `${item.name}`, price: Number(item.prices[rate]), qty: 1, kind: 'service', price_item_id: item.id, position: lines.length });
    setPicker(null);
  }
  async function addPart(s: any) {
    const p = parts.find((x) => x.id === s.part_id);
    await save('job_lines', { id: newId(), company_id: member!.company_id, job_id: rootId, description: p?.name ?? 'Part', price: Number(p?.price ?? p?.cost ?? 0), qty: 1, kind: 'part', part_sku: s.part_id, position: lines.length });
    await call('use_part', { p_location: s.location_id, p_part: s.part_id, p_qty: 1 });
    setPicker(null);
  }
  async function cash(method: 'cash' | 'check' | 'zelle') {
    const inv = await ensureInvoice();
    await save('payments', { id: newId(), company_id: member!.company_id, invoice_id: inv, job_id: rootId, customer_id: job.customer_id, method, amount: t.due, status: 'succeeded', refunded_amount: 0 });
    setPicker(null);
    Alert.alert('Payment saved', `${formatMoney(t.due)} by ${method}.`);
  }
  async function card() {
    if (!online) return Alert.alert('No signal', 'Card payments need signal. Take cash or check, or send a pay link later.');
    const inv = await ensureInvoice();
    const ok = await tap.charge(inv);
    if (!ok) Alert.alert('Card not taken', tap.message);
  }
  async function link() {
    if (!online) return Alert.alert('No signal', 'Try again when you have signal.');
    try { const inv = await ensureInvoice(); const r = await sendPayLink(inv); await Linking.openURL(r.url); } catch (e) { Alert.alert('Could not make a pay link', (e as Error).message); }
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: `Job ${job.number ?? ''}` }} />
      <Card>
        <Eyebrow>{visits.length > 1 ? `Visit ${job.visit_number ?? 1} of ${visits.length} · ` : ''}{STATUS[job.status]} · {fmtDay(job.starts_at)} {fmtTime(job.starts_at)}–{fmtTime(job.ends_at)}</Eyebrow>
        <H1>{customer?.name ?? 'Customer'}</H1>
        <Small>{job.category ?? job.type}{job.description ? ` · ${job.description}` : ''}</Small>
        {site ? <Pressable onPress={() => Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(site.address)}`)}><Text style={{ color: C.accent, fontSize: 16, fontWeight: '700' }}>📍 {site.address}</Text></Pressable> : null}
        {phone ? <Pressable onPress={() => Linking.openURL(`tel:${phone.value}`)}><Text style={{ color: C.accent, fontSize: 16, fontWeight: '700' }}>📞 {phone.value}</Text></Pressable> : null}
        {site?.site_notes?.length ? <Small color={C.warn}>{site.site_notes.join(' · ')}</Small> : null}
      </Card>
      {next && <Button title={next.label} onPress={advance} />}

      {visits.length > 1 && <Card>
        <H2>Visits on this job · {visits.length}</H2>
        {visits.map((v, i) => (
          <Row key={v.id} title={`${i + 1}. ${fmtDay(v.starts_at)} ${fmtTime(v.starts_at)}–${fmtTime(v.ends_at)}${v.id === job.id ? ' (this one)' : ''}`}
            sub={`${STATUS[v.status]}${v.visit_note ? ' · ' + v.visit_note : ''}`} onPress={v.id === job.id ? undefined : () => router.push(`/job/${v.id}`)} />
        ))}
        <Small>Every visit bills on one invoice.</Small>
      </Card>}

      <Card>
        <H2>Invoice</H2>
        {lines.map((l) => <View key={l.id} style={{ flexDirection: 'row', justifyContent: 'space-between' }}><Small color={C.ink}>{l.description}{Number(l.qty) !== 1 ? ` × ${l.qty}` : ''}</Small><Small color={C.ink}>{$(Number(l.price) * Number(l.qty))}</Small></View>)}
        {!lines.length && <Small>Nothing added yet.</Small>}
        <View style={{ borderTopWidth: 1, borderColor: C.line, paddingTop: 8, gap: 2 }}>
          <Small>Subtotal {$(t.sub)}{t.off ? ` · Discount −${$(t.off)}` : ''} · Tax {$(t.tax)}</Small>
          <H2>Total {$(t.total)}{t.paid ? ` · Paid ${$(t.paid)}` : ''}</H2>
          {t.due > 0 && t.paid > 0 ? <Small color={C.bad}>Still owes {$(t.due)}</Small> : null}
        </View>
        {job.status !== 'done' && <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}><Button title="+ Price book" kind="secondary" onPress={() => setPicker('book')} /></View>
          <View style={{ flex: 1 }}><Button title="+ Part" kind="secondary" onPress={() => setPicker('parts')} /></View>
        </View>}
        {showPrices && can(member, 'payments') && t.total > 0 && t.due > 0 && <Button title={`Take payment · ${$(t.due)}`} onPress={() => setPicker('pay')} />}
        {t.total > 0 && t.due <= 0 && <Small color={C.ok}>Paid in full ✓</Small>}
      </Card>

      <Field label="Summary of work (the customer sees this)" multiline value={summary ?? root?.summary ?? ''} onChangeText={setSummary}
        onBlur={() => summary !== null && summary !== root?.summary && save('jobs', { id: rootId, summary })} placeholder="What you found and what you fixed, in plain words" />

      <PrivateNotes value={notes ?? (job.private_notes ?? [])} onChange={setNotes}
        onDone={(list) => { const clean = list.map((x) => x.trim()).filter(Boolean); if (JSON.stringify(clean) !== JSON.stringify(job.private_notes ?? [])) save('jobs', { id: job.id, private_notes: clean }); }} />

      <Modal visible={!!picker} animationType="slide" onRequestClose={() => setPicker(null)} presentationStyle="pageSheet">
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10, backgroundColor: C.bg, flexGrow: 1 }}>
          {picker === 'book' && <>
            <H2>Price book</H2>
            {book.sort((a, b) => a.name.localeCompare(b.name)).map((p) => (
              <Card key={p.id} style={{ gap: 6 }}>
                <Text style={{ fontWeight: '800', fontSize: 16 }}>{p.name}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                  {Object.entries(p.prices ?? {}).map(([k, v]) => (
                    <Pressable key={k} onPress={() => addBook(p, k)} style={{ borderWidth: 1.5, borderColor: C.line, borderRadius: 10, padding: 8 }}>
                      <Text style={{ fontWeight: '700' }}>{({ res: 'Home', resAdd: 'Home add-on', com: 'Business', comAdd: 'Business add-on', after: 'After hours' } as any)[k] ?? k} · {$(Number(v))}</Text>
                    </Pressable>
                  ))}
                </View>
              </Card>
            ))}
          </>}
          {picker === 'parts' && <>
            <H2>Parts on your truck</H2>
            {truckStock.map((s) => { const p = parts.find((x) => x.id === s.part_id); return <Row key={s.part_id} title={p?.name ?? 'Part'} sub={`${s.qty} on the truck`} onPress={() => addPart(s)} />; })}
            {!truckStock.length && <Small>Nothing on your truck. Ask your supervisor to fill it from the shop.</Small>}
          </>}
          {picker === 'pay' && <>
            <H2>Take {$(t.due)}</H2>
            <Button title="Tap to Pay (card)" onPress={card} busy={tap.step === 'connecting' || tap.step === 'confirming'} />
            {tap.step !== 'idle' && <Small color={tap.step === 'error' ? C.bad : C.ink}>{tap.message}</Small>}
            <Button title="Text a pay link" kind="secondary" onPress={link} />
            <Button title="Cash" kind="secondary" onPress={() => cash('cash')} />
            <Button title="Check" kind="secondary" onPress={() => cash('check')} />
            <Button title="Zelle" kind="secondary" onPress={() => cash('zelle')} />
          </>}
          <Button title="Close" kind="secondary" onPress={() => setPicker(null)} />
        </ScrollView>
      </Modal>
    </Screen>
  );
}

/** Private notes: boxes like Summary of work. "+" adds another box. Team only, never shown to the customer. */
function PrivateNotes({ value, onChange, onDone }: { value: string[]; onChange: (v: string[]) => void; onDone: (v: string[]) => void }) {
  const list = value.length ? value : [''];
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.ink, flex: 1 }}>🔒 Private notes · Team only</Text>
        <Pressable accessibilityLabel="Add another private note" onPress={() => { if (list[list.length - 1].trim()) onChange([...list, '']); }}
          style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: C.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ color: C.accent, fontSize: 24, fontWeight: '700', marginTop: -2 }}>+</Text>
        </Pressable>
      </View>
      <Small>Only your team sees these. Never on invoices, texts, or the customer portal.</Small>
      {list.map((t, i) => (
        <Field key={i} label="" accessibilityLabel={`Private note ${i + 1}`} multiline value={t} placeholder="Gate codes, follow-ups, who to talk to, what the customer OK'd"
          onChangeText={(v) => onChange(list.map((x, k) => (k === i ? v : x)))} onBlur={() => onDone(list)} />
      ))}
    </View>
  );
}
