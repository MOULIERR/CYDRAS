-- Cydras core schema
-- Every business row belongs to one company. Row-level security makes sure
-- people only ever see their own company's data, and only what their role allows.
-- IDs are UUIDs made on the phone, so rows can be created offline and synced later.

create extension if not exists pgcrypto;
create schema if not exists app;

-- ---------------------------------------------------------------------------
-- Companies, people, roles
-- ---------------------------------------------------------------------------
create type app.role as enum ('owner', 'supervisor', 'tech', 'apprentice');

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  trade text not null default 'hvac',
  phone text,
  email text,
  license text,
  timezone text not null default 'America/New_York',
  invoice_message text default 'Thank you for trusting us with your home or business.',
  tax_rate numeric(6,4) not null default 0.07,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Default permissions for each role. The owner can change single permissions per person.
create or replace function app.default_perms(r app.role) returns jsonb
language sql immutable as $$
  select case r
    when 'owner' then '{"seePrices":true,"schedule":true,"assign":true,"allJobs":true,"customers":true,"estimates":true,"payments":true,"prices":true,"discounts":true,"remove":true,"pricebook":true,"acctnums":true,"inventory":true}'::jsonb
    when 'supervisor' then '{"seePrices":true,"schedule":true,"assign":true,"allJobs":true,"customers":true,"estimates":true,"payments":true,"prices":true,"discounts":true,"remove":true,"pricebook":false,"acctnums":true,"inventory":true}'::jsonb
    when 'tech' then '{"seePrices":true,"schedule":false,"assign":false,"allJobs":false,"customers":true,"estimates":true,"payments":true,"prices":false,"discounts":true,"remove":false,"pricebook":false,"acctnums":false,"inventory":false}'::jsonb
    else '{"seePrices":false,"schedule":false,"assign":false,"allJobs":false,"customers":false,"estimates":false,"payments":false,"prices":false,"discounts":false,"remove":false,"pricebook":false,"acctnums":false,"inventory":false}'::jsonb
  end
$$;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  email text,
  phone text,
  role app.role not null default 'tech',
  perms jsonb not null default '{}'::jsonb,
  photo_path text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, user_id)
);
create index members_user_idx on public.members(user_id) where active;

-- Pay rates are private: only the owner can read or change them.
create table public.member_pay (
  member_id uuid primary key references public.members(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  hourly_rate numeric(8,2) not null default 0,
  commission jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  email text,
  created_by uuid references auth.users(id),
  expires_at timestamptz not null default now() + interval '14 days',
  used_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Cydras billing (the shops that pay Cydras)
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  company_id uuid primary key references public.companies(id) on delete cascade,
  plan text not null default 'team' check (plan in ('solo', 'team', 'pro')),
  status text not null default 'trialing' check (status in ('trialing', 'active', 'past_due', 'canceled', 'paused')),
  trial_ends_at timestamptz not null default now() + interval '14 days',
  current_period_end timestamptz,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  seats int not null default 5,
  updated_at timestamptz not null default now()
);

-- Payment processor account for each shop (Stripe Connect), so card money goes to the shop's bank.
create table public.payment_accounts (
  company_id uuid primary key references public.companies(id) on delete cascade,
  stripe_account_id text unique,
  charges_enabled boolean not null default false,
  payouts_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Helper functions used by the security rules
-- ---------------------------------------------------------------------------
create or replace function app.uid() returns uuid language sql stable as $$ select auth.uid() $$;

create or replace function app.member_row(c uuid) returns public.members
language sql stable security definer set search_path = public, app as $$
  select m.* from public.members m where m.company_id = c and m.user_id = auth.uid() and m.active limit 1
$$;

create or replace function app.is_member(c uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.members m where m.company_id = c and m.user_id = auth.uid() and m.active)
$$;

create or replace function app.my_member_id(c uuid) returns uuid
language sql stable security definer set search_path = public, app as $$
  select m.id from public.members m where m.company_id = c and m.user_id = auth.uid() and m.active limit 1
$$;

create or replace function app.has_role(c uuid, roles app.role[]) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.members m where m.company_id = c and m.user_id = auth.uid() and m.active and m.role = any(roles))
$$;

create or replace function app.is_owner(c uuid) returns boolean language sql stable as $$ select app.has_role(c, array['owner']::app.role[]) $$;
create or replace function app.is_manager(c uuid) returns boolean language sql stable as $$ select app.has_role(c, array['owner','supervisor']::app.role[]) $$;

-- A permission is on if the person's own setting says so, else their role's default.
create or replace function app.can(c uuid, perm text) returns boolean
language sql stable security definer set search_path = public, app as $$
  select coalesce(
    (select case when m.role = 'owner' then true
                 else coalesce((m.perms ->> perm)::boolean, (app.default_perms(m.role) ->> perm)::boolean, false) end
       from public.members m where m.company_id = c and m.user_id = auth.uid() and m.active limit 1),
    false)
$$;

-- Writes are allowed while the shop is on a free trial, paid up, or within 7 days of a failed payment.
create or replace function app.company_writable(c uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.subscriptions s
     where s.company_id = c
       and (s.status = 'active'
            or (s.status = 'trialing' and s.trial_ends_at > now())
            or (s.status = 'past_due' and coalesce(s.current_period_end, now()) > now() - interval '7 days'))
  )
$$;

-- Keeps updated_at fresh. Phones pull "everything changed since my last sync" using it.
create or replace function app.touch() returns trigger language plpgsql as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end $$;

-- ---------------------------------------------------------------------------
-- Business tables. All have: company_id, updated_at (sync cursor), deleted_at (soft delete so
-- deletes sync to phones too).
-- ---------------------------------------------------------------------------
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  kind text not null default 'home' check (kind in ('home', 'business', 'condo')),
  contact text,
  owner_customer_id uuid references public.customers(id),  -- landlord / property manager
  notes text[] not null default '{}',
  credit numeric(10,2) not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Phones and emails, each with a label. sms_consent / opted_out are required for texting (TCPA).
create table public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  kind text not null check (kind in ('phone', 'email')),
  value text not null,
  label text,
  who text,
  is_primary boolean not null default false,
  sms_consent_at timestamptz,
  sms_consent_source text,
  opted_out_at timestamptz,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  label text not null default 'Main',
  address text not null,
  lat double precision,
  lng double precision,
  is_primary boolean not null default false,
  site_notes text[] not null default '{}',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  site_id uuid references public.sites(id),
  type text not null,
  tag text,
  make text,
  model text,
  serial text,
  year int,
  warranty_until date,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.price_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category text not null default 'General',
  name text not null,
  prices jsonb not null default '{}'::jsonb,   -- {"res":99,"resAdd":79,"com":125,"comAdd":99,"after":150}
  unit text,
  active boolean not null default true,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number bigint,
  customer_id uuid not null references public.customers(id),
  site_id uuid references public.sites(id),
  category text,
  type text not null,
  description text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'on_the_way', 'on_site', 'done', 'no_show', 'canceled')),
  status_times jsonb not null default '{}'::jsonb,
  summary text,                      -- customer-facing summary of work
  private_notes jsonb not null default '[]'::jsonb,
  hide_prices boolean not null default false,
  callback boolean not null default false,
  discount jsonb,
  urgent boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (ends_at > starts_at)
);
create index jobs_company_start_idx on public.jobs(company_id, starts_at);

