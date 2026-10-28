import { describe, it, expect } from 'vitest';
import { Sync, MemoryStore, PermanentError, type Remote, type Row, newId } from '../src/sync';
import { totals } from '../src/money';
import { workedMinutes, weekPay, driveMinutes } from '../src/time';

/** A pretend server: keeps rows, stamps updated_at, can go "offline". */
class FakeServer implements Remote {
  rows = new Map<string, Map<string, Row>>();
  offline = false;
  deny = new Set<string>();
  clock = Date.parse('2026-10-23T12:00:00Z');
  calls: string[] = [];
  private stamp() { this.clock += 1000; return new Date(this.clock).toISOString(); }
  private tab(t: string) { if (!this.rows.has(t)) this.rows.set(t, new Map()); return this.rows.get(t)!; }
  async upsert(table: string, row: Row, key?: string[]) {
    if (this.offline) throw new Error('network');
    if (this.deny.has(table)) throw new PermanentError('You are not allowed to change prices');
    const id = key ? key.map((k) => row[k]).join('|') : row.id;
    this.tab(table).set(id, { ...(this.tab(table).get(id) ?? {}), ...row, updated_at: this.stamp() });
    this.calls.push('upsert ' + table);
  }
  async rpc(fn: string) { if (this.offline) throw new Error('network'); this.calls.push('rpc ' + fn); return null; }
  async changes(table: string, since: string, limit: number) {
    if (this.offline) throw new Error('network');
    return [...this.tab(table).values()].filter((r) => r.updated_at! >= since).sort((a, b) => a.updated_at!.localeCompare(b.updated_at!)).slice(0, limit);
  }
  serverEdit(table: string, row: Row) { this.tab(table).set(row.id, { ...(this.tab(table).get(row.id) ?? {}), ...row, updated_at: this.stamp() }); }
}

