import { describe, it, expect, beforeAll } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { freshDb, as, server, ids, expectDenied } from './helpers';

let db: PGlite;
let company: string;
let other: string;
let mikeMember: string;
let carlosMember: string;
let cust: string;
let jobMine: string;
let jobNotMine: string;

beforeAll(async () => {
  db = await freshDb();
  await server(db, `insert into auth.users(id, email) values ($1,'angel@coastal.test'),($2,'mike@coastal.test'),($3,'carlos@coastal.test'),($4,'boss@other.test')`,
    [ids.angel, ids.mike, ids.carlos, ids.other]);
});

describe('sign-up and invites', () => {
  it('signing up makes a company, an owner, and a 14-day free trial', async () => {
    [{ create_company: company }] = await as(db, ids.angel, `select public.create_company('Coastal Air & Heat', 'Angel', 'team')`);
    const m = await as(db, ids.angel, `select role from public.members where company_id = $1`, [company]);
    expect(m).toEqual([{ role: 'owner' }]);
    const s = await as(db, ids.angel, `select status, plan, seats, trial_ends_at > now() + interval '13 days' as ok from public.subscriptions where company_id = $1`, [company]);
    expect(s[0]).toMatchObject({ status: 'trialing', plan: 'team', seats: 5, ok: true });
  });

  it('the owner invites a supervisor and a tech, and they join with the code', async () => {
    const [{ create_invite: c1 }] = await as(db, ids.angel, `select public.create_invite($1,'Mike R.','supervisor','mike@coastal.test')`, [company]);
    const [{ create_invite: c2 }] = await as(db, ids.angel, `select public.create_invite($1,'Carlos D.','tech')`, [company]);
    await as(db, ids.mike, `select public.accept_invite($1)`, [c1]);
    await as(db, ids.carlos, `select public.accept_invite($1)`, [c2.toLowerCase()]);
    const rows = await as(db, ids.angel, `select name, role, user_id is not null as joined from public.members where company_id=$1 order by name`, [company]);
    expect(rows.map((r) => `${r.name}:${r.role}:${r.joined}`)).toEqual(['Angel:owner:true', 'Carlos D.:tech:true', 'Mike R.:supervisor:true']);
    [{ id: mikeMember }] = await as(db, ids.angel, `select id from public.members where user_id=$1`, [ids.mike]);
    [{ id: carlosMember }] = await as(db, ids.angel, `select id from public.members where user_id=$1`, [ids.carlos]);
  });

  it('an invite code works only once', async () => {
    const [{ code }] = await server(db, `select code from public.invites where used_at is not null limit 1`);
    await expectDenied(as(db, ids.other, `select public.accept_invite($1)`, [code]), /not valid/);
  });

  it('a supervisor cannot add another supervisor', async () => {
    await expectDenied(as(db, ids.mike, `select public.create_invite($1,'Someone','supervisor')`, [company]), /owner/);
  });

  it('a tech cannot give themselves more permissions', async () => {
    await expectDenied(as(db, ids.carlos, `update public.members set role='supervisor' where user_id=$1`, [ids.carlos]), /owner or a supervisor/);
    await expectDenied(as(db, ids.mike, `update public.members set perms = perms || '{"seePrices":false}' where id=$1`, [carlosMember]), /Only the owner/);
  });
});

describe('every company is walled off', () => {
  it('another company cannot see Coastal customers', async () => {
    [{ create_company: other }] = await as(db, ids.other, `select public.create_company('Other HVAC', 'Boss')`);
    [{ id: cust }] = await as(db, ids.angel, `insert into public.customers(company_id, name, kind) values ($1,'Sunrise Plaza','business') returning id`, [company]);
    expect(await as(db, ids.other, `select * from public.customers`)).toEqual([]);
    await expectDenied(as(db, ids.other, `insert into public.customers(company_id, name) values ($1,'Sneaky')`, [company]));
  });
});

