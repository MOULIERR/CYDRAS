// Today, like the phone mockup. Techs: up next, their day as a timeline, tasks.
// Supervisors: crew today and who's where. Owner: the business today.
import { useMemo, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { newId, hm, workedMinutes, totals } from '@cydras/core';
import { useSession, isManager, can } from '../../src/lib/session';
import { save, useRows } from '../../src/lib/sync';
import { startShiftTracking, stopShiftTracking } from '../../src/lib/location';
import { useJobs, useCompany, today, addDays, longDay, fmtTime, money, openMaps, greeting, type JobX } from '../../src/lib/data';
import { useThreads } from '../../src/lib/inbox';
import { config } from '../../src/lib/config';
import { Screen, Card, T, Eyebrow, SecHead, SmallBtn, Button, AlertRow, StatusPill, Avatar, Icon } from '../../src/ui/kit';
import { JobRow, TaskRow, Ring, QuickAction, CatTag } from '../../src/ui/jobs';
import { F, shadow, useT, useTheme } from '../../src/ui/theme';

export default function Today() {
  const { member } = useSession();
  const t = useT();
  const { prefs } = useTheme();
  const company = useCompany();
  const d = today();
  const mine = useJobs(d, addDays(d, 1), true);
  const all = useJobs(d, addDays(d, 1));
  const tasks = useRows<any>('tasks', (x) => !x.deleted_at);
  const team = useRows<any>('members', (m) => m.active !== false);
  const { threads } = useThreads();
  const unread = threads.filter((x) => x.unread).length;
  if (!member) return null;
  const role = member.role;
  const myTasks = tasks.filter((x) => x.assigned_to === member.id && !x.done_at).sort((a, b) => (a.due_on ?? '9').localeCompare(b.due_on ?? '9'));
  const name = (id: string) => team.find((p) => p.id === id)?.name ?? '';

  return (
    <Screen>
      <ClockCard />
      {role === 'owner' ? <OwnerToday all={all} company={company} unread={unread} tasks={tasks} myTasks={myTasks} />
        : role === 'supervisor' ? <SupToday all={all} mine={mine} company={company} unread={unread} myTasks={myTasks} team={team} />
          : <TechToday mine={mine} company={company} unread={unread} mapApp={prefs.mapApp} />}
      {role !== 'owner' && role !== 'supervisor' && <Tasks list={myTasks} name={name} />}
      <View><Eyebrow style={{ marginBottom: 8 }}>Quick actions</Eyebrow>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {isManager(member) ? <QuickAction icon="calendar" label="New appointment" onPress={() => router.push('/newjob')} /> : <QuickAction icon="user" label="New customer" onPress={() => router.push('/newcust')} />}
          <QuickAction icon="list" label="New task" onPress={() => router.push('/tasks?new=1')} />
          <QuickAction icon="chat" label="Texts" onPress={() => router.push('/inbox')} />
          {role === 'owner' ? <QuickAction icon="chart" label="Reports" onPress={() => WebBrowser.openBrowserAsync(`${config.officeUrl}/reports`)} /> : <QuickAction icon="tag" label="Price book" onPress={() => router.push('/pricebook')} />}
        </View></View>
    </Screen>
  );
}

function Head({ title, right }: { title: string; right?: React.ReactNode }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
    <View style={{ flex: 1 }}><T s>{longDay(today())}</T><T style={{ fontFamily: F.display, fontSize: 32, lineHeight: 34 }}>{title}</T></View>{right}</View>;
}

function Tasks({ list, name }: { list: any[]; name: (id: string) => string }) {
  return <View><SecHead title={`Your tasks · ${list.length}`}><SmallBtn title="+ New" onPress={() => router.push('/tasks?new=1')} /><SmallBtn title="All" onPress={() => router.push('/tasks')} /></SecHead>
    {list.length ? <Card style={{ paddingVertical: 4, gap: 0 }}>{list.slice(0, 3).map((x) => <TaskRow key={x.id} task={x} who={x.created_by !== x.assigned_to ? `from ${name(x.created_by)}` : undefined} />)}</Card> : <T s>Nothing on your list.</T>}</View>;
}

function TechToday({ mine, company, unread, mapApp }: { mine: JobX[]; company: any; unread: number; mapApp: any }) {
  const t = useT();
  const me = useSession().member?.id;
  const done = mine.filter((j) => j.status === 'done').length;
  const next = mine.find((j) => j.status !== 'done');
  const notes = next ? [...next.siteNotes, ...next.custNotes] : [];
  return <>
    <Head title={mine.length ? `${mine.length} job${mine.length > 1 ? 's' : ''} today` : 'No jobs today'} right={<Ring done={done} total={mine.length} />} />
    {unread ? <AlertRow text={`${unread} unread text${unread > 1 ? 's' : ''} from customers`} onPress={() => router.push('/inbox')} /> : null}
    {next ? <View style={{ backgroundColor: t.steel, borderRadius: 18, padding: 14, gap: 3, ...shadow(t) }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}><Text style={{ fontFamily: F.semi, fontSize: 12, letterSpacing: 1.2, textTransform: 'uppercase', color: t.accent }}>Up next · {fmtTime(next.starts_at)}–{fmtTime(next.ends_at)}</Text><StatusPill s={next.status} /></View>
      <Text style={{ fontFamily: F.display, fontSize: 24, color: t.steelInk }}>{next.customer}</Text>
      <Text style={{ fontFamily: F.body, fontSize: 15, color: t.steelInk, opacity: 0.85 }}>{next.type}</Text>
      {next.address ? <View style={{ flexDirection: 'row', gap: 6, marginTop: 2 }}><Icon name="pin" size={16} color={t.steelInk} /><Text style={{ fontFamily: F.body, fontSize: 14, color: t.steelInk, opacity: 0.9, flex: 1 }}>{next.address}</Text></View> : null}
      {notes.length ? <View style={{ flexDirection: 'row', gap: 6, backgroundColor: 'rgba(255,255,255,.08)', borderRadius: 8, padding: 6, marginTop: 3 }}><Icon name="lock" size={16} color={t.warn} /><Text style={{ fontFamily: F.body, fontSize: 13.5, color: t.steelInk, flex: 1 }}>{notes[0].length > 70 ? notes[0].slice(0, 70) + '…' : notes[0]}{notes.length > 1 ? ` +${notes.length - 1} more` : ''}</Text></View> : null}
      {next.techNames.length > 1 ? <Text style={{ fontFamily: F.body, fontSize: 13, color: t.steelInk, opacity: 0.75 }}>With {next.techNames.filter((n, i) => next.techIds[i] !== me).join(', ')}</Text> : null}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        {next.address ? <View style={{ flex: 1 }}><Button title="Directions" kind="ghost" small onPress={() => openMaps(next.address, mapApp)} /></View> : null}
        <View style={{ flex: 1.4 }}><Button title="Open job" small onPress={() => router.push(`/job/${next.id}`)} /></View>
      </View>
    </View> : mine.length ? <Card style={{ alignItems: 'center', backgroundColor: t.steel }}><Text style={{ fontFamily: F.display, fontSize: 24, color: t.steelInk }}>All done for today</Text><Text style={{ color: t.steelInk, opacity: 0.8, fontFamily: F.body }}>{done} job{done > 1 ? 's' : ''} finished</Text></Card> : null}
    {mine.length ? <View><Eyebrow style={{ marginBottom: 6 }}>Your day</Eyebrow>
      {mine.map((j, i) => { const st = j.status === 'done' ? 'done' : j === next ? 'now' : ''; return <View key={j.id} style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ width: 62, paddingTop: 17 }}><T mono s size={12.5} lines={1} style={{ textAlign: 'right' }}>{fmtTime(j.starts_at)}</T></View>
        <View style={{ width: 22, alignItems: 'center' }}>
          <View style={{ position: 'absolute', top: i === 0 ? 26 : 0, bottom: i === mine.length - 1 ? '70%' : 0, width: 2, backgroundColor: t.line }} />
          <View style={{ marginTop: 18, width: 18, height: 18, borderRadius: 9, backgroundColor: st === 'done' ? t.ok : st === 'now' ? t.accent : t.surface, borderWidth: st ? 0 : 2, borderColor: t.line, alignItems: 'center', justifyContent: 'center', ...(st === 'now' ? { shadowColor: t.accent, shadowOpacity: 0.4, shadowRadius: 5 } : {}) }}>{st === 'done' ? <Text style={{ color: '#fff', fontSize: 11, fontFamily: F.bold }}>✓</Text> : null}</View>
        </View>
        <Pressable onPress={() => router.push(`/job/${j.id}`)} style={({ pressed }) => ({ flex: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: st === 'now' ? t.accent : t.line, borderRadius: 14, padding: 12, marginVertical: 6, opacity: st === 'done' ? 0.65 : pressed ? 0.85 : 1, ...shadow(t) })}>
          <CatTag company={company} name={j.category} /><T b>{j.customer}</T><T s size={14}>{j.type}</T></Pressable>
      </View>; })}</View> : <T s>Nothing on your schedule. Check the Schedule tab for other days.</T>}
  </>;
}