describe('offline sync', () => {
  it('pulls every row even when many share the same time, and catches a save that finished late', async () => {
    const server = new FakeServer(), phone = new MemoryStore();
    const sync = new Sync(phone, server, ['customers']);
    const same = '2026-10-24T12:00:00.000Z';
    for (let i = 0; i < 1203; i++) (server as any).tab('customers').set('c' + i, { id: 'c' + i, name: 'C' + i, updated_at: i < 600 ? same : new Date(Date.parse(same) + i).toISOString() });
    await sync.run();
    expect((await phone.all('customers')).length).toBe(1203);
    // a save stamped 10 seconds earlier that only became visible now
    (server as any).tab('customers').set('late', { id: 'late', name: 'Late', updated_at: new Date(Date.parse(same) + 1202 - 10_000).toISOString() });
    await sync.run();
    expect((await phone.get('customers', 'late'))?.name).toBe('Late');
  });

  it('a tech finishes a job with no signal and it all goes up when signal comes back', async () => {
    const server = new FakeServer(), phone = new MemoryStore();
    const sync = new Sync(phone, server, ['jobs', 'job_lines']);
    server.offline = true;
    const job = newId();
    await sync.save('jobs', { id: job, status: 'on_site' });
    await sync.save('job_lines', { id: newId(), job_id: job, description: 'Capacitor 45/5', price: 185, qty: 1 });
    await sync.call('use_part', { p_part: 'cap', p_qty: 1 });
    await sync.save('jobs', { id: job, status: 'done', summary: 'Replaced capacitor' });
    expect((await phone.get('jobs', job))?.status).toBe('done'); // shows right away on the phone
    let r = await sync.run();
    expect(r.offline).toBe(true);
    expect(await sync.pending()).toBe(4);
    server.offline = false;
    r = await sync.run();
    expect(r.pushed).toBe(4);
    expect(server.calls).toEqual(['upsert jobs', 'upsert job_lines', 'rpc use_part', 'upsert jobs']); // in order
    expect(server.rows.get('jobs')!.get(job)).toMatchObject({ status: 'done', summary: 'Replaced capacitor' });
    expect(await sync.pending()).toBe(0);
  });

  it('pulls what the office changed, and the phone keeps its own unsent change', async () => {
    const server = new FakeServer(), phone = new MemoryStore();
    const sync = new Sync(phone, server, ['jobs']);
    server.serverEdit('jobs', { id: 'a', status: 'scheduled', type: 'PM' });
    server.serverEdit('jobs', { id: 'b', status: 'scheduled', type: 'No cooling' });
    await sync.run();
    expect((await phone.all('jobs')).length).toBe(2);
    server.offline = true;
    await sync.save('jobs', { id: 'a', status: 'on_the_way' });
    server.offline = false;
    server.serverEdit('jobs', { id: 'b', type: 'No cooling, RTU-2' });
    // office deletes nothing, edits b; phone's unsent change to a must not be overwritten by the pull
    const r = await sync.run();
    expect(r.pushed).toBe(1);
    expect((await phone.get('jobs', 'b'))?.type).toBe('No cooling, RTU-2');
    expect(server.rows.get('jobs')!.get('a')?.status).toBe('on_the_way');
  });

  it('deletes reach the phone, and composite keys work', async () => {
    const server = new FakeServer(), phone = new MemoryStore();
    const sync = new Sync(phone, server, ['jobs', { name: 'job_assignments', key: ['job_id', 'member_id'] }]);
    await sync.save('job_assignments', { job_id: 'a', member_id: 'carlos' } as any, ['job_id', 'member_id']);
    await sync.run();
    expect(await phone.get('job_assignments', 'a|carlos')).toBeTruthy();
    server.serverEdit('jobs', { id: 'x', type: 'PM' });
    await sync.run();
    server.serverEdit('jobs', { id: 'x', deleted_at: '2026-10-23T13:00:00Z' });
    await sync.run();
    expect(await phone.get('jobs', 'x')).toBeUndefined();
  });

  it('a change the server refuses is set aside with the reason, and the rest still goes', async () => {
    const server = new FakeServer(), phone = new MemoryStore();
    const sync = new Sync(phone, server, ['jobs']);
    server.deny.add('job_lines');
    await sync.save('job_lines', { id: 'l1', price: 1 });
    await sync.save('jobs', { id: 'j1', status: 'done' });
    const r = await sync.run();
    expect(r.failed[0].error).toMatch(/prices/);
    expect(server.rows.get('jobs')!.get('j1')).toBeTruthy();
    await sync.dismissFailed(r.failed[0].seq);
    expect((await phone.outbox()).length).toBe(0);
  });

  it('only one sync runs at a time', async () => {
    const server = new FakeServer(), phone = new MemoryStore();
    const sync = new Sync(phone, server, ['jobs']);
    await sync.save('jobs', { id: 'j', status: 'done' });
    const [a, b] = await Promise.all([sync.run(), sync.run()]);
    expect(a).toBe(b);
    expect(server.calls).toEqual(['upsert jobs']);
  });
});

describe('money and time', () => {
  it('adds up invoices the same way everywhere', () => {
    const t = totals([{ price: 125, qty: 1 }, { price: 185, qty: 1 }, { price: 38, qty: 8 }], 0.07, { type: 'amt', value: 20 },
      [{ amount: 300, refunded_amount: 0, voided_at: null, status: 'succeeded' }, { amount: 50, refunded_amount: 0, voided_at: 'x', status: 'succeeded' }]);
    expect(t).toEqual({ sub: 614, off: 20, tax: 41.58, total: 635.58, paid: 300, due: 335.58, over: 0 });
  });
  it('counts hours, breaks, overtime and drive time', () => {
    expect(workedMinutes({ clock_in: '2026-10-23T11:00:00Z', clock_out: '2026-10-23T20:30:00Z', break_minutes: 30 })).toBe(540);
    expect(weekPay(42 * 60, 26)).toEqual({ regMinutes: 2400, otMinutes: 120, pay: 1118 });
    const pings = [
      { at: '2026-10-23T12:00:00Z', lat: 26.2, lng: -80.25, speed_mps: 0 },
      { at: '2026-10-23T12:10:00Z', lat: 26.25, lng: -80.25, speed_mps: 15 },
      { at: '2026-10-23T12:20:00Z', lat: 26.25, lng: -80.25, speed_mps: 0 },
    ];
    expect(driveMinutes(pings)).toBe(10);
  });
});