describe('jobs', () => {
  it('a tech only sees the jobs they are on', async () => {
    [{ id: jobMine }] = await as(db, ids.mike, `insert into public.jobs(company_id, customer_id, type, starts_at, ends_at) values ($1,$2,'No cooling', now(), now()+interval '2 hours') returning id`, [company, cust]);
    [{ id: jobNotMine }] = await as(db, ids.mike, `insert into public.jobs(company_id, customer_id, type, starts_at, ends_at) values ($1,$2,'PM visit', now(), now()+interval '1 hour') returning id`, [company, cust]);
    await as(db, ids.mike, `insert into public.job_assignments(job_id, member_id, company_id) values ($1,$2,$3)`, [jobMine, carlosMember, company]);
    const seen = await as(db, ids.carlos, `select type from public.jobs`);
    expect(seen).toEqual([{ type: 'No cooling' }]);
    const nums = await as(db, ids.angel, `select number from public.jobs order by number`);
    expect(nums.map((n) => Number(n.number))).toEqual([10001, 10002]);
  });

  it('a tech can update the status but cannot reschedule or book jobs', async () => {
    await as(db, ids.carlos, `update public.jobs set status='on_the_way' where id=$1`, [jobMine]);
    await expectDenied(as(db, ids.carlos, `update public.jobs set starts_at = starts_at + interval '1 day' where id=$1`, [jobMine]), /reschedule/);
    await expectDenied(as(db, ids.carlos, `insert into public.jobs(company_id, customer_id, type, starts_at, ends_at) values ($1,$2,'x', now(), now()+interval '1 hour')`, [company, cust]));
  });

  it('a tech cannot change prices on the invoice', async () => {
    const [{ id: line }] = await as(db, ids.carlos, `insert into public.job_lines(company_id, job_id, description, price) values ($1,$2,'Diagnostic',125) returning id`, [company, jobMine]);
    await expectDenied(as(db, ids.carlos, `update public.job_lines set price = 1 where id=$1`, [line]), /prices/);
    await expectDenied(as(db, ids.carlos, `insert into public.job_lines(company_id, job_id, description, price, kind) values ($1,$2,'Discount',-50,'adjustment')`, [company, jobMine]), /adjustments/);
    await as(db, ids.mike, `update public.job_lines set price = 110 where id=$1`, [line]);
  });
});

describe('payments', () => {
  let inv: string;
  let pay: string;
  it('a tech records a cash payment and the invoice shows paid', async () => {
    [{ id: inv }] = await as(db, ids.carlos, `insert into public.invoices(company_id, customer_id, job_id, subtotal, tax, total) values ($1,$2,$3,110,7.70,117.70) returning id`, [company, cust, jobMine]);
    [{ id: pay }] = await as(db, ids.carlos, `insert into public.payments(company_id, invoice_id, job_id, customer_id, method, amount) values ($1,$2,$3,$4,'cash',117.70) returning id`, [company, inv, jobMine, cust]);
    expect((await server(db, `select status from public.invoices where id=$1`, [inv]))[0].status).toBe('paid');
  });

  it('nobody can fake a card payment from the app', async () => {
    await expectDenied(as(db, ids.angel, `insert into public.payments(company_id, customer_id, method, amount) values ($1,$2,'tap_to_pay',500)`, [company, cust]));
  });

  it('a tech cannot remove or refund payments; the owner can, with a reason', async () => {
    await expectDenied(as(db, ids.carlos, `select public.void_payment($1,'oops')`, [pay]), /Not allowed/);
    await expectDenied(as(db, ids.carlos, `update public.payments set amount = 1 where id=$1`, [pay]));
    await expectDenied(as(db, ids.angel, `select public.record_refund($1, 500, 'too much')`, [pay]), /more than/);
    await expectDenied(as(db, ids.angel, `select public.record_refund($1, 10, '')`, [pay]), /reason/);
    await as(db, ids.angel, `select public.record_refund($1, 17.70, 'Agreed to $100')`, [pay]);
    expect((await server(db, `select status from public.invoices where id=$1`, [inv]))[0].status).toBe('open');
  });

  it('moving a payment to the wrong customer fixes both sides', async () => {
    const [{ id: cust2 }] = await as(db, ids.angel, `insert into public.customers(company_id, name) values ($1,'Lakeview Dental') returning id`, [company]);
    const [{ id: p2 }] = await as(db, ids.angel, `insert into public.payments(company_id, customer_id, method, amount) values ($1,$2,'check',200) returning id`, [company, cust]);
    await as(db, ids.mike, `select public.move_payment($1,$2,null,'Put on the wrong customer')`, [p2, cust2]);
    const [old] = await server(db, `select voided_at is not null as voided, moved_to_payment_id is not null as moved from public.payments where id=$1`, [p2]);
    expect(old).toEqual({ voided: true, moved: true });
    expect(Number((await server(db, `select credit from public.customers where id=$1`, [cust2]))[0].credit)).toBe(200);
  });

  it('every money change is in the audit log, and only the owner can read it', async () => {
    const owner = await as(db, ids.angel, `select count(*)::int n from public.audit_log where table_name='payments'`);
    expect(owner[0].n).toBeGreaterThan(3);
    expect(await as(db, ids.mike, `select * from public.audit_log`)).toEqual([]);
  });
});

