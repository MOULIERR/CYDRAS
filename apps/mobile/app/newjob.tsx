// New appointment (owner and supervisors): customer, address, what's wrong, day, time window, techs.
// Saves on the phone first, so it works with no signal.
import { useMemo, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { newId } from '@cydras/core';
import { useSession } from '../src/lib/session';
import { save, useRows } from '../src/lib/sync';
import { useCompany, catsOf, TYPES_DEFAULT, today, addDays, dayStart, DOW } from '../src/lib/data';
import { Screen, T, Eyebrow, Field, Button, Chips, Chip, SearchBox, Card, Avatar } from '../src/ui/kit';
import { F, useT } from '../src/ui/theme';

const STARTS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const lbl = (h: number, m = 0) => `${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;

export default function NewJob() {
  const p = useLocalSearchParams<{ c?: string; d?: string }>();
  const { member } = useSession();
  const t = useT();
  const company = useCompany();
  const custs = useRows<any>('customers');
  const sites = useRows<any>('sites');
  const team = useRows<any>('members', (m) => m.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  const [cid, setCid] = useState(p.c ?? '');
  const [q, setQ] = useState('');
  const [siteId, setSiteId] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState('');
  const [day, setDay] = useState(p.d ?? today());
  const [start, setStart] = useState(8);
  const [hours, setHours] = useState<number>(Number(company?.settings?.prefs?.winH ?? 2) || 2);
  const [crew, setCrew] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const c = custs.find((x) => x.id === cid);
  const mySites = sites.filter((s) => s.customer_id === cid);
  const found = useMemo(() => (q.trim() ? custs.filter((x) => x.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 8) : []), [q, custs]);
  const types: string[] = company?.settings?.jobTypes ?? TYPES_DEFAULT;
  const days = Array.from({ length: 21 }, (_, i) => addDays(today(), i));

  async function go() {
    if (!cid) return Alert.alert('Pick the customer');
    if (!type.trim() && !cat) return Alert.alert("Pick what's wrong or the type of work");
    setBusy(true);
    const s = dayStart(day); s.setHours(start, 0, 0, 0);
    const e = new Date(s.getTime() + hours * 3600000);
    const id = newId();
    await save('jobs', { id, company_id: member!.company_id, customer_id: cid, site_id: siteId || mySites.find((x) => x.is_primary)?.id || mySites[0]?.id || null, type: type.trim() || cat, category: cat || null, description: note.trim() || null, starts_at: s.toISOString(), ends_at: e.toISOString(), status: 'scheduled' });
    for (const m of crew) await save('job_assignments', { job_id: id, member_id: m, company_id: member!.company_id }, ['job_id', 'member_id']);
    setBusy(false);
    router.replace(`/job/${id}`);
  }

  return (
    <Screen bar={<Button title="Book it" onPress={go} busy={busy} />}>
      <View style={{ gap: 8 }}><Eyebrow>Customer</Eyebrow>
        {c ? <Card style={{ flexDirection: 'row', alignItems: 'center' }}><T b style={{ flex: 1 }}>{c.name}</T><Chip label="Change" onPress={() => { setCid(''); setSiteId(''); }} /></Card> : <>
          <SearchBox value={q} onChangeText={setQ} placeholder="Type the customer's name" />
          {found.map((x) => <Pressable key={x.id} onPress={() => { setCid(x.id); setQ(''); }} style={{ backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 12, padding: 14 }}><T b>{x.name}</T></Pressable>)}
          <Button small kind="secondary" title="+ New customer" onPress={() => router.push('/newcust?back=newjob')} />
        </>}
        {c && mySites.length > 1 ? <Chips>{mySites.map((s) => <Chip key={s.id} label={s.address} on={(siteId || mySites.find((x) => x.is_primary)?.id) === s.id} onPress={() => setSiteId(s.id)} />)}</Chips> : null}
        {c && mySites.length === 1 ? <T s>{mySites[0].address}</T> : null}
      </View>
      <View style={{ gap: 8 }}><Eyebrow>What's wrong</Eyebrow><Chips>{catsOf(company).map((x) => <Chip key={x.id} label={x.n} color={x.c} on={cat === x.n} onPress={() => setCat(cat === x.n ? '' : x.n)} />)}</Chips></View>
      <View style={{ gap: 8 }}><Eyebrow>Type of work</Eyebrow><Chips>{types.map((x) => <Chip key={x} label={x} on={type === x} onPress={() => setType(type === x ? '' : x)} />)}</Chips>
        <Field value={type} onChangeText={setType} placeholder="Or type it" /></View>
      <View style={{ gap: 8 }}><Eyebrow>Day</Eyebrow>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>{days.map((d) => { const on = d === day; return <Pressable key={d} onPress={() => setDay(d)} style={{ width: 54, minHeight: 72, borderRadius: 14, borderWidth: 1.5, borderColor: on ? t.steel : d === today() ? t.accent : t.line, backgroundColor: on ? t.steel : t.surface, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: F.semi, fontSize: 11, letterSpacing: 0.7, color: on ? t.steelInk : t.muted }}>{d === today() ? 'TODAY' : DOW[dayStart(d).getDay()].toUpperCase()}</Text><Text style={{ fontFamily: F.display, fontSize: 22, color: on ? t.steelInk : t.ink }}>{dayStart(d).getDate()}</Text></Pressable>; })}</ScrollView>
        <Field value={day} onChangeText={setDay} placeholder="YYYY-MM-DD" accessibilityLabel="Day" /></View>
      <View style={{ gap: 8 }}><Eyebrow>Arrival window · {lbl(start)} to {lbl(Math.floor(start + hours), Math.round((hours % 1) * 60))}</Eyebrow>
        <Chips>{STARTS.map((h) => <Chip key={h} label={lbl(h)} on={start === h} onPress={() => setStart(h)} />)}</Chips>
        <Chips>{[1, 2, 3, 4].map((h) => <Chip key={h} label={`${h} hour${h > 1 ? 's' : ''}`} on={hours === h} onPress={() => setHours(h)} />)}</Chips></View>
      <View style={{ gap: 8 }}><Eyebrow>Techs</Eyebrow><Chips>{team.map((m) => <Chip key={m.id} label={m.name} on={crew.includes(m.id)} onPress={() => setCrew(crew.includes(m.id) ? crew.filter((x) => x !== m.id) : [...crew, m.id])} />)}</Chips>
        {!crew.length ? <T s size={14}>No tech picked: it shows as "Needs a tech".</T> : null}</View>
      <Field label="Notes for the tech" multiline value={note} onChangeText={setNote} placeholder="What the customer said" />
    </Screen>
  );
}
