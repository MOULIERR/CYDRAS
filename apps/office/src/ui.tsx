// Shared look pieces, same as the mockup: category tags, status pills, avatars, money and time.
import { supabase, check } from './supabase';
import { useLive } from './live';

export type Cat = { id: string; n: string; c: string };
export const DEFAULT_CATS: Cat[] = [
  { id: 'nc', n: 'No cooling', c: '#2a7de1' }, { id: 'nh', n: 'No heat', c: '#d9480f' }, { id: 'th', n: 'Thermostat issue', c: '#7b4ccf' },
  { id: 'ins', n: 'Install', c: '#1f8a4c' }, { id: 'pm', n: 'PM / Maintenance', c: '#0b8a8a' }, { id: 'lk', n: 'Leak / water', c: '#1c6fb5' },
  { id: 'est', n: 'Estimate', c: '#a07a00' }, { id: 'rep', n: 'Repair', c: '#c2255c' },
];
export const catsOf = (company: any): Cat[] => (company?.settings?.categories?.length ? company.settings.categories : DEFAULT_CATS);
export const catOf = (cats: Cat[], name?: string | null): Cat =>
  cats.find((c) => c.n.toLowerCase() === (name ?? '').toLowerCase() || c.id === name) ?? { id: 'other', n: name || 'No category', c: '#6b7280' };
export function CatTag({ cats, name }: { cats: Cat[]; name?: string | null }) {
  const c = catOf(cats, name);
  return <span className="ctag" style={{ ['--cc' as any]: c.c }}>{c.n}</span>;
}

export const STATUS: Record<string, [string, string]> = {
  scheduled: ['Scheduled', 'p-sched'], on_the_way: ['On the way', 'p-route'], on_site: ['On site', 'p-site'],
  done: ['Done', 'p-done'], no_show: ['No-show', 'p-bad'], canceled: ['Canceled', 'p-bad'],
};
export const StatusPill = ({ s }: { s: string }) => { const x = STATUS[s] ?? STATUS.scheduled; return <span className={`pill ${x[1]}`}>{x[0]}</span>; };

const AVC = ['#ffe3d1', '#d9ecff', '#dff5e6', '#efe1ff', '#fff2c7', '#ffe0ea'];
export const initials = (n: string) => n.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
export function Avatar({ name, i = 0 }: { name: string; i?: number }) {
  return <span className="av" title={name} style={{ background: AVC[i % AVC.length], color: '#1f242c' }}>{initials(name)}</span>;
}

export const money = (n: number) => '$' + (Math.round(n * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const money0 = (n: number) => '$' + Math.round(n).toLocaleString('en-US');
export const hm = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
export const dayKey = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
export const dayStart = (key: string) => new Date(key + 'T00:00:00');
export const dayLabel = (key: string, long = false) =>
  dayStart(key).toLocaleDateString('en-US', long ? { weekday: 'long', month: 'long', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric' });
export const addDays = (key: string, n: number) => { const d = dayStart(key); d.setDate(d.getDate() + n); return dayKey(d); };
export const today = () => dayKey(new Date());

export function PageH({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return <div className="pageh"><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div><div className="row wrap">{right}</div></div>;
}

/** The company row (settings like categories), live. */
export function useCompany(companyId: string) {
  return useLive(async () => check(await supabase.from('companies').select('*').eq('id', companyId).single()) as any, ['companies'], companyId, [companyId]).data;
}

/** Amount still owed on an invoice from its payments. */
export function paidOn(pays: any[]) {
  return pays.filter((p) => p.status === 'succeeded' && !p.voided_at).reduce((a, p) => a + Number(p.amount) - Number(p.refunded_amount ?? 0), 0);
}