describe('team tasks', () => {
  it('a supervisor gives a tech a task; the tech sees it and checks it off; another tech cannot see it', async () => {
    const [{ id: t }] = await as(db, ids.mike, `insert into public.tasks(company_id, assigned_to, created_by, title, due_on) values ($1,$2,$3,'Return core to Tropic Supply', current_date) returning id`, [company, carlosMember, mikeMember]);
    await as(db, ids.carlos, `update public.tasks set done_at = now() where id = $1`, [t]);
    const [r] = await as(db, ids.angel, `select done_at is not null as done from public.tasks where id = $1`, [t]);
    expect(r.done).toBe(true);
    expect(await as(db, ids.other, `select * from public.tasks`)).toEqual([]);
  });
  it('a tech cannot give tasks to someone else', async () => {
    await expectDenied(as(db, ids.carlos, `insert into public.tasks(company_id, assigned_to, created_by, title) values ($1,$2,$3,'Do my paperwork')`, [company, mikeMember, carlosMember]));
  });
});

describe('more visits on one job', () => {
  let visit2: string;
  it('a supervisor adds visit 2 to the same job for a later day', async () => {
    [{ id: visit2 }] = await as(db, ids.mike, `insert into public.jobs(company_id, customer_id, type, starts_at, ends_at, parent_job_id, visit_number, visit_note)
      values ($1,$2,'No cooling', now()+interval '2 days', now()+interval '2 days 2 hours', $3, 2, 'Install the new motor') returning id`, [company, cust, jobMine]);
    await as(db, ids.mike, `insert into public.job_assignments(job_id, member_id, company_id) values ($1,$2,$3)`, [visit2, carlosMember, company]);
    const rows = await as(db, ids.carlos, `select visit_number, visit_note from public.jobs where parent_job_id = $1`, [jobMine]);
    expect(rows).toEqual([{ visit_number: 2, visit_note: 'Install the new motor' }]);
  });
  it('a tech cannot add a visit', async () => {
    await expectDenied(as(db, ids.carlos, `insert into public.jobs(company_id, customer_id, type, starts_at, ends_at, parent_job_id, visit_number) values ($1,$2,'x', now(), now()+interval '1 hour', $3, 3)`, [company, cust, jobMine]));
  });
  it('a visit cannot be for a different customer, and the invoice stays on visit 1', async () => {
    const [{ id: other_c }] = await as(db, ids.angel, `insert into public.customers(company_id, name) values ($1,'Someone Else') returning id`, [company]);
    await expectDenied(as(db, ids.mike, `insert into public.jobs(company_id, customer_id, type, starts_at, ends_at, parent_job_id, visit_number) values ($1,$2,'x', now(), now()+interval '1 hour', $3, 3)`, [company, other_c, jobMine]), /same customer/);
    await expectDenied(as(db, ids.mike, `insert into public.invoices(company_id, customer_id, job_id, subtotal, tax, total) values ($1,$2,$3,0,0,0)`, [company, cust, visit2]), /first visit/);
  });
});

describe('private notes', () => {
  it('a tech can add private notes on their job, the other company cannot see them', async () => {
    await as(db, ids.carlos, `update public.jobs set private_notes = '["Gate code 4471","Maria approved up to $500"]' where id = $1`, [jobMine]);
    const [r] = await as(db, ids.mike, `select jsonb_array_length(private_notes) n from public.jobs where id = $1`, [jobMine]);
    expect(r.n).toBe(2);
    expect(await as(db, ids.other, `select private_notes from public.jobs where id = $1`, [jobMine])).toEqual([]);
  });
  it('a tech cannot write notes on a job they are not on', async () => {
    const rows = await as(db, ids.carlos, `update public.jobs set private_notes = '["sneaky"]' where id = $1 returning id`, [jobNotMine]);
    expect(rows).toEqual([]);
  });
  it('notes must be a list', async () => {
    await expectDenied(as(db, ids.mike, `update public.jobs set private_notes = '"just text"' where id = $1`, [jobMine]), /private_notes_list/);
  });
});