function SupToday({ all, mine, company, unread, myTasks, team }: { all: JobX[]; mine: JobX[]; company: any; unread: number; myTasks: any[]; team: any[] }) {
  const t = useT();
  const { member } = useSession();
  const crew = team.filter((p) => p.id !== member!.id && p.role !== 'owner');
  const name = (id: string) => team.find((p) => p.id === id)?.name ?? '';
  const need = all.filter((j) => !j.techIds.length && j.status !== 'done');
  return <>
    <Head title="Crew today" />
    {need.length ? <AlertRow text={`${need.length} job${need.length > 1 ? 's' : ''} today need${need.length > 1 ? '' : 's'} a tech`} onPress={() => router.push(`/job/${need[0].id}`)} /> : null}
    {unread ? <AlertRow text={`${unread} unread text${unread > 1 ? "s" : ""} from customers`} onPress={() => router.push('/inbox')} /> : null}
    <View><Eyebrow style={{ marginBottom: 8 }}>Who's where</Eyebrow>
      <Card style={{ paddingVertical: 6, gap: 0 }}>{crew.map((p, i) => { const tj = all.filter((j) => j.techIds.includes(p.id)); return <View key={p.id} style={{ flexDirection: 'row', gap: 10, paddingVertical: 10, borderBottomWidth: i === crew.length - 1 ? 0 : 1, borderColor: t.line, alignItems: 'flex-start' }}>
        <T b style={{ width: 70 }}>{p.name.split(' ')[0]}</T>
        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{tj.map((j) => <Pressable key={j.id} onPress={() => router.push(`/job/${j.id}`)} style={{ borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, backgroundColor: j.status === 'on_site' ? t.steel : j.status === 'on_the_way' ? t.accent : j.status === 'done' ? t.ok : t.chip }}>
          <Text style={{ fontFamily: F.semi, fontSize: 13, color: j.status === 'scheduled' ? t.ink : '#fff' }}>{fmtTime(j.starts_at)} {j.customer}</Text></Pressable>)}
          {!tj.length ? <T s size={13.5}>Free today</T> : null}</View></View>; })}
        {!crew.length ? <T s>No techs yet. Add them on the office website.</T> : null}</Card></View>
    <View><SecHead title={`Your tasks · ${myTasks.length}`}><SmallBtn title="+ New" onPress={() => router.push('/tasks?new=1')} /><SmallBtn title="Crew tasks" onPress={() => router.push('/tasks')} /></SecHead>
      {myTasks.length ? <Card style={{ paddingVertical: 4, gap: 0 }}>{myTasks.slice(0, 4).map((x) => <TaskRow key={x.id} task={x} who={x.created_by !== x.assigned_to ? `from ${name(x.created_by)}` : undefined} />)}</Card> : <T s>Nothing on your list.</T>}</View>
    <View><Eyebrow style={{ marginBottom: 8 }}>Your jobs today · {mine.length}</Eyebrow>{mine.length ? <View style={{ gap: 10 }}>{mine.map((j) => <JobRow key={j.id} j={j} company={company} />)}</View> : <T s>You're not on any jobs today.</T>}</View>
  </>;
}

function OwnerToday({ all, company, unread, tasks, myTasks }: { all: JobX[]; company: any; unread: number; tasks: any[]; myTasks: any[] }) {
  const t = useT();
  const pays = useRows<any>('payments');
  const invoices = useRows<any>('invoices', (i) => i.status === 'open');
  const d = today();
  const collected = pays.filter((p) => p.status === 'succeeded' && !p.voided_at && p.taken_at?.slice(0, 10) === d).reduce((a, p) => a + Number(p.amount) - Number(p.refunded_amount ?? 0), 0);
  const unpaid = invoices.map((i) => Math.max(0, Number(i.total) - pays.filter((p) => p.invoice_id === i.id && p.status === 'succeeded' && !p.voided_at).reduce((a, p) => a + Number(p.amount) - Number(p.refunded_amount ?? 0), 0))).filter((x) => x > 0);
  const late = tasks.filter((x) => !x.done_at && x.due_on && x.due_on < d).length;
  const done = all.filter((j) => j.status === 'done').length;
  const need = all.filter((j) => !j.techIds.length && j.status !== 'done');
  const stat = (l: string, v: string, go?: () => void) => <Pressable onPress={go} disabled={!go} style={{ flexBasis: '48%', flexGrow: 1, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 16, padding: 12, gap: 2, ...shadow(t) }}><T s size={14}>{l}</T><T mono size={20}>{v}</T></Pressable>;
  return <>
    <Head title="Your business today" />
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {stat('Collected today', money(collected))}{stat('Jobs done', `${done} of ${all.length}`)}
      {stat('Unpaid', money(unpaid.reduce((a, x) => a + x, 0)), () => router.push('/unpaid'))}{stat('Open tasks', String(tasks.filter((x) => !x.done_at).length), () => router.push('/tasks'))}
    </View>
    {(need.length || unpaid.length || unread || late) ? <View><Eyebrow style={{ marginBottom: 8 }}>Needs you</Eyebrow><View style={{ gap: 6 }}>
      {need.length ? <AlertRow text={`${need.length} job${need.length > 1 ? 's' : ''} today need a tech`} onPress={() => router.push(`/job/${need[0].id}`)} /> : null}
      {unpaid.length ? <AlertRow color={t.warn} text={`${unpaid.length} unpaid invoice${unpaid.length > 1 ? 's' : ''} · ${money(unpaid.reduce((a, x) => a + x, 0))}`} onPress={() => router.push('/unpaid')} /> : null}
      {unread ? <AlertRow text={`${unread} unread text${unread > 1 ? "s" : ""} from customers`} onPress={() => router.push('/inbox')} /> : null}
      {late ? <AlertRow text={`${late} late task${late > 1 ? 's' : ''} on the team`} onPress={() => router.push('/tasks')} /> : null}
    </View></View> : null}
    <View><SecHead title={`All jobs today · ${all.length}`}><SmallBtn title="Schedule" onPress={() => router.push('/schedule')} /></SecHead>
      {all.length ? <View style={{ gap: 10 }}>{all.map((j) => <JobRow key={j.id} j={j} company={company} />)}</View> : <T s>Nothing scheduled today.</T>}</View>
    <View><SecHead title={`Your tasks · ${myTasks.length}`}><SmallBtn title="+ New" onPress={() => router.push('/tasks?new=1')} /><SmallBtn title="All tasks" onPress={() => router.push('/tasks')} /></SecHead>
      {myTasks.length ? <Card style={{ paddingVertical: 4, gap: 0 }}>{myTasks.slice(0, 3).map((x) => <TaskRow key={x.id} task={x} />)}</Card> : <T s>Nothing on your list.</T>}</View>
  </>;
}

/** Clock in / break / clock out. Location is shared only while clocked in. */
function ClockCard() {
  const { member } = useSession();
  const t = useT();
  const open = useRows<any>('time_entries', (e) => e.member_id === member?.id && !e.clock_out, [member?.id])[0];
  const [busy, setBusy] = useState(false);
  if (!member) return null;
  async function clockIn() {
    setBusy(true);
    await save('time_entries', { id: newId(), company_id: member!.company_id, member_id: member!.id, clock_in: new Date().toISOString(), break_minutes: 0 });
    const perm = await startShiftTracking(member!.company_id).catch(() => 'denied' as const);
    if (perm === 'denied') Alert.alert('Location is off', 'Turn on location for Cydras so drive time counts and the office can dispatch you.');
    setBusy(false);
  }
  async function toggleBreak() {
    if (open.on_break_since) {
      const mins = Math.max(1, Math.round((Date.now() - new Date(open.on_break_since).getTime()) / 60000));
      await save('time_entries', { id: open.id, break_minutes: (open.break_minutes ?? 0) + mins, on_break_since: null });
    } else await save('time_entries', { id: open.id, on_break_since: new Date().toISOString() });
  }
  function clockOut() {
    const go = async () => {
      const extra = open.on_break_since ? Math.round((Date.now() - new Date(open.on_break_since).getTime()) / 60000) : 0;
      await save('time_entries', { id: open.id, clock_out: new Date().toISOString(), on_break_since: null, break_minutes: (open.break_minutes ?? 0) + extra });
      await stopShiftTracking();
    };
    Alert.alert('Clock out?', `You worked ${hm(workedMinutes(open))} today.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Clock out', onPress: go }]);
  }
  if (!open) return <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
    <View style={{ flex: 1 }}><T b>{greeting()}, {member.name.split(' ')[0]}</T><T s size={14}>Clock in when you start your day.</T></View>
    <View style={{ width: 140 }}><Button title="Clock in" small onPress={clockIn} busy={busy} icon="clock" /></View></Card>;
  return <Card style={{ gap: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: open.on_break_since ? t.warn : t.ok }} />
      <T b style={{ flex: 1 }}>{open.on_break_since ? 'On break' : 'Clocked in'} at {fmtTime(open.clock_in)} · {hm(workedMinutes(open))}</T></View>
    <T s size={13.5}>Your location is shared with the office only while you're clocked in.</T>
    <View style={{ flexDirection: 'row', gap: 8 }}><Button small kind="secondary" title={open.on_break_since ? 'End break' : 'Break'} onPress={toggleBreak} /><Button small kind="secondary" title="Clock out" onPress={clockOut} /></View>
  </Card>;
}
