-- Smart import usage (0022).
--
-- One row each time someone sends text or screenshots to be read into expenses
-- (Edge Function smart-parse-expenses). Used only for the daily limit: 15 per
-- person in any 24 hours. Rows are written by the function (service role);
-- people can read their own rows but never add or remove them, so the limit
-- can't be skipped. The function deletes a person's rows older than 2 days
-- each time it runs; deleting the account removes them all.

create table if not exists public.smart_import_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists smart_import_usage_user_time on public.smart_import_usage (user_id, created_at desc);

alter table public.smart_import_usage enable row level security;

drop policy if exists smart_import_usage_select_own on public.smart_import_usage;
create policy smart_import_usage_select_own on public.smart_import_usage
  for select to authenticated using (auth.uid() = user_id);

revoke all on public.smart_import_usage from anon, authenticated;
grant select on public.smart_import_usage to authenticated;
