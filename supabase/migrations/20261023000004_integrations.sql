-- Extra columns and tables for the payment, texting and push integrations.
alter table public.payment_accounts add column if not exists terminal_location_id text;

-- Each shop's texting number (bought in Twilio, registered for business texting / 10DLC).
alter table public.companies add column if not exists sms_number text unique;

-- Stripe can send the same event more than once. We remember which ones we already handled.
create table if not exists public.processed_events (
  id text primary key,
  source text not null,
  processed_at timestamptz not null default now()
);
alter table public.processed_events enable row level security; -- server only, no rules for the app
revoke all on public.processed_events from authenticated, anon;

-- The phone records location through this (works for pings saved offline and sent later).
create or replace function public.record_ping(p_company uuid, p_lat double precision, p_lng double precision,
  p_accuracy real default null, p_speed real default null, p_at timestamptz default now()) returns void
language plpgsql security definer set search_path = public, app as $$
declare m uuid := app.my_member_id(p_company);
begin
  if m is null then raise exception 'Not allowed' using errcode = '42501'; end if;
  insert into public.location_pings(company_id, member_id, lat, lng, accuracy_m, speed_mps, at)
  values (p_company, m, p_lat, p_lng, p_accuracy, p_speed, coalesce(p_at, now()));
end $$;
revoke all on function public.record_ping from anon;
grant execute on function public.record_ping to authenticated;
