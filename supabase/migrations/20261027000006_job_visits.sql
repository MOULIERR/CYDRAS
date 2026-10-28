-- More visits on the same job: come back another day without a new appointment.
-- Visit 1 is the job itself. Visits 2, 3, 4... point to it. Invoice, payments and summary stay on visit 1.
alter table public.jobs
  add column parent_job_id uuid references public.jobs(id) on delete cascade,
  add column visit_number int not null default 1 check (visit_number between 1 and 50),
  add column visit_note text,
  add constraint jobs_visit_shape check ((parent_job_id is null and visit_number = 1) or (parent_job_id is not null and visit_number > 1)),
  add constraint jobs_not_own_visit check (parent_job_id is distinct from id);
create index jobs_parent on public.jobs(parent_job_id) where parent_job_id is not null;
create unique index jobs_visit_unique on public.jobs(parent_job_id, visit_number) where parent_job_id is not null;

-- A visit must belong to a first visit of the same company and customer.
create or replace function app.guard_job_visit() returns trigger language plpgsql security definer set search_path = public, app as $$
declare p public.jobs;
begin
  if new.parent_job_id is null then return new; end if;
  select * into p from public.jobs where id = new.parent_job_id;
  if not found then raise exception 'That job was not found' using errcode = '23503'; end if;
  if p.parent_job_id is not null then raise exception 'Add visits to the first visit of the job' using errcode = '22023'; end if;
  if p.company_id <> new.company_id or p.customer_id <> new.customer_id then
    raise exception 'A visit must be for the same customer' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger jobs_visit_guard before insert or update of parent_job_id, customer_id, company_id on public.jobs
  for each row execute function app.guard_job_visit();

-- Invoices are only made for the first visit.
create or replace function app.guard_invoice_root() returns trigger language plpgsql security definer set search_path = public, app as $$
begin
  if new.job_id is not null and exists (select 1 from public.jobs where id = new.job_id and parent_job_id is not null) then
    raise exception 'Bill this on the first visit of the job' using errcode = '22023';
  end if;
  return new;
end $$;
create trigger invoices_root_guard before insert or update of job_id on public.invoices
  for each row execute function app.guard_invoice_root();