create table public.job_assignments (
  job_id uuid not null references public.jobs(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (job_id, member_id)
);

create table public.job_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  description text not null,
  price numeric(10,2) not null,
  qty numeric(10,2) not null default 1,
  unit text,
  kind text not null default 'service' check (kind in ('service', 'part', 'adjustment')),
  price_item_id uuid references public.price_items(id),
  part_sku text,
  position int not null default 0,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.estimates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number bigint,
  customer_id uuid not null references public.customers(id),
  job_id uuid references public.jobs(id),
  title text,
  status text not null default 'draft' check (status in ('draft', 'sent', 'approved', 'declined')),
  options jsonb not null default '[]'::jsonb,  -- [{name, lines:[{d,p,q}]}]
  picked int,
  declined_reason text,
  sent_at timestamptz,
  answered_at timestamptz,
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  number bigint,
  customer_id uuid not null references public.customers(id),
  job_id uuid references public.jobs(id),
  bill_to_customer_id uuid references public.customers(id),
  subtotal numeric(10,2) not null default 0,
  tax numeric(10,2) not null default 0,
  total numeric(10,2) not null default 0,
  status text not null default 'open' check (status in ('open', 'paid', 'void')),
  revisions jsonb not null default '[]'::jsonb,
  issued_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- Payments are never deleted. Mistakes are voided; refunds are recorded on the row.
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  invoice_id uuid references public.invoices(id),
  job_id uuid references public.jobs(id),
  customer_id uuid not null references public.customers(id),
  method text not null check (method in ('tap_to_pay', 'card_on_file', 'card_link', 'cash', 'check', 'zelle', 'ach', 'financing', 'credit')),
  amount numeric(10,2) not null check (amount > 0),
  reference text,
  status text not null default 'succeeded' check (status in ('pending', 'succeeded', 'failed')),
  stripe_payment_intent_id text unique,
  refunded_amount numeric(10,2) not null default 0 check (refunded_amount >= 0),
  refund_reason text,
  voided_at timestamptz,
  void_reason text,
  moved_to_payment_id uuid references public.payments(id),
  taken_by uuid default auth.uid(),
  taken_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (refunded_amount <= amount)
);

