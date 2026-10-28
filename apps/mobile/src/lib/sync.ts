// Runs sync in the background: when signal comes back, when the app opens, and every 20 seconds.
import NetInfo from '@react-native-community/netinfo';
import { AppState } from 'react-native';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { Sync, type LocalStore, type Row, type TableSpec } from '@cydras/core';
import { openLocalStore } from './localStore';
import { supabaseRemote } from './remote';

export const TABLES: TableSpec[] = [
  'companies', 'members', 'customers', 'customer_contacts', 'sites', 'units', 'price_items', 'jobs',
  { name: 'job_assignments', key: ['job_id', 'member_id'] }, 'job_lines', 'estimates', 'invoices', 'payments', 'checklists',
  { name: 'job_checklists', key: ['job_id', 'checklist_id'] }, 'time_entries', 'stock_locations', 'parts', { name: 'stock', key: ['location_id', 'part_id'] },
];

type State = { ready: boolean; online: boolean; syncing: boolean; pending: number; failed: number; lastSync: Date | null; version: number };
let state: State = { ready: false, online: true, syncing: false, pending: 0, failed: 0, lastSync: null, version: 0 };
const listeners = new Set<() => void>();
const set = (p: Partial<State>) => { state = { ...state, ...p }; listeners.forEach((l) => l()); };

let local: (LocalStore & { clear(): Promise<void> }) | null = null;
let engine: Sync | null = null;
let timer: ReturnType<typeof setInterval> | null = null;

export async function startSync() {
  if (engine) return engine;
  local = await openLocalStore();
  engine = new Sync(local, supabaseRemote, TABLES);
  set({ ready: true, pending: await engine.pending() });
  NetInfo.addEventListener((n) => { const online = !!n.isConnected && n.isInternetReachable !== false; set({ online }); if (online) void syncNow(); });
  AppState.addEventListener('change', (s) => { if (s === 'active') void syncNow(); });
  timer = setInterval(() => void syncNow(), 20000);
  void syncNow();
  return engine;
}

export async function stopSync(clearData = true) {
  if (timer) clearInterval(timer);
  timer = null;
  if (clearData && local) await local.clear();
  engine = null; local = null;
  set({ ready: false, pending: 0, failed: 0, version: state.version + 1 });
}

export async function syncNow() {
  if (!engine || state.syncing) return;
  set({ syncing: true });
  try {
    const r = await engine.run();
    set({ online: !r.offline, lastSync: r.offline ? state.lastSync : new Date(), failed: r.failed.length, version: state.version + (r.pulled || r.pushed ? 1 : 0) });
  } finally {
    set({ syncing: false, pending: engine ? await engine.pending() : 0 });
  }
}

/** Save a change: shows right away on this phone, goes to the server when there's signal. */
export async function save(table: string, row: Row, key?: string[]) {
  const e = engine ?? (await startSync());
  const out = await e.save(table, row, key);
  set({ pending: await e.pending(), version: state.version + 1 });
  void syncNow();
  return out;
}

export async function call(fn: string, args: Record<string, unknown>) {
  const e = engine ?? (await startSync());
  await e.call(fn, args);
  set({ pending: await e.pending() });
  void syncNow();
}

export async function failedChanges() { return (await local?.outbox())?.filter((i) => i.error) ?? []; }
export async function dismiss(seq: number) { await engine?.dismissFailed(seq); set({ failed: Math.max(0, state.failed - 1) }); }

export function useSyncState(): State {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => state);
}

/** Read a table from the phone. Re-reads whenever sync brings in changes. */
export function useRows<T extends Row = Row>(table: string, filter?: (r: T) => boolean, deps: unknown[] = []): T[] {
  const { version, ready } = useSyncState();
  const [rows, setRows] = useState<T[]>([]);
  useEffect(() => {
    let live = true;
    if (local) local.all(table).then((all) => { if (live) setRows((all as T[]).filter((r) => !r.deleted_at && (!filter || filter(r)))); });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, version, ready, ...deps]);
  return rows;
}
