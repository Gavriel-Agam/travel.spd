-- Trip checklist (0026).
--
-- Three short lists per trip:
--   to_pack    what to bring (shared with everyone on the trip)
--   to_buy_do  what to buy or do during the trip (shared)
--   brought    what I brought: each person's own list, seen only by them
-- Rows are written straight from the app (offline changes are queued on the
-- device and sent later with the id they were created with, so a retry is
-- harmless). Removed from the trip: no access (is_trip_member). Deleting the
-- trip or the account removes the rows.

create table if not exists public.trip_checklist_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references public.trips (id) on delete cascade,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  list_type text not null check (list_type in ('to_pack', 'to_buy_do', 'brought')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  is_checked boolean not null default false,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trip_checklist_items_trip on public.trip_checklist_items (trip_id, list_type, sort_order);

alter table public.trip_checklist_items enable row level security;

-- Shared lists: anyone on the trip. "What I brought": only its owner.
create or replace function public.checklist_visible(p_trip_id uuid, p_list text, p_user uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_trip_member(p_trip_id) and (p_list <> 'brought' or p_user = auth.uid());
$$;
revoke all on function public.checklist_visible(uuid, text, uuid) from public, anon;
grant execute on function public.checklist_visible(uuid, text, uuid) to authenticated;

drop policy if exists checklist_read on public.trip_checklist_items;
create policy checklist_read on public.trip_checklist_items for select to authenticated
  using (public.checklist_visible(trip_id, list_type, user_id));

-- New rows are always the writer's own
drop policy if exists checklist_insert on public.trip_checklist_items;
create policy checklist_insert on public.trip_checklist_items for insert to authenticated
  with check (user_id = auth.uid() and public.checklist_visible(trip_id, list_type, user_id));

drop policy if exists checklist_update on public.trip_checklist_items;
create policy checklist_update on public.trip_checklist_items for update to authenticated
  using (public.checklist_visible(trip_id, list_type, user_id))
  with check (public.checklist_visible(trip_id, list_type, user_id));

drop policy if exists checklist_delete on public.trip_checklist_items;
create policy checklist_delete on public.trip_checklist_items for delete to authenticated
  using (public.checklist_visible(trip_id, list_type, user_id));

-- Only the text, tick and order change after an item is added (not its trip, list or owner)
revoke all on public.trip_checklist_items from anon, authenticated;
grant select, delete on public.trip_checklist_items to authenticated;
grant insert (id, trip_id, user_id, list_type, title, is_checked, sort_order) on public.trip_checklist_items to authenticated;
grant update (title, is_checked, sort_order, updated_at) on public.trip_checklist_items to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'trip_checklist_items') then
    alter publication supabase_realtime add table public.trip_checklist_items;
  end if;
end $$;
