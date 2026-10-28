// Today: clock in/out, and the jobs for today.
import { useMemo, useState } from 'react';
import { Alert, View } from 'react-native';
import { router } from 'expo-router';
import { newId, hm, workedMinutes } from '@cydras/core';
import { useSession } from '../../src/lib/session';
import { save, useRows } from '../../src/lib/sync';
import { startShiftTracking, stopShiftTracking } from '../../src/lib/location';
import { useMyJobs, fmtTime, STATUS } from '../../src/lib/data';
import { Screen, Card, H1, H2, Small, Button, Row, Pill, C } from '../../src/ui/kit';

export default function Today() {
  const { member } = useSession();
  const entries = useRows<any>('time_entries', (e) => e.member_id === member?.id && !e.clock_out, [member?.id]);
  const open = entries[0];
  const [busy, setBusy] = useState(false);
  const start = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const end = useMemo(() => new Date(start.getTime() + 86400000), [start]);
  const jobs = useMyJobs(start, end);
  if (!member) return null;

  async function clockIn() {
    setBusy(true);
    await save('time_entries', { id: newId(), company_id: member!.company_id, member_id: member!.id, clock_in: new Date().toISOString(), break_minutes: 0 });
    const perm = await startShiftTracking(member!.company_id);
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
    Alert.alert('Clock out?', `You worked ${hm(workedMinutes(open))} today.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Clock out', onPress: async () => {
        const extra = open.on_break_since ? Math.round((Date.now() - new Date(open.on_break_since).getTime()) / 60000) : 0;
        await save('time_entries', { id: open.id, clock_out: new Date().toISOString(), on_break_since: null, break_minutes: (open.break_minutes ?? 0) + extra });
        await stopShiftTracking();
      } },
    ]);
  }

  return (
    <Screen>
      <H1>{new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, {member.name.split(' ')[0]}</H1>
      <Card>
        {open ? <>
          <H2>{open.on_break_since ? 'On break' : 'Clocked in'} · {fmtTime(open.clock_in)}</H2>
          <Small>{hm(workedMinutes(open))} worked today. Your location is shared only while you're clocked in.</Small>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={{ flex: 1 }}><Button title={open.on_break_since ? 'End break' : 'Start break'} kind="secondary" onPress={toggleBreak} /></View>
            <View style={{ flex: 1 }}><Button title="Clock out" kind="secondary" onPress={clockOut} /></View>
          </View>
        </> : <>
          <H2>Not clocked in</H2>
          <Small>Clock in when you start your day.</Small>
          <Button title="Clock in" onPress={clockIn} busy={busy} />
        </>}
      </Card>
      <H2>Today · {jobs.filter((j) => j.status === 'done').length} of {jobs.length} done</H2>
      {jobs.length ? jobs.map((j) => (
        <Row key={j.id} title={j.customer} sub={`${fmtTime(j.starts_at)}–${fmtTime(j.ends_at)} · ${j.category ?? j.type}`}
          right={<Pill text={STATUS[j.status]} color={j.status === 'done' ? C.ok : j.status === 'scheduled' ? C.muted : C.accent} />}
          onPress={() => router.push(`/job/${j.id}`)} />
      )) : <Small>No jobs today.</Small>}
    </Screen>
  );
}
