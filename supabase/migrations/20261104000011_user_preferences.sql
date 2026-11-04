-- Personal preferences that follow the user to every device (not shared with
-- the partner). For now: the order of the Home cards.

create table public.user_preferences (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  home_layout text[] check (home_layout is null or cardinality(home_layout) <= 20),
  updated_at  timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
create policy user_preferences_read on public.user_preferences for select to authenticated using (user_id = auth.uid());
create policy user_preferences_insert on public.user_preferences for insert to authenticated with check (user_id = auth.uid());
create policy user_preferences_update on public.user_preferences for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.user_preferences from anon;