create table public.checklists (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  match text,
  items jsonb not null default '[]'::jsonb,    -- [{t, k: ck|yn|tx|ct}]
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.job_checklists (
  job_id uuid not null references public.jobs(id) on delete cascade,
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  answers jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (job_id, checklist_id)
);

create table public.job_media (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null references public.jobs(id) on delete cascade,
  storage_path text not null,
  kind text not null default 'photo' check (kind in ('photo', 'video', 'voice', 'signature', 'document')),
  caption text,
  taken_by uuid default auth.uid(),
  taken_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- ---------------------------------------------------------------------------
-- Time clock + GPS
-- ---------------------------------------------------------------------------
create table public.time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  break_minutes int not null default 0 check (break_minutes >= 0),
  on_break_since timestamptz,
  drive_minutes int not null default 0,
  miles numeric(8,1) not null default 0,
  approved_at timestamptz,
  approved_by uuid,
  edits jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (clock_out is null or clock_out > clock_in)
);
create unique index time_entries_one_open on public.time_entries(member_id) where clock_out is null and deleted_at is null;

-- Location is only accepted while that person is clocked in (enforced by a trigger below).
create table public.location_pings (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  accuracy_m real,
  speed_mps real
);
create index location_pings_member_at on public.location_pings(member_id, at desc);

create or replace function app.check_ping_clocked_in() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  -- The ping's time must fall inside a shift. (Pings saved offline are uploaded later, so we check
  -- the time of the ping, not "right now".)
  if new.at > now() + interval '5 minutes' or not exists (select 1 from public.time_entries t
                  where t.member_id = new.member_id and t.deleted_at is null
                    and t.clock_in <= new.at + interval '1 minute' and (t.clock_out is null or t.clock_out >= new.at - interval '1 minute')) then
    raise exception 'Location is only shared while clocked in' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger location_pings_clocked_in before insert on public.location_pings
  for each row execute function app.check_ping_clocked_in();

-- ---------------------------------------------------------------------------
-- Messages, push tokens, inventory
-- ---------------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid references public.customers(id),
  direction text not null check (direction in ('out', 'in')),
  to_number text,
  from_number text,
  body text not null,
  kind text not null default 'manual' check (kind in ('manual', 'on_my_way', 'reminder', 'receipt', 'estimate', 'review', 'marketing', 'booking', 'system')),
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'blocked', 'received')),
  provider_id text,
  error text,
  sent_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.team_messages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  thread text not null,            -- 'all' or 'memberA|memberB'
  from_member uuid not null references public.members(id),
  body text,
  media_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.push_tokens (
  token text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text,
  updated_at timestamptz not null default now()
);

create table public.stock_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('shop', 'truck')),
  member_id uuid references public.members(id),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.parts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  part_number text,
  cost numeric(10,2) not null default 0,
  supplier text,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.stock (
  location_id uuid not null references public.stock_locations(id) on delete cascade,
  part_id uuid not null references public.parts(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  qty int not null default 0 check (qty >= 0),
  min_qty int not null default 0 check (min_qty >= 0),
  updated_at timestamptz not null default now(),
  primary key (location_id, part_id)
);

-- ---------------------------------------------------------------------------
-- Audit log: every change to money and people is recorded (who, when, what).
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  company_id uuid,
  table_name text not null,
  row_id text,
  action text not null,
  actor uuid,
  at timestamptz not null default now(),
  old_row jsonb,
  new_row jsonb
);

create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public, app as $$
declare r jsonb; o jsonb;
begin
  r := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  o := case when tg_op = 'INSERT' then null else to_jsonb(old) end;
  insert into public.audit_log(company_id, table_name, row_id, action, actor, old_row, new_row)
  values (coalesce((r->>'company_id')::uuid, (o->>'company_id')::uuid), tg_table_name,
          coalesce(r->>'id', o->>'id', r->>'member_id', o->>'member_id'), lower(tg_op), auth.uid(), o, r);
  return coalesce(new, old);
end $$;

-- Running numbers per company (job #, invoice #, estimate #).
create table public.counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  value bigint not null default 10000,
  primary key (company_id, name)
);

create or replace function app.next_number(c uuid, counter text) returns bigint
language plpgsql security definer set search_path = public, app as $$
declare v bigint;
begin
  insert into public.counters(company_id, name, value) values (c, counter, 10001)
  on conflict (company_id, name) do update set value = public.counters.value + 1
  returning value into v;
  return v;
end $$;

create or replace function app.assign_number() returns trigger
language plpgsql security definer set search_path = public, app as $$
begin
  if new.number is null then new.number := app.next_number(new.company_id, tg_table_name); end if;
  return new;
end $$;
create trigger jobs_number before insert on public.jobs for each row execute function app.assign_number();
create trigger invoices_number before insert on public.invoices for each row execute function app.assign_number();
create trigger estimates_number before insert on public.estimates for each row execute function app.assign_number();

-- updated_at triggers on every synced table
do $$
declare t text;
begin
  foreach t in array array['companies','members','member_pay','subscriptions','payment_accounts','customers','customer_contacts','sites','units',
    'price_items','jobs','job_assignments','job_lines','estimates','invoices','payments','checklists','job_checklists','job_media',
    'time_entries','messages','team_messages','push_tokens','stock_locations','parts','stock']
  loop
    execute format('create trigger %I_touch before insert or update on public.%I for each row execute function app.touch()', t, t);
  end loop;
  foreach t in array array['members','member_pay','payments','invoices','time_entries','subscriptions','job_lines','stock']
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function app.audit()', t, t);
  end loop;
end $$;
