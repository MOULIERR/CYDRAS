// Read helpers over the phone's copy of the data, plus date and money formatting.
import { useEffect, useMemo, useState, useCallback } from 'react';
import { Linking, Platform, ActionSheetIOS, Alert } from 'react-native';
import { formatMoney } from '@cydras/core';
import { useRows } from './sync';
import { useSession, can } from './session';
import { supabase } from './supabase';

export type Job = { id: string; number: number; customer_id: string; site_id: string | null; type: string; category: string | null; starts_at: string; ends_at: string; status: string; summary: string | null; status_times: Record<string, string>; hide_prices: boolean; parent_job_id?: string | null; visit_number?: number; private_notes?: string[] };

// ---- dates (local days as "YYYY-MM-DD")
export const dayKey = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const today = () => dayKey(new Date());
export const dayStart = (k: string) => new Date(k + 'T00:00:00');
export const addDays = (k: string, n: number) => { const d = dayStart(k); d.setDate(d.getDate() + n); return dayKey(d); };
export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const longDay = (k: string) => dayStart(k).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
export const shortDay = (k: string) => dayStart(k).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
export const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const fmtTimeShort = (iso: string) => fmtTime(iso).replace(':00', '').replace(' AM', 'a').replace(' PM', 'p');
export const fmtDay = (iso: string) => shortDay(dayKey(new Date(iso)));
export const win = (a: string, b: string) => `${fmtTime(a).replace(/ (AM|PM)$/, (m) => (fmtTime(a).slice(-2) === fmtTime(b).slice(-2) ? '' : m))}–${fmtTime(b)}`;
export const weekStart = (k: string) => addDays(k, -dayStart(k).getDay());
export const money = formatMoney;
export const money0 = (n: number) => '$' + Math.round(n).toLocaleString('en-US');

// ---- the jobs this person should see (their own, or everyone's if allowed)
export function useJobs(from: string, to: string, onlyMine = false) {
  const { member } = useSession();
  const jobs = useRows<any>('jobs');
  const asg = useRows<any>('job_assignments');
  const customers = useRows<any>('customers');
  const sites = useRows<any>('sites');
  const people = useRows<any>('members');
  return useMemo(() => {
    const cust = new Map(customers.map((c) => [c.id, c]));
    const site = new Map(sites.map((s) => [s.id, s]));
    const name = new Map(people.map((p) => [p.id, p.name]));
    const techs = new Map<string, string[]>();
    for (const a of asg) if (!a.deleted_at) techs.set(a.job_id, [...(techs.get(a.job_id) ?? []), a.member_id]);
    const all = !onlyMine && can(member, 'allJobs');
    const a = dayStart(from).getTime(), b = dayStart(to).getTime();
    return (jobs as Job[])
      .filter((j) => { const s = new Date(j.starts_at).getTime(); return s >= a && s < b && j.status !== 'canceled' && (all || (techs.get(j.id) ?? []).includes(member?.id ?? '')); })
      .sort((x, y) => x.starts_at.localeCompare(y.starts_at))
      .map((j) => {
        const c = cust.get(j.customer_id), s = (j.site_id && site.get(j.site_id)) || sites.find((x) => x.customer_id === j.customer_id && x.is_primary);
        const ids = techs.get(j.id) ?? [];
        return { ...j, customer: c?.name ?? 'Customer', cust: c, address: s?.address ?? '', siteNotes: (s?.site_notes ?? []) as string[], custNotes: (c?.notes ?? []) as string[], techIds: ids, techNames: ids.map((i) => name.get(i) ?? ''), mine: ids.includes(member?.id ?? '') };
      });
  }, [jobs, asg, customers, sites, people, member, from, to, onlyMine]);
}
export type JobX = ReturnType<typeof useJobs>[number];

export function useCompany() {
  const { member } = useSession();
  return useRows<any>('companies', (c) => c.id === member?.company_id, [member?.company_id])[0];
}
export function useTeam() { return useRows<any>('members', (m) => m.active !== false).sort((a, b) => a.name.localeCompare(b.name)); }

// ---- things that live only on the server (texts, team chat, tasks): read when online, refresh live
export function useQuery<T>(load: () => Promise<T>, deps: unknown[], tables: string[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(() => { load().then((d) => { setData(d); setError(null); }).catch((e) => setError(String(e?.message ?? e))); }, deps); // eslint-disable-line
  useEffect(() => {
    run();
    if (!tables.length) return;
    const ch = supabase.channel(`q-${tables.join('-')}-${Math.random().toString(36).slice(2)}`);
    for (const t of tables) ch.on('postgres_changes' as any, { event: '*', schema: 'public', table: t }, () => run());
    ch.subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [run]); // eslint-disable-line
  return { data, error, reload: run };
}
export function check<T>(r: { data: T; error: { message: string } | null }): T {
  if (r.error) throw new Error(/row-level security/.test(r.error.message) ? "You're not allowed to do that." : r.error.message);
  return r.data;
}

// ---- directions in the maps app the person picked
export function openMaps(address: string, app: 'ask' | 'google' | 'apple' | 'waze' = 'ask') {
  const q = encodeURIComponent(address);
  const urls = { google: `https://www.google.com/maps/dir/?api=1&destination=${q}`, apple: `https://maps.apple.com/?daddr=${q}`, waze: `https://waze.com/ul?q=${q}&navigate=yes` };
  if (app !== 'ask') return Linking.openURL(urls[app]);
  if (Platform.OS === 'ios') {
    return ActionSheetIOS.showActionSheetWithOptions({ options: ['Apple Maps', 'Google Maps', 'Waze', 'Cancel'], cancelButtonIndex: 3 }, (i) => { if (i < 3) Linking.openURL([urls.apple, urls.google, urls.waze][i]); });
  }
  if (Platform.OS === 'web') return Linking.openURL(urls.google);
  Alert.alert('Directions', address, [{ text: 'Google Maps', onPress: () => Linking.openURL(urls.google) }, { text: 'Waze', onPress: () => Linking.openURL(urls.waze) }, { text: 'Cancel', style: 'cancel' }]);
}

export const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
export const CATS_DEFAULT = [
  { id: 'nc', n: 'No cooling', c: '#2a7de1' }, { id: 'nh', n: 'No heat', c: '#d9480f' }, { id: 'th', n: 'Thermostat issue', c: '#7b4ccf' },
  { id: 'ins', n: 'Install', c: '#1f8a4c' }, { id: 'pm', n: 'PM / Maintenance', c: '#0b8a8a' }, { id: 'lk', n: 'Leak / water', c: '#1c6fb5' },
  { id: 'est', n: 'Estimate', c: '#a07a00' }, { id: 'rep', n: 'Repair', c: '#c2255c' },
];
export const TYPES_DEFAULT = ['Estimate', 'Install', 'Leak / water', 'No cooling', 'No heat', 'PM visit', 'Thermostat'];
export const catsOf = (co: any) => (co?.settings?.categories?.length ? co.settings.categories : CATS_DEFAULT) as { id: string; n: string; c: string }[];
export const catColor = (co: any, name?: string | null) => catsOf(co).find((x) => x.n === name)?.c ?? '#8a919b';
