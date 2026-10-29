// Schedule, like the phone mockup: a week row (swipe or ‹ › for weeks), "Show whole month",
// and the jobs for the day you tap. Managers can add an appointment for that day.
import { useMemo, useRef, useState } from 'react';
import { PanResponder, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSession, isManager } from '../../src/lib/session';
import { useJobs, useCompany, today, addDays, dayKey, dayStart, weekStart, longDay, DOW, MON } from '../../src/lib/data';
import { Screen, T, Eyebrow, Button, Chip } from '../../src/ui/kit';
import { JobRow } from '../../src/ui/jobs';
import { F, shadow, useT } from '../../src/ui/theme';

export default function Schedule() {
  const { member } = useSession();
  const t = useT();
  const company = useCompany();
  const [day, setDay] = useState(today());
  const [full, setFull] = useState(false);
  const ws = weekStart(day);
  const mStart = day.slice(0, 8) + '01';
  const gridStart = weekStart(mStart);
  const range = useJobs(addDays(gridStart, -7), addDays(gridStart, 49));
  const has = useMemo(() => { const s = new Set<string>(); for (const j of range) s.add(dayKey(new Date(j.starts_at))); return s; }, [range]);
  const list = range.filter((j) => dayKey(new Date(j.starts_at)) === day);
  const off = Math.round((dayStart(ws).getTime() - dayStart(weekStart(today())).getTime()) / (7 * 86400000));
  const wkName = off === 0 ? 'This week' : off === -1 ? 'Last week' : off === 1 ? 'Next week' : off < 0 ? `${-off} weeks ago` : `In ${off} weeks`;
  const d0 = dayStart(ws), d6 = dayStart(addDays(ws, 6));
  const rng = d0.getMonth() === d6.getMonth() ? `${MON[d0.getMonth()]} ${d0.getDate()} – ${d6.getDate()}` : `${MON[d0.getMonth()]} ${d0.getDate()} – ${MON[d6.getMonth()]} ${d6.getDate()}`;
  const step = (n: number) => setDay(full ? (() => { const x = dayStart(mStart); x.setMonth(x.getMonth() + n); return dayKey(x); })() : addDays(day, 7 * n));
  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 24 || Math.abs(g.dy) > 30,
    onPanResponderRelease: (_e, g) => { if (Math.abs(g.dx) > Math.abs(g.dy) && Math.abs(g.dx) > 50) stepRef.current(g.dx < 0 ? 1 : -1); else if (Math.abs(g.dy) > 50) setFull(g.dy > 0); },
  })).current;
  const stepRef = useRef(step); stepRef.current = step;

  const Day = ({ k, out }: { k: string; out?: boolean }) => {
    const on = k === day, isT = k === today();
    return <Pressable onPress={() => setDay(k)} accessibilityLabel={`${longDay(k)}${has.has(k) ? ', has jobs' : ''}`} accessibilityState={{ selected: on }}
      style={{ flex: 1, height: 46, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.steel : 'transparent', borderWidth: isT && !on ? 2 : 0, borderColor: t.accent, opacity: out ? 0.45 : 1 }}>
      <Text style={{ fontFamily: F.semi, fontSize: 16, color: on ? t.steelInk : t.ink }}>{dayStart(k).getDate()}</Text>
      {has.has(k) ? <View style={{ position: 'absolute', bottom: 5, width: 5, height: 5, borderRadius: 3, backgroundColor: t.accent }} /> : null}
    </Pressable>;
  };
  const weeks = full ? [0, 1, 2, 3, 4, 5].map((w) => addDays(gridStart, w * 7)).filter((w) => w.slice(0, 7) <= mStart.slice(0, 7)) : [ws];

  return (
    <Screen bar={isManager(member) ? <Button title="+ New appointment" onPress={() => router.push(`/newjob?d=${day}`)} /> : undefined}>
      <View {...pan.panHandlers} style={{ backgroundColor: t.surface, borderRadius: 20, borderWidth: 1, borderColor: t.line, padding: 12, gap: 6, ...shadow(t) }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Pressable onPress={() => step(-1)} accessibilityLabel={full ? 'Previous month' : 'Previous week'} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 28, color: t.ink, marginTop: -4 }}>‹</Text></Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}><Text style={{ fontFamily: F.display, fontSize: 24, color: t.ink }}>{dayStart(day).toLocaleString('en-US', { month: 'long', year: 'numeric' })}</Text>{!full ? <T s size={13.5}>{rng} · {wkName}</T> : null}</View>
          <Pressable onPress={() => step(1)} accessibilityLabel={full ? 'Next month' : 'Next week'} style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 1.5, borderColor: t.line, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 28, color: t.ink, marginTop: -4 }}>›</Text></Pressable>
        </View>
        <View style={{ flexDirection: 'row' }}>{DOW.map((x) => <Text key={x} style={{ flex: 1, textAlign: 'center', fontFamily: F.semi, fontSize: 11, letterSpacing: 1, color: t.muted }}>{x.toUpperCase()}</Text>)}</View>
        {weeks.map((w) => <View key={w} style={{ flexDirection: 'row', gap: 2 }}>{[0, 1, 2, 3, 4, 5, 6].map((i) => { const k = addDays(w, i); return <Day key={k} k={k} out={full && k.slice(0, 7) !== mStart.slice(0, 7)} />; })}</View>)}
        <Pressable onPress={() => setFull(!full)} accessibilityRole="button" style={{ alignItems: 'center', gap: 4, paddingTop: 6 }}>
          <View style={{ width: 38, height: 5, borderRadius: 3, backgroundColor: t.line }} /><T s size={12.5} b>{full ? 'Show week only' : 'Show whole month'}</T></Pressable>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: -8 }}>
        <T s size={13}>{full ? 'Swipe left or right for months' : 'Swipe left or right for weeks'}</T>
        {day !== today() ? <Chip label="Today" onPress={() => setDay(today())} /> : null}
      </View>
      <View><Eyebrow style={{ marginBottom: 8 }}>{longDay(day)} · {list.length} job{list.length === 1 ? '' : 's'}</Eyebrow>
        {list.length ? <View style={{ gap: 10 }}>{list.map((j) => <JobRow key={j.id} j={j} company={company} />)}</View> : <T s>{day < today() ? 'No jobs that day.' : 'Nothing scheduled.'}</T>}</View>
    </Screen>
  );
}
