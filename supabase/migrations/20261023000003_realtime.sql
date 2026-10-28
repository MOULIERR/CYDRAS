-- Live updates: the office and phones get changes the moment they happen.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs, public.job_assignments, public.job_lines, public.payments,
      public.time_entries, public.location_pings, public.messages, public.team_messages, public.stock, public.estimates, public.invoices;
  end if;
end $$;

-- Private storage for job photos, signatures, voice notes and documents. Files are kept under
-- <company_id>/<job_id>/<file>, and only people in that company can read or upload them.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') and exists (select 1 from pg_tables where schemaname='storage' and tablename='buckets') then
    insert into storage.buckets (id, name, public) values ('job-media', 'job-media', false) on conflict (id) do nothing;
    execute $p$create policy "company members read media" on storage.objects for select to authenticated
      using (bucket_id = 'job-media' and app.is_member((storage.foldername(name))[1]::uuid))$p$;
    execute $p$create policy "company members upload media" on storage.objects for insert to authenticated
      with check (bucket_id = 'job-media' and app.is_member((storage.foldername(name))[1]::uuid))$p$;
  end if;
end $$;
