-- Deleting a trip. Only the person who created it may; for anyone else the
-- call is refused. Everything in the trip goes with it: members, invite codes,
-- expenses and their splits, the trip's own categories and category changes,
-- and budgets (all of them reference the trip with ON DELETE CASCADE).
-- Feedback rows keep their text and lose the trip link (ON DELETE SET NULL).
-- The trip's photos (receipts, cover, member photos) live in storage, one folder
-- per trip; the app removes them first, while its user is still a member and
-- the storage rules allow it.

create or replace function public.delete_trip(p_trip_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_creator uuid;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  select created_by into v_creator from public.trips where id = p_trip_id;
  if not found or not public.is_trip_member(p_trip_id) then
    raise exception 'not_found';
  end if;
  if v_creator <> auth.uid() then
    raise exception 'not_trip_creator';
  end if;
  -- Expenses (and their splits) first: splits point at members, so members
  -- can only go once the splits are gone
  delete from public.expenses where trip_id = p_trip_id;
  delete from public.trips where id = p_trip_id;
end;
$$;

revoke all on function public.delete_trip(uuid) from public, anon;
grant execute on function public.delete_trip(uuid) to authenticated;
