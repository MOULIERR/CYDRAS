-- Cydras security rules (row-level security) and the server-side actions people are allowed to take.
-- Rule of thumb: everyone only sees their own company. Techs only see jobs they're on
-- (unless the owner allows all jobs). Money changes are done through checked functions,
-- never by editing rows directly.

-- Turn security on for every table.
do $$
declare t text;
begin
  foreach t in array array['companies','members','member_pay','invites','subscriptions','payment_accounts','customers','customer_contacts',
    'sites','units','price_items','jobs','job_assignments','job_lines','estimates','invoices','payments','checklists','job_checklists',
    'job_media','time_entries','location_pings','messages','team_messages','push_tokens','stock_locations','parts','stock','audit_log','counters']
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Can the signed-in person see this job?
create or replace function app.can_see_job(j uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (
    select 1 from public.jobs jb
     where jb.id = j
       and app.is_member(jb.company_id)
       and (app.can(jb.company_id, 'allJobs')
            or exists (select 1 from public.job_assignments a
                        where a.job_id = jb.id and a.deleted_at is null and a.member_id = app.my_member_id(jb.company_id)))
  )
$$;

-- ---------------------------------------------------------------------------
-- Companies and people
-- ---------------------------------------------------------------------------
create policy companies_read on public.companies for select to authenticated using (app.is_member(id));
create policy companies_owner_update on public.companies for update to authenticated using (app.is_owner(id)) with check (app.is_owner(id));

create policy members_read on public.members for select to authenticated using (app.is_member(company_id));
-- Owner manages everyone. Supervisors can only add or change techs and apprentices.
create policy members_insert on public.members for insert to authenticated
  with check (app.is_owner(company_id) or (app.is_manager(company_id) and role in ('tech', 'apprentice')));
create policy members_update on public.members for update to authenticated
  using (app.is_owner(company_id) or (app.is_manager(company_id) and role in ('tech', 'apprentice')) or user_id = auth.uid())
  with check (app.is_owner(company_id) or (app.is_manager(company_id) and role in ('tech', 'apprentice')) or user_id = auth.uid());

-- People can update their own name, phone and photo, but not their own role or permissions.
create or replace function app.guard_member_update() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if auth.uid() is null or current_setting('app.trusted', true) = 'on' then return new; end if; -- server or a checked function
  if not app.is_owner(new.company_id) and not (app.is_manager(new.company_id) and old.role in ('tech','apprentice')) then
    if new.role is distinct from old.role or new.perms is distinct from old.perms or new.active is distinct from old.active
       or new.user_id is distinct from old.user_id or new.company_id is distinct from old.company_id then
      raise exception 'Only the owner or a supervisor can change roles and permissions' using errcode = '42501';
    end if;
  end if;
  if not app.is_owner(new.company_id) and (new.perms ? 'seePrices') and (new.perms->>'seePrices') is distinct from (old.perms->>'seePrices') then
    raise exception 'Only the owner can change who sees prices' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger members_guard before update on public.members for each row execute function app.guard_member_update();

create policy member_pay_owner on public.member_pay for all to authenticated using (app.is_owner(company_id)) with check (app.is_owner(company_id));
create policy invites_manager_read on public.invites for select to authenticated using (app.is_manager(company_id));
create policy subscriptions_owner_read on public.subscriptions for select to authenticated using (app.is_owner(company_id));
create policy payment_accounts_owner_read on public.payment_accounts for select to authenticated using (app.is_owner(company_id));
create policy audit_owner_read on public.audit_log for select to authenticated using (app.is_owner(company_id));

-- ---------------------------------------------------------------------------
-- Customers, sites, equipment, price book
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['customers','customer_contacts','sites','units']
  loop
    execute format('create policy %I_read on public.%I for select to authenticated using (app.is_member(company_id))', t, t);
    execute format('create policy %I_insert on public.%I for insert to authenticated with check (app.can(company_id, ''customers'') and app.company_writable(company_id))', t, t);
    execute format('create policy %I_update on public.%I for update to authenticated using (app.is_member(company_id)) with check (app.is_member(company_id) and app.company_writable(company_id))', t, t);
    execute format('create policy %I_delete on public.%I for delete to authenticated using (app.can(company_id, ''remove''))', t, t);
  end loop;
end $$;

create policy price_items_read on public.price_items for select to authenticated using (app.is_member(company_id));
create policy price_items_write on public.price_items for all to authenticated
  using (app.can(company_id, 'pricebook')) with check (app.can(company_id, 'pricebook') and app.company_writable(company_id));

-- ---------------------------------------------------------------------------
-- Jobs
-- ---------------------------------------------------------------------------
create or replace function app.assigned_to_me(j uuid, c uuid) returns boolean
language sql stable security definer set search_path = public, app as $$
  select exists (select 1 from public.job_assignments a where a.job_id = j and a.deleted_at is null and a.member_id = app.my_member_id(c))
$$;
-- Checked on the row itself (not by looking the job up), so a job is readable the moment it's created.
create policy jobs_read on public.jobs for select to authenticated
  using (app.is_member(company_id) and (app.can(company_id, 'allJobs') or app.assigned_to_me(id, company_id)));
create policy jobs_insert on public.jobs for insert to authenticated
  with check (app.can(company_id, 'schedule') and app.company_writable(company_id));
create policy jobs_update on public.jobs for update to authenticated
  using (app.is_member(company_id) and (app.can(company_id, 'schedule') or app.can(company_id, 'allJobs') or app.assigned_to_me(id, company_id)))
  with check (app.is_member(company_id) and (app.can(company_id, 'schedule') or app.can(company_id, 'allJobs') or app.assigned_to_me(id, company_id)) and app.company_writable(company_id));
create policy jobs_delete on public.jobs for delete to authenticated using (app.can(company_id, 'remove'));

-- Techs can update status, notes and the summary on their jobs, but not move them or hide prices.
create or replace function app.guard_job_update() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if auth.uid() is null then return new; end if;
  if not app.can(new.company_id, 'schedule') then
    if new.starts_at is distinct from old.starts_at or new.ends_at is distinct from old.ends_at
       or new.customer_id is distinct from old.customer_id or new.site_id is distinct from old.site_id
       or new.hide_prices is distinct from old.hide_prices or new.deleted_at is distinct from old.deleted_at
       or new.company_id is distinct from old.company_id then
      raise exception 'You are not allowed to reschedule or move this job' using errcode = '42501';
    end if;
  end if;
  if new.discount is distinct from old.discount and not app.can(new.company_id, 'discounts') then
    raise exception 'You are not allowed to give discounts' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger jobs_guard before update on public.jobs for each row execute function app.guard_job_update();

create policy job_assignments_read on public.job_assignments for select to authenticated
  using (app.is_member(company_id) and (app.can(company_id, 'allJobs') or member_id = app.my_member_id(company_id)));
create policy job_assignments_write on public.job_assignments for all to authenticated
  using (app.can(company_id, 'assign')) with check (app.can(company_id, 'assign') and app.company_writable(company_id));

create policy job_lines_read on public.job_lines for select to authenticated using (app.can_see_job(job_id));
create policy job_lines_insert on public.job_lines for insert to authenticated with check (app.can_see_job(job_id) and app.company_writable(company_id));
create policy job_lines_update on public.job_lines for update to authenticated using (app.can_see_job(job_id)) with check (app.can_see_job(job_id) and app.company_writable(company_id));
create policy job_lines_delete on public.job_lines for delete to authenticated using (app.can_see_job(job_id) and app.can(company_id, 'remove'));

-- Without the "change prices" permission, a line's price must come from the price book and can't be edited.
create or replace function app.guard_line_price() returns trigger language plpgsql security definer set search_path = public, app as $$
declare book numeric;
begin
  if auth.uid() is null or app.can(new.company_id, 'prices') then return new; end if;
  if tg_op = 'UPDATE' and new.price is distinct from old.price then
    raise exception 'You are not allowed to change prices' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.kind = 'adjustment' then
    raise exception 'You are not allowed to add price adjustments' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' and new.kind = 'service' and new.price_item_id is not null then
    select max(v::numeric) into book from public.price_items p, jsonb_each_text(p.prices) as e(k, v) where p.id = new.price_item_id;
    if book is not null and new.price > book then
      raise exception 'Price is higher than the price book' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
create trigger job_lines_price_guard before insert or update on public.job_lines for each row execute function app.guard_line_price();

create policy estimates_read on public.estimates for select to authenticated using (app.is_member(company_id));
create policy estimates_write on public.estimates for all to authenticated
  using (app.can(company_id, 'estimates')) with check (app.can(company_id, 'estimates') and app.company_writable(company_id));

create policy invoices_read on public.invoices for select to authenticated using (app.can(company_id, 'seePrices') and (job_id is null and app.is_manager(company_id) or job_id is not null and app.can_see_job(job_id)));
create policy invoices_insert on public.invoices for insert to authenticated with check ((app.is_manager(company_id) or (job_id is not null and app.can_see_job(job_id))) and app.company_writable(company_id));
create policy invoices_update on public.invoices for update to authenticated using (app.can(company_id, 'prices')) with check (app.can(company_id, 'prices'));

create policy checklists_read on public.checklists for select to authenticated using (app.is_member(company_id));
create policy checklists_write on public.checklists for all to authenticated using (app.is_manager(company_id)) with check (app.is_manager(company_id));
create policy job_checklists_rw on public.job_checklists for all to authenticated using (app.can_see_job(job_id)) with check (app.can_see_job(job_id) and app.company_writable(company_id));
create policy job_media_read on public.job_media for select to authenticated using (app.can_see_job(job_id));
create policy job_media_insert on public.job_media for insert to authenticated with check (app.can_see_job(job_id));
create policy job_media_update on public.job_media for update to authenticated using (app.can_see_job(job_id)) with check (app.can_see_job(job_id));

-- ---------------------------------------------------------------------------
-- Payments: people with the "take payments" permission can record cash, check and Zelle.
-- Card payments are created by the server after Stripe confirms them.
-- Fixing a payment (void, refund, move) goes through the functions further down.
-- ---------------------------------------------------------------------------
create policy payments_read on public.payments for select to authenticated using (app.can(company_id, 'seePrices') and app.is_member(company_id));
create policy payments_insert on public.payments for insert to authenticated
  with check (app.can(company_id, 'payments') and app.company_writable(company_id)
              and method in ('cash', 'check', 'zelle') and status = 'succeeded'
              and voided_at is null and refunded_amount = 0 and stripe_payment_intent_id is null
              and (job_id is null or app.can_see_job(job_id)));

-- Keep invoice paid/open in step with its payments.
create or replace function app.sync_invoice_status() returns trigger language plpgsql security definer set search_path = public, app as $$
declare inv uuid; paid numeric; tot numeric;
begin
  inv := coalesce(new.invoice_id, old.invoice_id);
  if inv is null then return null; end if;
  select coalesce(sum(p.amount - p.refunded_amount), 0) into paid from public.payments p
   where p.invoice_id = inv and p.voided_at is null and p.status = 'succeeded';
  select total into tot from public.invoices where id = inv;
  update public.invoices set status = case when status = 'void' then 'void' when paid >= tot - 0.005 and tot > 0 then 'paid' else 'open' end
   where id = inv;
  return null;
end $$;
create trigger payments_invoice_status after insert or update on public.payments for each row execute function app.sync_invoice_status();

-- Who may fix payments: the owner, or a supervisor with the payments permission.
create or replace function app.can_fix_payments(c uuid) returns boolean language sql stable as $$
  select app.is_owner(c) or (app.has_role(c, array['supervisor']::app.role[]) and app.can(c, 'payments'))
$$;

create or replace function public.void_payment(p_payment uuid, p_reason text) returns public.payments
language plpgsql security definer set search_path = public, app as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment for update;
  if p.id is null or not app.can_fix_payments(p.company_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  if p.voided_at is not null then raise exception 'Already removed'; end if;
  if p.method in ('tap_to_pay', 'card_on_file', 'card_link') and p.refunded_amount < p.amount then
    raise exception 'Card payments are refunded, not removed. Use refund.';
  end if;
  update public.payments set voided_at = now(), void_reason = p_reason where id = p.id returning * into p;
  return p;
end $$;

-- Cash, check and Zelle refunds are recorded here (the shop pays the customer back).
-- Card refunds go through the refund-payment server function, which calls Stripe first.
create or replace function public.record_refund(p_payment uuid, p_amount numeric, p_reason text) returns public.payments
language plpgsql security definer set search_path = public, app as $$
declare p public.payments;
begin
  select * into p from public.payments where id = p_payment for update;
  if p.id is null or not app.can_fix_payments(p.company_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  if p.method in ('tap_to_pay', 'card_on_file', 'card_link') then raise exception 'Card refunds must go through the card processor'; end if;
  if p_amount <= 0 or p.refunded_amount + p_amount > p.amount + 0.001 then raise exception 'Refund is more than what is left on this payment'; end if;
  update public.payments set refunded_amount = refunded_amount + p_amount, refund_reason = p_reason where id = p.id returning * into p;
  return p;
end $$;

-- Wrong customer: take the payment off one customer and put it on another invoice (or as credit).
create or replace function public.move_payment(p_payment uuid, p_to_customer uuid, p_to_invoice uuid, p_reason text) returns public.payments
language plpgsql security definer set search_path = public, app as $$
declare p public.payments; n public.payments; c_ok boolean;
begin
  select * into p from public.payments where id = p_payment for update;
  if p.id is null or not app.can_fix_payments(p.company_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception 'A reason is required'; end if;
  if p.voided_at is not null or p.refunded_amount > 0 then raise exception 'This payment was already changed'; end if;
  select exists(select 1 from public.customers where id = p_to_customer and company_id = p.company_id) into c_ok;
  if not c_ok or p_to_customer = p.customer_id then raise exception 'Pick a different customer from your company'; end if;
  if p_to_invoice is not null and not exists (select 1 from public.invoices where id = p_to_invoice and customer_id = p_to_customer) then
    raise exception 'That invoice belongs to someone else';
  end if;
  insert into public.payments(company_id, invoice_id, customer_id, method, amount, reference, status, stripe_payment_intent_id, taken_by, taken_at)
  values (p.company_id, p_to_invoice, p_to_customer, case when p_to_invoice is null then 'credit' else p.method end, p.amount,
          coalesce(p.reference, '') || ' (moved)', 'succeeded', null, auth.uid(), now())
  returning * into n;
  if p_to_invoice is null then update public.customers set credit = credit + p.amount where id = p_to_customer; end if;
  update public.payments set voided_at = now(), void_reason = 'Moved: ' || p_reason, moved_to_payment_id = n.id where id = p.id returning * into p;
  return p;
end $$;

-- ---------------------------------------------------------------------------
-- Time clock and GPS
-- ---------------------------------------------------------------------------
create policy time_read on public.time_entries for select to authenticated
  using (app.is_manager(company_id) or member_id = app.my_member_id(company_id));
create policy time_insert on public.time_entries for insert to authenticated
  with check (member_id = app.my_member_id(company_id) or app.is_manager(company_id));
create policy time_update on public.time_entries for update to authenticated
  using (app.is_manager(company_id) or (member_id = app.my_member_id(company_id) and approved_at is null))
  with check (app.is_manager(company_id) or (member_id = app.my_member_id(company_id) and approved_at is null));

-- A tech can clock out and take breaks, but can't change their clock-in time or approve themselves.
create or replace function app.guard_time_update() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if auth.uid() is null or app.is_manager(new.company_id) then
    if auth.uid() is not null and (new.clock_in is distinct from old.clock_in or new.clock_out is distinct from old.clock_out)
       and old.clock_out is not null and coalesce(jsonb_array_length(new.edits), 0) <= coalesce(jsonb_array_length(old.edits), 0) then
      raise exception 'Fixing a time needs a reason' using errcode = '22023';
    end if;
    return new;
  end if;
  if new.clock_in is distinct from old.clock_in or new.approved_at is distinct from old.approved_at
     or new.approved_by is distinct from old.approved_by or new.member_id is distinct from old.member_id
     or (old.clock_out is not null and new.clock_out is distinct from old.clock_out) then
    raise exception 'Ask your supervisor to fix this time' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger time_entries_guard before update on public.time_entries for each row execute function app.guard_time_update();

create policy pings_insert_own on public.location_pings for insert to authenticated with check (member_id = app.my_member_id(company_id));
create policy pings_read on public.location_pings for select to authenticated using (app.is_manager(company_id) or member_id = app.my_member_id(company_id));

-- ---------------------------------------------------------------------------
-- Messages and notifications
-- ---------------------------------------------------------------------------
create policy messages_read on public.messages for select to authenticated using (app.is_member(company_id));
-- Sending texts only happens through the send-sms server function (it checks consent and opt-outs).

create policy team_read on public.team_messages for select to authenticated
  using (app.is_member(company_id) and (thread = 'all' or position(app.my_member_id(company_id)::text in thread) > 0));
create policy team_insert on public.team_messages for insert to authenticated
  with check (from_member = app.my_member_id(company_id) and (thread = 'all' or position(app.my_member_id(company_id)::text in thread) > 0));

create policy push_tokens_own on public.push_tokens for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Inventory: owner and supervisors add parts and fill trucks. Techs only use parts off their own truck.
-- ---------------------------------------------------------------------------
create policy stock_locations_read on public.stock_locations for select to authenticated using (app.is_member(company_id));
create policy stock_locations_write on public.stock_locations for all to authenticated using (app.can(company_id, 'inventory')) with check (app.can(company_id, 'inventory'));
create policy parts_read on public.parts for select to authenticated using (app.is_member(company_id));
create policy parts_write on public.parts for all to authenticated using (app.can(company_id, 'inventory')) with check (app.can(company_id, 'inventory'));
create policy stock_read on public.stock for select to authenticated using (app.is_member(company_id));
create policy stock_write on public.stock for all to authenticated using (app.can(company_id, 'inventory')) with check (app.can(company_id, 'inventory'));

create or replace function public.move_stock(p_from uuid, p_to uuid, p_part uuid, p_qty int) returns int
language plpgsql security definer set search_path = public, app as $$
declare c uuid; have int;
begin
  select company_id into c from public.stock_locations where id = p_from;
  if c is null or not app.can(c, 'inventory') then raise exception 'Only the owner and supervisors move parts' using errcode = '42501'; end if;
  if not exists (select 1 from public.stock_locations where id = p_to and company_id = c) then raise exception 'Unknown location'; end if;
  if p_qty <= 0 then raise exception 'Pick how many'; end if;
  select qty into have from public.stock where location_id = p_from and part_id = p_part for update;
  if coalesce(have, 0) < p_qty then raise exception 'Only % left there', coalesce(have, 0); end if;
  update public.stock set qty = qty - p_qty where location_id = p_from and part_id = p_part;
  insert into public.stock(location_id, part_id, company_id, qty, min_qty) values (p_to, p_part, c, p_qty, 1)
  on conflict (location_id, part_id) do update set qty = public.stock.qty + p_qty;
  return p_qty;
end $$;

-- A tech uses a part from their own truck (or a manager from any location).
create or replace function public.use_part(p_location uuid, p_part uuid, p_qty int default 1) returns int
language plpgsql security definer set search_path = public, app as $$
declare l public.stock_locations; left_qty int;
begin
  select * into l from public.stock_locations where id = p_location;
  if l.id is null or not app.is_member(l.company_id) then raise exception 'Not allowed' using errcode = '42501'; end if;
  if not app.can(l.company_id, 'inventory') and (l.kind <> 'truck' or l.member_id is distinct from app.my_member_id(l.company_id)) then
    raise exception 'You can only use parts from your own truck' using errcode = '42501';
  end if;
  update public.stock set qty = greatest(0, qty - p_qty) where location_id = p_location and part_id = p_part returning qty into left_qty;
  return coalesce(left_qty, 0);
end $$;

-- ---------------------------------------------------------------------------
-- Sign-up and invites
-- ---------------------------------------------------------------------------
-- Called right after someone creates their login: makes their company, makes them the owner,
-- and starts a 14-day free trial.
create or replace function public.create_company(p_name text, p_owner_name text, p_plan text default 'team', p_trade text default 'hvac') returns uuid
language plpgsql security definer set search_path = public, app as $$
declare c uuid; m uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if exists (select 1 from public.members where user_id = auth.uid() and role = 'owner' and active) then
    raise exception 'You already own a company';
  end if;
  insert into public.companies(name, trade, email) values (p_name, coalesce(p_trade, 'hvac'), (select email from auth.users where id = auth.uid()))
  returning id into c;
  insert into public.members(company_id, user_id, name, email, role, perms)
  values (c, auth.uid(), coalesce(nullif(trim(p_owner_name), ''), 'Owner'), (select email from auth.users where id = auth.uid()), 'owner', app.default_perms('owner'))
  returning id into m;
  insert into public.subscriptions(company_id, plan, status, trial_ends_at, seats)
  values (c, coalesce(p_plan, 'team'), 'trialing', now() + interval '14 days', case coalesce(p_plan, 'team') when 'solo' then 1 when 'team' then 5 else 10 end);
  insert into public.stock_locations(company_id, name, kind) values (c, 'Shop inventory', 'shop');
  insert into public.payment_accounts(company_id) values (c);
  return c;
end $$;

create or replace function public.create_invite(p_company uuid, p_name text, p_role app.role, p_email text default null) returns text
language plpgsql security definer set search_path = public, app as $$
declare m uuid; code text; seats int; used int;
begin
  if not (app.is_owner(p_company) or (app.is_manager(p_company) and p_role in ('tech', 'apprentice'))) then
    raise exception 'Only the owner can add a supervisor' using errcode = '42501';
  end if;
  if p_role = 'owner' then raise exception 'There can only be one owner'; end if;
  select s.seats into seats from public.subscriptions s where s.company_id = p_company;
  select count(*) into used from public.members where company_id = p_company and active;
  if used >= coalesce(seats, 1) then raise exception 'Your plan has % users. Upgrade to add more.', seats; end if;
  insert into public.members(company_id, name, email, role, perms) values (p_company, p_name, p_email, p_role, app.default_perms(p_role)) returning id into m;
  insert into public.invites(company_id, member_id, email, created_by) values (p_company, m, p_email, auth.uid()) returning invites.code into code;
  return code;
end $$;

create or replace function public.accept_invite(p_code text) returns uuid
language plpgsql security definer set search_path = public, app as $$
declare i public.invites;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  select * into i from public.invites where code = upper(trim(p_code)) for update;
  if i.id is null or i.used_at is not null or i.expires_at < now() then raise exception 'That invite code is not valid anymore'; end if;
  perform set_config('app.trusted', 'on', true);
  update public.members set user_id = auth.uid(), email = coalesce(email, (select email from auth.users where id = auth.uid())) where id = i.member_id;
  perform set_config('app.trusted', 'off', true);
  update public.invites set used_at = now() where id = i.id;
  return i.company_id;
end $$;

-- ---------------------------------------------------------------------------
-- Grants. Supabase's API uses these roles. Server functions use service_role, which skips security.
-- ---------------------------------------------------------------------------
grant usage on schema public, app to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all functions in schema app to authenticated;
revoke all on public.counters from authenticated;
revoke insert, update, delete on public.audit_log, public.subscriptions, public.payment_accounts, public.messages, public.invites from authenticated;
revoke update, delete on public.location_pings from authenticated;
revoke delete on public.payments from authenticated;
revoke update on public.payments from authenticated;
revoke all on function public.create_company, public.create_invite, public.accept_invite, public.void_payment, public.record_refund,
  public.move_payment, public.move_stock, public.use_part from anon;
grant execute on function public.create_company, public.create_invite, public.accept_invite, public.void_payment, public.record_refund,
  public.move_payment, public.move_stock, public.use_part to authenticated;
