/**
 * Offline-first sync.
 *
 * Every change is saved on the phone first (so it works in an attic with no signal) and put in an
 * "outbox". When there's signal, the outbox is sent to the server in order, and anything that changed
 * on the server since last time is pulled down.
 *
 * Conflicts: if you changed something on the phone that hasn't been sent yet, your version wins on the
 * phone until it's sent. Otherwise the server's newest version wins.
 */

export type Row = { id: string; updated_at?: string; deleted_at?: string | null; [k: string]: unknown };

export type Op =
  | { kind: 'upsert'; table: string; row: Row; key?: string[]; patch?: boolean }
  | { kind: 'rpc'; fn: string; args: Record<string, unknown> };

export type OutboxItem = { seq: number; op: Op; attempts: number; created_at: string; error?: string };

/** Where the phone keeps data. The app uses SQLite; tests use memory. */
export interface LocalStore {
  get(table: string, id: string): Promise<Row | undefined>;
  put(table: string, row: Row): Promise<void>;
  remove(table: string, id: string): Promise<void>;
  all(table: string): Promise<Row[]>;
  getMeta(key: string): Promise<string | undefined>;
  setMeta(key: string, value: string): Promise<void>;
  outbox(): Promise<OutboxItem[]>;
  pushOutbox(item: OutboxItem): Promise<void>;
  updateOutbox(item: OutboxItem): Promise<void>;
  dropOutbox(seq: number): Promise<void>;
}

/** The server (Supabase in the app; a fake in tests). */
export interface Remote {
  /** patch = the row already exists on the server; only send the changed fields. */
  upsert(table: string, row: Row, onConflict?: string[], patch?: boolean): Promise<void>;
  rpc(fn: string, args: Record<string, unknown>): Promise<unknown>;
  /** Rows with updated_at >= since (inclusive), oldest first. */
  changes(table: string, since: string, limit: number): Promise<Row[]>;
}

/** An error that will never succeed by retrying (not allowed, bad data). */
export class PermanentError extends Error {}

export type TableSpec = string | { name: string; key: string[] };
const specName = (t: TableSpec) => (typeof t === 'string' ? t : t.name);
const specKey = (t: TableSpec) => (typeof t === 'string' ? undefined : t.key);

export type SyncResult = { pushed: number; pulled: number; failed: OutboxItem[]; offline: boolean };

const EPOCH = '1970-01-01T00:00:00.000Z';
/** Re-check the last minute each time, so a save that finished a moment late on the server isn't missed. */
const OVERLAP_MS = 60_000;
export const rowKey = (row: Row, key?: string[]) => (key && key.length ? key.map((k) => String(row[k])).join('|') : row.id);

export class Sync {
  private running: Promise<SyncResult> | null = null;
  constructor(private local: LocalStore, private remote: Remote, private tables: TableSpec[], private now: () => Date = () => new Date()) {}

  /** Save a change on the phone right away and queue it for the server. */
  async save(table: string, row: Row, key?: string[]): Promise<Row> {
    const id = rowKey(row, key);
    const prev = await this.local.get(table, id);
    const merged: Row = { ...(prev ?? {}), ...row, id, updated_at: this.now().toISOString() };
    await this.local.put(table, merged);
    await this.enqueue({ kind: 'upsert', table, row: stripLocal(row), key, patch: !!prev });
    return merged;
  }

  /** Soft delete, so the delete also reaches other phones. */
  async remove(table: string, id: string, keyRow?: Row, key?: string[]): Promise<void> {
    await this.local.remove(table, id);
    const row: Row = key?.length && keyRow ? { ...Object.fromEntries(key.map((k) => [k, keyRow[k]])), id, deleted_at: this.now().toISOString() } : { id, deleted_at: this.now().toISOString() };
    await this.enqueue({ kind: 'upsert', table, row, key, patch: true });
  }

  /** Server actions like "clock in" or "use a part": queued the same way. */
  async call(fn: string, args: Record<string, unknown>): Promise<void> {
    await this.enqueue({ kind: 'rpc', fn, args });
  }

  async pending(): Promise<number> {
    return (await this.local.outbox()).filter((i) => !i.error).length;
  }

  private async enqueue(op: Op) {
    const items = await this.local.outbox();
    const seq = (items.reduce((m, i) => Math.max(m, i.seq), 0) || 0) + 1;
    await this.local.pushOutbox({ seq, op, attempts: 0, created_at: this.now().toISOString() });
  }

