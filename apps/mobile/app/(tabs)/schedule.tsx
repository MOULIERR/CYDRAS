import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { router } from 'expo-router';
import { useMyJobs, fmtTime, fmtDay } from '../../src/lib/data';
import { Screen, H2, Row, Button, Small } from '../../src/ui/kit';

export default function Schedule() {
  const [week, setWeek] = useState(0);
  const from = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + week * 7); return d; }, [week]);
  const to = useMemo(() => new Date(from.getTime() + 7 * 86400000), [from]);
  const jobs = useMyJobs(from, to);
  const days = [...Array(7)].map((_, i) => new Date(from.getTime() + i * 86400000));
  return (
    <Screen>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={{ flex: 1 }}><Button title="← Week" kind="secondary" onPress={() => setWeek(week - 1)} /></View>
        <View style={{ flex: 1 }}><Button title="This week" kind="secondary" onPress={() => setWeek(0)} /></View>
        <View style={{ flex: 1 }}><Button title="Week →" kind="secondary" onPress={() => setWeek(week + 1)} /></View>
      </View>
      {days.map((d) => {
        const js = jobs.filter((j) => new Date(j.starts_at).toDateString() === d.toDateString());
        return (
          <View key={d.toISOString()} style={{ gap: 8 }}>
            <H2>{fmtDay(d.toISOString())}</H2>
            {js.length ? js.map((j) => <Row key={j.id} title={j.customer} sub={`${fmtTime(j.starts_at)} · ${j.category ?? j.type}`} onPress={() => router.push(`/job/${j.id}`)} />) : <Small>Open</Small>}
          </View>
        );
      })}
    </Screen>
  );
}
