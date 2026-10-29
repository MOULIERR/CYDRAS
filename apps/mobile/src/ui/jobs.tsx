// Job pieces used on several screens: job row, category tag, task row, progress ring.
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Svg, { Circle } from 'react-native-svg';
import { save } from '../lib/sync';
import { fmtTime, catColor, shortDay, today, dayKey, type JobX } from '../lib/data';
import { useSession } from '../lib/session';
import { F, shadow, useT } from './theme';
import { StatusPill, T } from './kit';
import { Icon } from './icons';

export function CatTag({ company, name }: { company: any; name?: string | null }) {
  const t = useT();
  if (!name) return null;
  const c = catColor(company, name);
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, alignSelf: 'flex-start', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: t.dark ? 'rgba(255,255,255,.06)' : c + '1f', marginBottom: 2 }}>
    <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: c }} /><Text style={{ fontFamily: F.semi, fontSize: 11.5, letterSpacing: 0.6, textTransform: 'uppercase', color: t.dark ? t.ink : c }}>{name}</Text></View>;
}

export function JobRow({ j, company, showDay }: { j: JobX; company: any; showDay?: boolean }) {
  const t = useT();
  const { member } = useSession();
  const others = j.techIds.map((x, i) => (x === member?.id ? '' : j.techNames[i])).filter(Boolean);
  return <Pressable accessibilityRole="button" onPress={() => router.push(`/job/${j.id}`)}
    style={({ pressed }) => [{ backgroundColor: t.surface, borderRadius: 16, padding: 14, minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: j.status === 'on_the_way' || j.status === 'on_site' ? t.accent : t.line, opacity: j.status === 'done' ? 0.8 : 1, ...shadow(t) }, pressed && { opacity: 0.85 }]}>
    <View style={{ width: 64 }}>
      {showDay ? <T b s size={12.5} lines={1}>{shortDay(dayKey(new Date(j.starts_at)))}</T> : null}
      <T mono size={14} lines={1}>{fmtTime(j.starts_at)}</T>
      <T s size={11.5} lines={1}>to {fmtTime(j.ends_at)}</T>
    </View>
    <View style={{ flex: 1, minWidth: 0 }}>
      <CatTag company={company} name={j.category} />
      <T b size={17.5} lines={2}>{j.customer}</T>
      <T s size={14.5} lines={2}><Text style={{ fontFamily: F.mono }}>{j.number ?? ''}</Text>{j.number ? ' · ' : ''}{j.type}{j.parent_job_id ? ` · Visit ${j.visit_number}` : ''}{others.length ? ` · ${j.mine ? 'with ' : ''}${others.join(', ')}` : !j.techIds.length ? ' · Needs a tech' : ''}</T>
    </View>
    <StatusPill s={j.status} />
  </Pressable>;
}

export function TaskRow({ task, who }: { task: any; who?: string }) {
  const t = useT();
  const late = !task.done_at && task.due_on && task.due_on < today();
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: t.line }}>
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: !!task.done_at }} accessibilityLabel={`Done: ${task.title}`}
      onPress={() => save('tasks', { id: task.id, done_at: task.done_at ? null : new Date().toISOString() })}
      style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: task.done_at ? t.ok : t.line, backgroundColor: task.done_at ? t.ok : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
      {task.done_at ? <Text style={{ color: '#fff', fontFamily: F.bold }}>✓</Text> : null}</Pressable>
    <View style={{ flex: 1 }}>
      <T b style={task.done_at ? { textDecorationLine: 'line-through', opacity: 0.6 } : undefined}>{task.title}</T>
      <T s size={13.5} color={late ? t.bad : undefined}>{who ? `${who} · ` : ''}{task.due_on ? `${late ? 'Late · ' : task.due_on === today() ? 'Today · ' : ''}due ${shortDay(task.due_on)}` : 'No due date'}</T>
    </View>
  </View>;
}

export function Ring({ done, total }: { done: number; total: number }) {
  const t = useT();
  const r = 28, c = 2 * Math.PI * r, p = total ? done / total : 0;
  return <View style={{ width: 64, height: 64, alignItems: 'center', justifyContent: 'center' }} accessibilityLabel={`${done} of ${total} jobs done`}>
    <Svg width={64} height={64} style={{ position: 'absolute' }}>
      <Circle cx={32} cy={32} r={r} stroke={t.chip} strokeWidth={7} fill="none" />
      {p > 0 ? <Circle cx={32} cy={32} r={r} stroke={t.accent} strokeWidth={7} fill="none" strokeDasharray={`${c * p} ${c}`} strokeLinecap="round" rotation={-90} origin="32,32" /> : null}
    </Svg>
    <Text style={{ fontFamily: F.semi, fontSize: 14, color: t.muted }}><Text style={{ fontFamily: F.display, fontSize: 20, color: t.ink }}>{done}</Text>/{total}</Text>
  </View>;
}

export function QuickAction({ icon, label, onPress }: { icon: string; label: string; onPress: () => void }) {
  const t = useT();
  return <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: t.surface, borderWidth: 1, borderColor: t.line, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 4, minHeight: 88, transform: [{ scale: pressed ? 0.97 : 1 }], ...shadow(t) })}>
    <View style={{ width: 38, height: 38, borderRadius: 12, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={20} color={t.accent} /></View>
    <Text style={{ fontFamily: F.semi, fontSize: 12.5, color: t.ink, textAlign: 'center' }}>{label}</Text></Pressable>;
}
