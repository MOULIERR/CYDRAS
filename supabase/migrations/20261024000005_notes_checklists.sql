-- Private notes: a list of plain text boxes on the job (team only, never sent to the customer).
alter table public.jobs
  add constraint jobs_private_notes_list check (jsonb_typeof(private_notes) = 'array' and jsonb_array_length(private_notes) <= 50);

-- Checklists are only on a job when someone picks one. No automatic attaching.
alter table public.checklists drop column if exists match;
