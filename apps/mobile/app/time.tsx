// Your timesheet: this week's hours from the Clock in button. Fixes are made by the office with a reason.
import { View } from 'react-native';
import { workedMinutes, hm } from '@cydras/core';
import { useSession } from '../src/lib/session';
import { useRows } from '../src/lib/sync';
import { today, addDays, weekStart, shortDay, fmtTime, dayKey } from '../src/lib/data';
import { Screen, Card, T, H1, Eyebrow, Pill } from '../src/ui/kit';
import { useT } from '../src/ui/theme';

export default function Time() {
  const { member } = useSession();
  const t = useT();
  const all = useRows<any>('time_entries', (e) => e.member_id === member?.id, [member?.id]).sort((a, b) => b.clock_in.localeCompare(a.clock_in));
  const ws = weekStart(today()), lw = addDays(ws, -7);
  const week = all.filter((e) => dayKey(new Date(e.clock_in)) >= ws);
  const last = all.filter((e) => dayKey(new Date(e.clock_in)) >= lw && dayKey(new Date(e.clock_in)) < ws);
  const sum = (l: any[]) => l.reduce((a, e) => a + workedMinutes(e), 0);
  const Block = ({ title, list }: { title: string; list: any[] }) => <View><Eyebrow style={{ marginBottom: 8 }}>{title} · {hm(sum(list))}</Eyebrow>
    <Card style={{ gap: 0, paddingVertical: 4 }}>{list.map((e, i) => <View key={e.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: i === list.length - 1 ? 0 : 1, borderColor: t.line }}>
      <View style={{ flex: 1 }}><T b>{shortDay(dayKey(new Date(e.clock_in)))}</T><T s size={14}>{fmtTime(e.clock_in)} – {e.clock_out ? fmtTime(e.clock_out) : 'now'}{e.break_minutes ? ` · ${e.break_minutes} min break` : ''}</T></View>
      <T mono>{hm(workedMinutes(e))}</T>{e.approved_at ? <Pill text="OK" kind="done" /> : null}</View>)}
      {!list.length ? <T s style={{ paddingVertical: 10 }}>No hours.</T> : null}</Card></View>;
  return <Screen>
    <Card><T s>This week so far</T><H1>{hm(sum(week))}</H1>{sum(week) > 40 * 60 ? <T b color={t.warn}>Over 40 hours: overtime</T> : null}</Card>
    <Block title="This week" list={week} />
    <Block title="Last week" list={last} />
    <T s size={14}>Wrong time? Ask the office to fix it. Every fix is saved with a reason.</T>
  </Screen>;
}
