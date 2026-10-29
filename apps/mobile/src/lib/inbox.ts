// Customer texts and team chat. These live on the server (they need signal).
// "Unread" is kept on this phone: a thread is unread if the customer wrote after you last opened it.
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { useSession } from './session';
import { useQuery, check } from './data';

const KEY = 'cydras.seen';
const store = () => (globalThis as any).localStorage as Storage | undefined;
let seen: Record<string, string> = (() => { try { return JSON.parse(store()?.getItem(KEY) ?? '{}'); } catch { return {}; } })();
const subs = new Set<() => void>();
export function markSeen(id: string) { seen = { ...seen, [id]: new Date().toISOString() }; try { store()?.setItem(KEY, JSON.stringify(seen)); } catch { /* ignore */ } subs.forEach((f) => f()); }
const useSeen = () => useSyncExternalStore((f) => { subs.add(f); return () => subs.delete(f); }, () => seen);

export type Msg = { id: string; customer_id: string; direction: 'in' | 'out'; body: string; status: string; error: string | null; created_at: string; kind: string; customers?: { name: string } };

export function useThreads() {
  const { member } = useSession();
  const c = member?.company_id;
  const seenNow = useSeen();
  const q = useQuery(async () => (c ? check(await supabase.from('messages').select('id, customer_id, direction, body, status, error, created_at, kind, customers(name)').eq('company_id', c).order('created_at', { ascending: false }).limit(600)) as unknown as Msg[] : []), [c], ['messages']);
  const by = new Map<string, Msg[]>();
  for (const m of q.data ?? []) if (m.customer_id) by.set(m.customer_id, [...(by.get(m.customer_id) ?? []), m]);
  const threads = [...by.entries()].map(([id, ms]) => {
    const last = ms[0];
    const lastIn = ms.find((m) => m.direction === 'in');
    return { id, name: last.customers?.name ?? 'Customer', last, msgs: [...ms].reverse(), unread: !!lastIn && (!seenNow[id] || lastIn.created_at > seenNow[id]) };
  }).sort((a, b) => b.last.created_at.localeCompare(a.last.created_at));
  return { threads, error: q.error, reload: q.reload, loading: q.data === null && !q.error };
}
export function useUnread() { return useThreads().threads.filter((t) => t.unread).length; }
