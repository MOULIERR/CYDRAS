// One customer: call or text, addresses with directions, site notes, equipment, jobs and invoices.
import { useState } from 'react';
import { Alert, Linking, Pressable, View } from 'react-native';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { newId, totals } from '@cydras/core';
import { useSession, isManager, can } from '../../src/lib/session';
import { save, useRows } from '../../src/lib/sync';
import { useJobs, useCompany, money, openMaps, fmtDay, addDays, today } from '../../src/lib/data';
import { Screen, Card, H1, T, Eyebrow, SecHead, SmallBtn, Button, Pill, Sheet, Field, Icon, Line, StatusPill } from '../../src/ui/kit';
import { JobRow } from '../../src/ui/jobs';
import { F, useT, useTheme } from '../../src/ui/theme';

export default function CustomerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { member } = useSession();
  const t = useT();
  const { prefs } = useTheme();
  const company = useCompany();
  const c = useRows<any>('customers', (x) => x.id === id, [id])[0];
  const contacts = useRows<any>('customer_contacts', (x) => x.customer_id === id, [id]).sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const sites = useRows<any>('sites', (x) => x.customer_id === id, [id]).sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
  const units = useRows<any>('units', (x) => x.customer_id === id, [id]);
  const invoices = useRows<any>('invoices', (x) => x.customer_id === id && x.status !== 'void', [id]).sort((a, b) => (b.issued_at ?? '').localeCompare(a.issued_at ?? ''));
  const pays = useRows<any>('payments', (x) => x.customer_id === id, [id]);
  const jobs = useJobs(addDays(today(), -3650), addDays(today(), 3650)).filter((j) => j.customer_id === id);
  const [sheet, setSheet] = useState<null | 'note' | 'addr' | 'unit' | 'phone'>(null);
  const [f, setF] = useState<any>({});
  if (!c) return <Screen><T s>Loading…</T></Screen>;
  const up = jobs.filter((j) => j.status !== 'done' && j.starts_at >= new Date(Date.now() - 86400000).toISOString());
  const past = jobs.filter((j) => !up.includes(j)).reverse();
  const owed = (inv: any) => Math.max(0, Number(inv.total) - pays.filter((p) => p.invoice_id === inv.id && p.status === 'succeeded' && !p.voided_at).reduce((a, p) => a + Number(p.amount) - Number(p.refunded_amount ?? 0), 0));
  const seePrices = can(member, 'seePrices');
  const edit = can(member, 'customers');

  async function saveSheet() {
    try {
      if (sheet === 'note') { const v = (f.note ?? '').trim(); if (!v) return; await save('customers', { id: c.id, notes: [...(c.notes ?? []), v] }); }
      if (sheet === 'addr') { const v = (f.addr ?? '').trim(); if (!v) return; await save('sites', { id: newId(), company_id: c.company_id, customer_id: c.id, address: v, label: f.label?.trim() || 'Main', is_primary: !sites.length }); }
      if (sheet === 'unit') { if (!(f.type ?? '').trim()) return; await save('units', { id: newId(), company_id: c.company_id, customer_id: c.id, site_id: sites[0]?.id ?? null, type: f.type.trim(), tag: f.tag?.trim() || null, make: f.make?.trim() || null, model: f.model?.trim() || null, serial: f.serial?.trim() || null, year: Number(f.year) || null }); }
      if (sheet === 'phone') { const v = (f.value ?? '').trim(); if (!v) return; const kind = v.includes('@') ? 'email' : 'phone'; await save('customer_contacts', { id: newId(), company_id: c.company_id, customer_id: c.id, kind, value: v, label: f.label?.trim() || null, is_primary: !contacts.some((x) => x.kind === kind), sms_consent_at: kind === 'phone' && f.consent ? new Date().toISOString() : null, sms_consent_source: kind === 'phone' && f.consent ? `phone app, by ${member!.name}` : null }); }
      setSheet(null); setF({});
    } catch (e) { Alert.alert('Not saved', (e as Error).message); }
  }

  return (
    <Screen bar={isManager(member) ? <Button title="+ Book a job" onPress={() => router.push(`/newjob?c=${c.id}`)} /> : undefined}>
      <Stack.Screen options={{ title: c.name }} />
      <Card>
        <Eyebrow>{c.kind === 'business' ? 'Business' : c.kind === 'condo' ? 'Condo / HOA' : 'Home'}{c.contact ? ` · ${c.contact}` : ''}</Eyebrow>
        <H1>{c.name}</H1>
        {contacts.map((x) => <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderColor: t.line }}>
          <View style={{ flex: 1 }}><T b>{x.value}</T><T s size={13}>{[x.label, x.who, x.is_primary ? 'Main' : '', x.kind === 'phone' ? (x.opted_out_at ? 'Replied STOP' : x.sms_consent_at ? 'OK to text' : 'Not OK to text yet') : ''].filter(Boolean).join(' · ')}</T></View>
          {x.kind === 'phone' ? <><SmallBtn title="Call" icon="phone" onPress={() => Linking.openURL(`tel:${x.value}`)} /><SmallBtn title="Text" icon="chat" onPress={() => router.push(`/thread/${c.id}`)} /></> : <SmallBtn title="Email" onPress={() => Linking.openURL(`mailto:${x.value}`)} />}
        </View>)}
        {edit ? <Pressable onPress={() => { setF({ consent: false }); setSheet('phone'); }}><T b color={t.accent}>+ Add phone or email</T></Pressable> : null}
      </Card>

      <View><SecHead title={`Addresses · ${sites.length}`}>{edit ? <SmallBtn title="+ Add" onPress={() => { setF({}); setSheet('addr'); }} /> : null}</SecHead>
        <View style={{ gap: 8 }}>{sites.map((s) => <Card key={s.id} onPress={() => openMaps(s.address, prefs.mapApp)}>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Icon name="pin" size={18} color={t.accent} /><T b style={{ flex: 1 }}>{s.address}</T><T s size={13}>Directions ›</T></View>
          {s.label && s.label !== 'Main' ? <T s size={13}>{s.label}</T> : null}
          {(s.site_notes ?? []).map((n: string, i: number) => <T key={i} s size={14}>🔒 {n}</T>)}</Card>)}
          {!sites.length ? <T s>No address yet.</T> : null}</View></View>

      <View><SecHead title="Site notes · team only">{edit ? <SmallBtn title="+ Add" onPress={() => { setF({}); setSheet('note'); }} /> : null}</SecHead>
        {(c.notes ?? []).length ? <Card style={{ gap: 4 }}>{(c.notes as string[]).map((n, i) => <View key={i} style={{ flexDirection: 'row', gap: 8, paddingVertical: 4 }}><Icon name="lock" size={16} color={t.warn} /><T style={{ flex: 1 }}>{n}</T></View>)}</Card> : <T s>Gate codes, dogs, where the unit is. Shows on every job here.</T>}</View>

      <View><SecHead title={`Equipment · ${units.length}`}>{edit ? <SmallBtn title="+ Add" onPress={() => { setF({}); setSheet('unit'); }} /> : null}</SecHead>
        <View style={{ gap: 8 }}>{units.map((u) => <Card key={u.id}><T b>{[u.tag, u.type].filter(Boolean).join(' · ')}</T><T s mono size={13.5}>{[u.make, u.model, u.serial && `S/N ${u.serial}`, u.year].filter(Boolean).join(' · ') || 'No details yet'}</T>{u.year ? <T s size={13}>{new Date().getFullYear() - u.year} years old</T> : null}</Card>)}
          {!units.length ? <T s>No equipment yet.</T> : null}</View></View>

      <View><Eyebrow style={{ marginBottom: 8 }}>Coming up · {up.length}</Eyebrow>{up.length ? <View style={{ gap: 10 }}>{up.map((j) => <JobRow key={j.id} j={j} company={company} showDay />)}</View> : <T s>No upcoming jobs.</T>}</View>
      {past.length ? <View><Eyebrow style={{ marginBottom: 8 }}>Past calls · {past.length}</Eyebrow><View style={{ gap: 10 }}>{past.slice(0, 20).map((j) => <JobRow key={j.id} j={j} company={company} showDay />)}</View></View> : null}

      {seePrices && invoices.length ? <View><Eyebrow style={{ marginBottom: 8 }}>Invoices · {invoices.length}</Eyebrow><Card style={{ gap: 0, paddingVertical: 6 }}>
        {invoices.map((i) => { const o = owed(i); return <Pressable key={i.id} onPress={() => i.job_id && router.push(`/job/${i.job_id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, borderBottomWidth: 1, borderColor: t.line }}>
          <View style={{ flex: 1 }}><T b>Invoice {i.number ? `#${i.number}` : ''}</T><T s size={13}>{i.issued_at ? fmtDay(i.issued_at) : ''}</T></View><T mono>{money(Number(i.total))}</T>{o > 0 ? <Pill text={`${money(o)} due`} kind="warn" /> : <Pill text="Paid" kind="done" />}</Pressable>; })}
      </Card></View> : null}

      <Sheet open={!!sheet} onClose={() => setSheet(null)} title={{ note: 'Add a site note', addr: 'Add an address', unit: 'Add equipment', phone: 'Add phone or email' }[sheet ?? 'note']} footer={<Button title="Save" onPress={saveSheet} />}>
        {sheet === 'note' ? <Field label="Note (team only)" multiline value={f.note ?? ''} onChangeText={(v) => setF({ ...f, note: v })} placeholder="Gate code, where the unit is, dogs" autoFocus /> : null}
        {sheet === 'addr' ? <><Field label="Address" value={f.addr ?? ''} onChangeText={(v) => setF({ ...f, addr: v })} autoFocus /><Field label="Name (optional)" value={f.label ?? ''} onChangeText={(v) => setF({ ...f, label: v })} placeholder="Rental, Unit 4" /></> : null}
        {sheet === 'unit' ? <><Field label="Type" value={f.type ?? ''} onChangeText={(v) => setF({ ...f, type: v })} placeholder="Rooftop unit, Split system" autoFocus /><Field label="Where it is" value={f.tag ?? ''} onChangeText={(v) => setF({ ...f, tag: v })} placeholder="Upstairs, RTU-2" />
          <Field label="Make" value={f.make ?? ''} onChangeText={(v) => setF({ ...f, make: v })} /><Field label="Model" value={f.model ?? ''} onChangeText={(v) => setF({ ...f, model: v })} autoCapitalize="characters" />
          <Field label="Serial" value={f.serial ?? ''} onChangeText={(v) => setF({ ...f, serial: v })} autoCapitalize="characters" /><Field label="Year installed" value={f.year ?? ''} onChangeText={(v) => setF({ ...f, year: v })} keyboardType="number-pad" /></> : null}
        {sheet === 'phone' ? <><Field label="Phone or email" value={f.value ?? ''} onChangeText={(v) => setF({ ...f, value: v })} autoCapitalize="none" autoFocus /><Field label="Label (optional)" value={f.label ?? ''} onChangeText={(v) => setF({ ...f, label: v })} placeholder="Mobile, Office, Billing" />
          <Pressable onPress={() => setF({ ...f, consent: !f.consent })} style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}><View style={{ width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: f.consent ? t.ok : t.line, backgroundColor: f.consent ? t.ok : 'transparent' }} /><T s style={{ flex: 1 }}>The customer said it's OK to text this number</T></Pressable></> : null}
      </Sheet>
    </Screen>
  );
}
