-- Recently deleted expenses.
--
-- Deleting an expense already only marks it (deleted_at). It can now be
-- restored for 30 days; after that it is removed for good. Removal happens
-- whenever someone in the trip deletes or restores an expense (no scheduler).
--
-- Reading the deleted ones needs nothing new: expenses_read lets trip members
-- read the trip's rows (a private personal expense stays visible only to its
-- owner), and the app asks for rows with deleted_at set.

create or replace function public.purge_deleted_expenses(p_trip_id uuid)
returns void
language sql security definer set search_path = public
as $$
  delete from expenses where trip_id = p_trip_id and deleted_at < now() - interval '30 days';
$$;
revoke all on function public.purge_deleted_expenses(uuid) from public, anon, authenticated;

create or replace function public.restore_expense(p_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_existing expenses%rowtype;
begin
  select * into v_existing from expenses where id = p_id for update;
  if not found or not is_trip_member(v_existing.trip_id) or is_private_to_other(p_id)
     or v_existing.deleted_at is null or v_existing.deleted_at < now() - interval '30 days' then
    raise exception 'not_found';
  end if;

  -- Same version as when it was deleted: a change queued offline after restoring still applies
  update expenses set deleted_at = null, updated_by = auth.uid(), updated_at = now() where id = p_id;
  perform purge_deleted_expenses(v_existing.trip_id);
end;
$$;
revoke all on function public.restore_expense(uuid) from public, anon;
grant execute on function public.restore_expense(uuid) to authenticated;

create or replace function public.delete_expense(p_id uuid, p_expected_version int)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_existing expenses%rowtype;
begin
  select * into v_existing from expenses where id = p_id for update;
  if not found or not is_trip_member(v_existing.trip_id) or v_existing.deleted_at is not null then
    raise exception 'not_found';
  end if;
  if v_existing.version <> p_expected_version then raise exception 'conflict'; end if;

  update expenses
  set deleted_at = now(), updated_by = auth.uid(), version = version + 1, updated_at = now()
  where id = p_id;
  perform purge_deleted_expenses(v_existing.trip_id);
end;
$$;

create index if not exists expenses_trip_deleted_idx on public.expenses (trip_id, deleted_at desc) where deleted_at is not null;