  /** Send the outbox, then pull changes. Safe to call often; only one runs at a time. */
  run(): Promise<SyncResult> {
    if (!this.running) this.running = this.doRun().finally(() => { this.running = null; });
    return this.running;
  }

  private async doRun(): Promise<SyncResult> {
    const res: SyncResult = { pushed: 0, pulled: 0, failed: [], offline: false };
    // 1. Push, in order. Stop at the first network problem so nothing goes out of order.
    for (const item of (await this.local.outbox()).sort((a, b) => a.seq - b.seq)) {
      if (item.error) { res.failed.push(item); continue; }
      try {
        if (item.op.kind === 'upsert') await this.remote.upsert(item.op.table, item.op.row, item.op.key, item.op.patch);
        else await this.remote.rpc(item.op.fn, item.op.args);
        await this.local.dropOutbox(item.seq);
        res.pushed++;
      } catch (e) {
        if (e instanceof PermanentError) {
          const failed = { ...item, attempts: item.attempts + 1, error: e.message };
          await this.local.updateOutbox(failed);
          res.failed.push(failed);
          continue;
        }
        await this.local.updateOutbox({ ...item, attempts: item.attempts + 1 });
        res.offline = true;
        return res;
      }
    }
    // 2. Pull what changed on the server.
    const waiting = new Set((await this.local.outbox()).filter((i) => !i.error && i.op.kind === 'upsert')
      .map((i) => (i.op as Extract<Op, { kind: 'upsert' }>).table + ':' + rowKey((i.op as any).row, (i.op as any).key)));
    for (const spec of this.tables) {
      const table = specName(spec), key = specKey(spec);
      const saved = (await this.local.getMeta('cursor:' + table)) ?? EPOCH;
      let since = saved === EPOCH ? EPOCH : new Date(Math.max(0, Date.parse(saved) - OVERLAP_MS)).toISOString();
      const seen = new Set<string>();
      let limit = 500;
      for (;;) {
        let rows: Row[];
        try { rows = await this.remote.changes(table, since, limit); } catch { res.offline = true; return res; }
        const fresh = rows.filter((r) => !seen.has(rowKey(r, key) + '@' + r.updated_at));
        for (const r of fresh) {
          const id = rowKey(r, key);
          seen.add(id + '@' + r.updated_at);
          if (waiting.has(table + ':' + id)) continue; // our unsent change wins for now
          const have = await this.local.get(table, id);
          if (have && have.updated_at === r.updated_at && !r.deleted_at) continue; // already have this version
          if (r.deleted_at) await this.local.remove(table, id);
          else await this.local.put(table, { ...r, id });
          res.pulled++;
        }
        const last = rows[rows.length - 1]?.updated_at;
        if (last && last > saved) await this.local.setMeta('cursor:' + table, last);
        if (rows.length < limit || !last) break;
        if (!fresh.length) { limit *= 2; continue; } // a whole page saved at the exact same moment: ask for a bigger page
        limit = 500;
        since = last; // inclusive, so rows sharing this exact time on the next page aren't skipped
      }
    }
    return res;
  }

  /** Throw away a change the server refused (after showing the person why). */
  async dismissFailed(seq: number) { await this.local.dropOutbox(seq); }
}

function stripLocal(row: Row): Row {
  const { updated_at: _u, ...rest } = row;
  return rest as Row;
}

/** In-memory store, used in tests and as a fallback. */
export class MemoryStore implements LocalStore {
  t = new Map<string, Map<string, Row>>();
  meta = new Map<string, string>();
  box: OutboxItem[] = [];
  private tab(n: string) { if (!this.t.has(n)) this.t.set(n, new Map()); return this.t.get(n)!; }
  async get(table: string, id: string) { return this.tab(table).get(id); }
  async put(table: string, row: Row) { this.tab(table).set(row.id, row); }
  async remove(table: string, id: string) { this.tab(table).delete(id); }
  async all(table: string) { return [...this.tab(table).values()]; }
  async getMeta(k: string) { return this.meta.get(k); }
  async setMeta(k: string, v: string) { this.meta.set(k, v); }
  async outbox() { return this.box.map((x) => ({ ...x })); }
  async pushOutbox(i: OutboxItem) { this.box.push(i); }
  async updateOutbox(i: OutboxItem) { this.box = this.box.map((x) => (x.seq === i.seq ? i : x)); }
  async dropOutbox(seq: number) { this.box = this.box.filter((x) => x.seq !== seq); }
}

/** UUIDs made on the phone, so new rows work offline. */
export function newId(): string {
  const c = (globalThis as any).crypto;
  if (c?.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
