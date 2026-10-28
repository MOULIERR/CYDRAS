-- Maintenance plans, online booking, customer portal links and marketing campaigns.

-- Maintenance plans (memberships): a customer pays monthly or yearly and gets tune-up visits.
create table public.service_plans (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  name text not null check (length(trim(name)) > 0 and length(name) <= 120),
  price numeric(10,2) not null default 0 check (price >= 0),
  bill_every text not null default 'year' check (bill_every in ('month', 'year')),
  visits_per_year int not null default 2 check (visits_per_year between 0 and 12),
  starts_on date not null default current_date,
  next_visit_on date,
  next_bill_on date,
  discount_pct numeric(5,2) not null default 0 check (discount_pct between 0 and 100),
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index service_plans_company on public.service_plans(company_id) where deleted_at is null;
create trigger service_plans_touch before insert or update on public.service_plans for each row execute function app.touch();
alter table public.service_plans enable row level security;
create policy plans_read on public.service_plans for select to authenticated using (app.is_member(company_id));
create policy plans_write on public.service_plans for all to authenticated
  using (app.is_manager(company_id)) with check (app.is_manager(company_id) and app.company_writable(company_id));
grant select, insert, update on public.service_plans to authenticated;

-- Online booking: each shop gets a public link cydras.vercel.app/book/<slug>.
alter table public.companies add column if not exists booking_slug text unique
  check (booking_slug is null or booking_slug ~ '^[a-z0-9][a-z0-9-]{2,40}$');

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 120),
  phone text not null check (length(phone) between 7 and 30),
  email text check (email is null or length(email) <= 200),
  address text check (address is null or length(address) <= 300),
  job_type text check (job_type is null or length(job_type) <= 120),
  preferred_day date,
  preferred_time text check (preferred_time is null or preferred_time in ('morning', 'afternoon', 'any')),
  note text check (note is null or length(note) <= 1000),
  sms_ok boolean not null default false,
  status text not null default 'new' check (status in ('new', 'booked', 'declined')),
  job_id uuid references public.jobs(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index booking_requests_company on public.booking_requests(company_id, created_at desc);
create trigger booking_requests_touch before insert or update on public.booking_requests for each row execute function app.touch();
alter table public.booking_requests enable row level security;
create policy booking_read on public.booking_requests for select to authenticated using (app.is_manager(company_id));
create policy booking_update on public.booking_requests for update to authenticated
  using (app.is_manager(company_id)) with check (app.is_manager(company_id) and app.company_writable(company_id));
grant select, update on public.booking_requests to authenticated;

-- What the public booking page shows. Only works when the owner turned booking on.
create or replace function public.booking_info(p_slug text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('name', c.name, 'phone', c.phone,
    'job_types', coalesce(c.settings->'booking'->'types', '[]'::jsonb),
    'message', c.settings->'booking'->>'message')
  from public.companies c
  where c.booking_slug = lower(p_slug) and coalesce((c.settings->'booking'->>'on')::boolean, false)
$$;

create or replace function public.booking_submit(p_slug text, p_name text, p_phone text, p_email text, p_address text,
  p_type text, p_day date, p_time text, p_note text, p_sms_ok boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare c uuid;
begin
  select id into c from public.companies
   where booking_slug = lower(p_slug) and coalesce((settings->'booking'->>'on')::boolean, false);
  if c is null then raise exception 'This booking page is not open.'; end if;
  if (select count(*) from public.booking_requests where company_id = c and created_at > now() - interval '1 hour') >= 30 then
    raise exception 'Too many requests right now. Please call us instead.';
  end if;
  if p_day is not null and (p_day < current_date or p_day > current_date + 120) then raise exception 'Pick a day in the next few months.'; end if;
  insert into public.booking_requests(company_id, name, phone, email, address, job_type, preferred_day, preferred_time, note, sms_ok)
  values (c, trim(p_name), trim(p_phone), nullif(trim(p_email), ''), nullif(trim(p_address), ''), nullif(trim(p_type), ''),
    p_day, coalesce(nullif(p_time, ''), 'any'), nullif(trim(p_note), ''), coalesce(p_sms_ok, false));
end $$;
revoke all on function public.booking_info(text) from public;
revoke all on function public.booking_submit(text, text, text, text, text, text, date, text, text, boolean) from public;
grant execute on function public.booking_info(text) to anon, authenticated;
grant execute on function public.booking_submit(text, text, text, text, text, text, date, text, text, boolean) to anon, authenticated;

-- Customer portal: a private link per customer. Anyone with the link sees that customer's invoices,
-- estimates and upcoming visits (like a tracking link). The office can turn a link off any time.
create table public.portal_links (
  token text primary key default encode(gen_random_bytes(18), 'hex'),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.customers(id) on delete cascade,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
create index portal_links_customer on public.portal_links(customer_id);
alter table public.portal_links enable row level security;
create policy portal_links_read on public.portal_links for select to authenticated using (app.is_member(company_id));
create policy portal_links_insert on public.portal_links for insert to authenticated
  with check (app.is_member(company_id) and app.company_writable(company_id));
create policy portal_links_update on public.portal_links for update to authenticated
  using (app.is_manager(company_id)) with check (app.is_manager(company_id));
grant select, insert, update on public.portal_links to authenticated;

create or replace function public.portal_view(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l public.portal_links; s jsonb; r jsonb;
begin
  select * into l from public.portal_links where token = p_token and revoked_at is null;
  if l.token is null then return null; end if;
  update public.portal_links set last_seen_at = now() where token = p_token;
  select coalesce(settings->'portal', '{}'::jsonb) into s from public.companies where id = l.company_id;
  select jsonb_build_object(
    'company', (select jsonb_build_object('name', name, 'phone', phone, 'email', email, 'license', license,
       'financing', settings->'financing') from public.companies where id = l.company_id),
    'settings', s,
    'customer', (select jsonb_build_object('name', name) from public.customers where id = l.customer_id),
    'invoices', case when coalesce((s->>'invoices')::boolean, true) then coalesce((select jsonb_agg(jsonb_build_object(
        'number', i.number, 'issued_at', i.issued_at, 'total', i.total, 'status', i.status,
        'paid', coalesce((select sum(p.amount - p.refunded_amount) from public.payments p
                          where p.invoice_id = i.id and p.status = 'succeeded' and p.voided_at is null), 0)) order by i.issued_at desc)
      from public.invoices i where i.customer_id = l.customer_id and i.deleted_at is null and i.status <> 'void'), '[]'::jsonb) else '[]'::jsonb end,
    'estimates', case when coalesce((s->>'estimates')::boolean, true) then coalesce((select jsonb_agg(jsonb_build_object(
        'id', e.id, 'number', e.number, 'title', e.title, 'status', e.status, 'options', e.options, 'picked', e.picked, 'sent_at', e.sent_at) order by e.sent_at desc nulls last)
      from public.estimates e where e.customer_id = l.customer_id and e.deleted_at is null and e.status in ('sent', 'approved', 'declined')), '[]'::jsonb) else '[]'::jsonb end,
    'visits', case when coalesce((s->>'visits')::boolean, true) then coalesce((select jsonb_agg(jsonb_build_object(
        'starts_at', j.starts_at, 'type', j.type, 'status', j.status) order by j.starts_at)
      from public.jobs j where j.customer_id = l.customer_id and j.deleted_at is null and j.starts_at > now() - interval '1 day'
        and j.status not in ('done', 'canceled', 'no_show')), '[]'::jsonb) else '[]'::jsonb end,
    'plans', coalesce((select jsonb_agg(jsonb_build_object('name', p.name, 'price', p.price, 'bill_every', p.bill_every,
        'next_visit_on', p.next_visit_on, 'visits_per_year', p.visits_per_year))
      from public.service_plans p where p.customer_id = l.customer_id and p.active and p.deleted_at is null), '[]'::jsonb)
  ) into r;
  return r;
end $$;

create or replace function public.portal_answer(p_token text, p_estimate uuid, p_option int, p_approve boolean, p_reason text default null) returns void
language plpgsql security definer set search_path = public as $$
declare l public.portal_links; e public.estimates;
begin
  select * into l from public.portal_links where token = p_token and revoked_at is null;
  if l.token is null then raise exception 'This link is turned off.'; end if;
  select * into e from public.estimates where id = p_estimate and customer_id = l.customer_id and deleted_at is null;
  if e.id is null then raise exception 'Estimate not found.'; end if;
  if e.status <> 'sent' then raise exception 'This estimate was already answered.'; end if;
  if p_approve and (p_option is null or p_option < 0 or p_option >= jsonb_array_length(e.options)) then raise exception 'Pick an option.'; end if;
  update public.estimates set status = case when p_approve then 'approved' else 'declined' end,
    picked = case when p_approve then p_option end, declined_reason = case when p_approve then null else left(p_reason, 500) end,
    answered_at = now() where id = e.id;
end $$;
revoke all on function public.portal_view(text) from public;
revoke all on function public.portal_answer(text, uuid, int, boolean, text) from public;
grant execute on function public.portal_view(text) to anon, authenticated;
grant execute on function public.portal_answer(text, uuid, int, boolean, text) to anon, authenticated;

-- Marketing campaigns: a record of each mass text (the texts themselves are in messages, kind 'marketing').
create table public.campaigns (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 120),
  body text not null check (length(body) between 1 and 600),
  audience text not null,
  sent_count int not null default 0,
  blocked_count int not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger campaigns_touch before insert or update on public.campaigns for each row execute function app.touch();
alter table public.campaigns enable row level security;
create policy campaigns_all on public.campaigns for all to authenticated
  using (app.is_manager(company_id)) with check (app.is_manager(company_id) and app.company_writable(company_id));
grant select, insert, update on public.campaigns to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.service_plans, public.booking_requests, public.campaigns;
  end if;
end $$;
