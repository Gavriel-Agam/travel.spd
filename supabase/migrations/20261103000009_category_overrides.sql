-- Editable categories. Built-in categories are shared by every trip, so a trip
-- edits them through an override row (name, emoji, colour, hidden) instead of
-- changing the shared row. Expenses keep pointing at the same category id, so
-- renaming or hiding never changes past expenses. Trip-specific (custom)
-- categories are edited directly (existing update policy).

create table public.category_overrides (
  trip_id     uuid not null references public.trips (id) on delete cascade,
  category_id uuid not null references public.expense_categories (id) on delete cascade,
  name        text check (char_length(name) between 1 and 40),
  icon        text check (char_length(icon) <= 16),
  color       text check (color ~ '^#[0-9A-Fa-f]{6}$'),
  hidden      boolean not null default false,
  updated_at  timestamptz not null default now(),
  primary key (trip_id, category_id)
);

create trigger category_overrides_touch before update on public.category_overrides
  for each row execute function public.touch_updated_at();

-- Only built-in categories take overrides (custom ones are edited in place)
create or replace function public.check_override_builtin()
returns trigger language plpgsql set search_path = public as $$
begin
  if not exists (select 1 from expense_categories where id = new.category_id and trip_id is null) then
    raise exception 'override_builtin_only';
  end if;
  return new;
end;
$$;
create trigger category_overrides_builtin before insert or update on public.category_overrides
  for each row execute function public.check_override_builtin();
revoke execute on function public.check_override_builtin() from public, anon, authenticated;

alter table public.category_overrides enable row level security;
create policy overrides_read on public.category_overrides for select to authenticated using (public.is_trip_member(trip_id));
create policy overrides_insert on public.category_overrides for insert to authenticated with check (public.is_trip_member(trip_id));
create policy overrides_update on public.category_overrides for update to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy overrides_delete on public.category_overrides for delete to authenticated using (public.is_trip_member(trip_id));
revoke all on public.category_overrides from anon;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.category_overrides;
  end if;
end;
$$;
