// Phone storage for offline work: rows, sync cursors, and the outbox of changes waiting to be sent.
import * as SQLite from 'expo-sqlite';
import type { LocalStore, OutboxItem, Row } from '@cydras/core';

export async function openLocalStore(name = 'cydras.db'): Promise<LocalStore & { clear(): Promise<void> }> {
  const db = await SQLite.openDatabaseAsync(name);
  await db.execAsync(`
    pragma journal_mode = wal;
    create table if not exists rows (tbl text not null, id text not null, data text not null, primary key (tbl, id));
    create table if not exists meta (k text primary key, v text not null);
    create table if not exists outbox (seq integer primary key, op text not null, attempts integer not null default 0, created_at text not null, error text);
  `);
  return {
    async get(tbl, id) { const r = await db.getFirstAsync<{ data: string }>('select data from rows where tbl=? and id=?', tbl, id); return r ? (JSON.parse(r.data) as Row) : undefined; },
    async put(tbl, row) { await db.runAsync('insert or replace into rows(tbl, id, data) values (?,?,?)', tbl, row.id, JSON.stringify(row)); },
    async remove(tbl, id) { await db.runAsync('delete from rows where tbl=? and id=?', tbl, id); },
    async all(tbl) { return (await db.getAllAsync<{ data: string }>('select data from rows where tbl=?', tbl)).map((r) => JSON.parse(r.data) as Row); },
    async getMeta(k) { return (await db.getFirstAsync<{ v: string }>('select v from meta where k=?', k))?.v; },
    async setMeta(k, v) { await db.runAsync('insert or replace into meta(k, v) values (?,?)', k, v); },
    async outbox() {
      return (await db.getAllAsync<any>('select * from outbox order by seq')).map((r) => ({ seq: r.seq, op: JSON.parse(r.op), attempts: r.attempts, created_at: r.created_at, error: r.error ?? undefined } as OutboxItem));
    },
    async pushOutbox(i) { await db.runAsync('insert into outbox(seq, op, attempts, created_at, error) values (?,?,?,?,?)', i.seq, JSON.stringify(i.op), i.attempts, i.created_at, i.error ?? null); },
    async updateOutbox(i) { await db.runAsync('update outbox set attempts=?, error=? where seq=?', i.attempts, i.error ?? null, i.seq); },
    async dropOutbox(seq) { await db.runAsync('delete from outbox where seq=?', seq); },
    async clear() { await db.execAsync('delete from rows; delete from meta; delete from outbox;'); },
  };
}