describe('time clock and GPS', () => {
  let entry: string;
  it('location is only accepted while clocked in', async () => {
    await expectDenied(as(db, ids.carlos, `insert into public.location_pings(company_id, member_id, lat, lng) values ($1,$2,26.2,-80.2)`, [company, carlosMember]), /clocked in/);
    [{ id: entry }] = await as(db, ids.carlos, `insert into public.time_entries(company_id, member_id, clock_in) values ($1,$2, now() - interval '8 hours') returning id`, [company, carlosMember]);
    await as(db, ids.carlos, `insert into public.location_pings(company_id, member_id, lat, lng) values ($1,$2,26.2,-80.2)`, [company, carlosMember]);
    await as(db, ids.carlos, `update public.time_entries set clock_out = now() - interval '10 minutes' where id=$1`, [entry]);
    await expectDenied(as(db, ids.carlos, `insert into public.location_pings(company_id, member_id, lat, lng) values ($1,$2,26.2,-80.2)`, [company, carlosMember]), /clocked in/);
    // a ping saved offline during the shift can still be sent after clocking out
    await as(db, ids.carlos, `select public.record_ping($1, 26.21, -80.21, 5, 12, now() - interval '3 hours')`, [company]);
    await expectDenied(as(db, ids.carlos, `select public.record_ping($1, 26.21, -80.21, 5, 12, now() - interval '10 hours')`, [company]), /clocked in/);
    await expectDenied(as(db, ids.other, `select public.record_ping($1, 26.21, -80.21)`, [company]), /Not allowed/);
  });

  it('a tech cannot change their own hours after clocking out', async () => {
    await expectDenied(as(db, ids.carlos, `update public.time_entries set clock_in = clock_in - interval '2 hours' where id=$1`, [entry]), /supervisor/);
  });

  it('a supervisor fixing a time must give a reason', async () => {
    await expectDenied(as(db, ids.mike, `update public.time_entries set clock_out = clock_out + interval '1 hour' where id=$1`, [entry]), /reason/);
    await as(db, ids.mike, `update public.time_entries set clock_out = clock_out + interval '1 hour', edits = edits || '[{"why":"Forgot to clock out"}]' where id=$1`, [entry]);
  });

  it('only the owner sees pay rates', async () => {
    await as(db, ids.angel, `insert into public.member_pay(member_id, company_id, hourly_rate) values ($1,$2,26)`, [carlosMember, company]);
    expect(await as(db, ids.mike, `select * from public.member_pay`)).toEqual([]);
    expect(await as(db, ids.carlos, `select * from public.member_pay`)).toEqual([]);
  });

  it('other people only see their own location; managers see everyone', async () => {
    expect((await as(db, ids.mike, `select count(*)::int n from public.location_pings`))[0].n).toBe(2);
    expect((await as(db, ids.other, `select count(*)::int n from public.location_pings`))[0].n).toBe(0);
  });
});

describe('inventory', () => {
  it('techs use parts from their own truck only; supervisors fill trucks from the shop', async () => {
    const [{ id: shop }] = await as(db, ids.angel, `select id from public.stock_locations where kind='shop'`);
    const [{ id: van }] = await as(db, ids.angel, `insert into public.stock_locations(company_id, name, kind, member_id) values ($1,'Van 3','truck',$2) returning id`, [company, carlosMember]);
    const [{ id: van2 }] = await as(db, ids.angel, `insert into public.stock_locations(company_id, name, kind, member_id) values ($1,'Van 2','truck',$2) returning id`, [company, mikeMember]);
    const [{ id: part }] = await as(db, ids.mike, `insert into public.parts(company_id, name, cost) values ($1,'Capacitor 45/5',14.5) returning id`, [company]);
    await as(db, ids.mike, `insert into public.stock(location_id, part_id, company_id, qty, min_qty) values ($1,$2,$3,10,4)`, [shop, part, company]);
    await expectDenied(as(db, ids.carlos, `select public.move_stock($1,$2,$3,2)`, [shop, van, part]), /owner and supervisors/);
    await as(db, ids.mike, `select public.move_stock($1,$2,$3,3)`, [shop, van, part]);
    await expectDenied(as(db, ids.mike, `select public.move_stock($1,$2,$3,30)`, [shop, van, part]), /Only 7 left/);
    expect((await as(db, ids.carlos, `select public.use_part($1,$2,1) as left`, [van, part]))[0].left).toBe(2);
    await expectDenied(as(db, ids.carlos, `select public.use_part($1,$2,1)`, [van2, part]), /own truck/);
    await expectDenied(as(db, ids.carlos, `insert into public.parts(company_id, name) values ($1,'x')`, [company]));
  });
});

describe('Cydras billing', () => {
  it('when the free trial ends without paying, the shop can still read but not add new work', async () => {
    await server(db, `update public.subscriptions set trial_ends_at = now() - interval '1 day' where company_id=$1`, [company]);
    expect((await as(db, ids.angel, `select count(*)::int n from public.customers`))[0].n).toBeGreaterThan(0);
    await expectDenied(as(db, ids.angel, `insert into public.customers(company_id, name) values ($1,'New one')`, [company]));
    await server(db, `update public.subscriptions set status='active', current_period_end = now() + interval '30 days' where company_id=$1`, [company]);
    await as(db, ids.angel, `insert into public.customers(company_id, name) values ($1,'New one')`, [company]);
  });

  it('only the owner sees the subscription', async () => {
    expect(await as(db, ids.mike, `select * from public.subscriptions`)).toEqual([]);
    expect((await as(db, ids.angel, `select status from public.subscriptions`))[0].status).toBe('active');
  });
});
