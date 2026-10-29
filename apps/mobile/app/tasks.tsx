// Team tasks: your to-dos, and the crew's if you're the owner or a supervisor.
import { useState } from 'react';
import { Alert, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { newId } from '@cydras/core';
import { useSession, isManager } from '../src/lib/session';
import { save, useRows } from '../src/lib/sync';
import { today, addDays, shortDay } from '../src/lib/data';
import { Screen, Card, T, Chips, Chip, Button, Sheet, Field, Eyebrow } from '../src/ui/kit';
import { TaskRow } from '../src/ui/jobs';

export default function Tasks() {
  const p = useLocalSearchParams<{ new?: string }>();
  const { member } = useSession();
  const mgr = isManager(member);
  const tasks = useRows<any>('tasks');
  const team = useRows<any>('members', (m) => m.active !== false).sort((a, b) => a.name.localeCompare(b.name));
  const [who, setWho] = useState(mgr ? 'all' : member!.id);
  const [showDone, setShowDone] = useState(false);
  const [add, setAdd] = useState<any | null>(p.new ? { title: '', assigned_to: member!.id, due_on: addDays(today(), 1) } : null);
  const name = (id: string) => team.find((x) => x.id === id)?.name ?? '';
  const list = tasks.filter((x) => (who === 'all' || x.assigned_to === who) && (showDone || !x.done_at)).sort((a, b) => Number(!!a.done_at) - Number(!!b.done_at) || (a.due_on ?? '9').localeCompare(b.due_on ?? '9'));
  async function saveTask() {
    if (!add.title.trim()) return Alert.alert('Write the task first');
    await save('tasks', { id: newId(), company_id: member!.company_id, created_by: member!.id, assigned_to: add.assigned_to, title: add.title.trim(), due_on: add.due_on || null });
    setAdd(null);
  }
  return (
    <Screen bar={<Button title="+ New task" onPress={() => setAdd({ title: '', assigned_to: member!.id, due_on: addDays(today(), 1) })} />}>
      {mgr ? <Chips>{[['all', 'Everyone'], ...team.map((m) => [m.id, m.id === member!.id ? 'Me' : m.name.split(' ')[0]])].map(([k, l]) => <Chip key={k} label={l} on={who === k} onPress={() => setWho(k)} />)}</Chips> : null}
      <Chips><Chip label={showDone ? 'Hide done' : 'Show done'} onPress={() => setShowDone(!showDone)} /></Chips>
      {list.length ? <Card style={{ paddingVertical: 4, gap: 0 }}>{list.map((x) => <TaskRow key={x.id} task={x} who={who === 'all' ? name(x.assigned_to) : x.created_by !== x.assigned_to ? `from ${name(x.created_by)}` : undefined} />)}</Card> : <T s>{tasks.length ? 'Nothing here.' : 'No tasks yet.'}</T>}
      <Sheet open={!!add} onClose={() => setAdd(null)} title="New task" footer={<Button title="Save task" onPress={saveTask} />}>
        {add ? <>
          <Field label="Task" value={add.title} onChangeText={(v) => setAdd({ ...add, title: v })} placeholder="Name of task" autoFocus />
          {mgr ? <View style={{ gap: 8 }}><Eyebrow>For</Eyebrow><Chips>{team.map((m) => <Chip key={m.id} label={m.id === member!.id ? `${m.name} (you)` : m.name} on={add.assigned_to === m.id} onPress={() => setAdd({ ...add, assigned_to: m.id })} />)}</Chips></View> : null}
          <View style={{ gap: 8 }}><Eyebrow>Due · {add.due_on ? shortDay(add.due_on) : 'no date'}</Eyebrow><Chips>{[['Today', today()], ['Tomorrow', addDays(today(), 1)], ['In a week', addDays(today(), 7)], ['No date', '']].map(([l, v]) => <Chip key={l} label={l} on={add.due_on === v} onPress={() => setAdd({ ...add, due_on: v })} />)}</Chips></View>
        </> : null}
      </Sheet>
    </Screen>
  );
}
