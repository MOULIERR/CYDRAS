-- Team tasks: to-dos for anyone on the team, with a due date and an optional job.
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  assigned_to uuid not null references public.members(id) on delete cascade,
  created_by uuid not null references public.members(id),
  title text not null check (length(trim(title)) > 0 and length(title) <= 500),
  due_on date,
  job_id uuid references public.jobs(id) on delete set null,
  done_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index tasks_who on public.tasks(company_id, assigned_to) where deleted_at is null;
create trigger tasks_touch before insert or update on public.tasks for each row execute function app.touch();

alter table public.tasks enable row level security;
-- Owner and supervisors see and manage all tasks. Everyone sees their own tasks and the ones they made.
create policy tasks_read on public.tasks for select to authenticated using (
  app.is_member(company_id) and (app.is_manager(company_id) or assigned_to = app.my_member_id(company_id) or created_by = app.my_member_id(company_id)));
create policy tasks_insert on public.tasks for insert to authenticated with check (
  app.is_member(company_id) and app.company_writable(company_id) and created_by = app.my_member_id(company_id)
  and (app.is_manager(company_id) or assigned_to = app.my_member_id(company_id)));
create policy tasks_update on public.tasks for update to authenticated using (
  app.is_member(company_id) and (app.is_manager(company_id) or assigned_to = app.my_member_id(company_id) or created_by = app.my_member_id(company_id)))
  with check (app.company_writable(company_id));
grant select, insert, update on public.tasks to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.tasks;
  end if;
end $$;
