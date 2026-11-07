-- 0014: the trip creator can remove a partner from the trip.
--
-- Removal is soft (removed_at), never a delete: expenses and splits point at
-- the member row, so history, balances and settle-up stay correct. A removed
-- member loses all access (is_trip_member ignores them, so every RLS policy and
-- RPC that checks it locks them out). Joining again with a new invite code
-- brings back the same member row.

alter table public.trip_members add column if not exists removed_at timestamptz;

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = auth.uid() and removed_at is null
  );
$$;

create or replace function public.remove_trip_member(p_member_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_mem trip_members%rowtype;
  v_trip trips%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_mem from trip_members where id = p_member_id for update;
  if not found then raise exception 'forbidden'; end if;
  select * into v_trip from trips where id = v_mem.trip_id;

  -- Only the trip's creator, while still in it; never in the shared demo trip
  if v_trip.created_by is distinct from v_uid or v_trip.shared or not is_trip_member(v_trip.id) then
    raise exception 'forbidden';
  end if;
  if v_mem.user_id = v_trip.created_by then raise exception 'cannot_remove_owner'; end if;

  update trip_members set removed_at = now() where id = p_member_id and removed_at is null;
end;
$$;

revoke execute on function public.remove_trip_member(uuid) from public, anon;
grant execute on function public.remove_trip_member(uuid) to authenticated;

-- Joining with a code: a removed member comes back as the same row
create or replace function public.join_trip(p_code text, p_member_name text, p_color text default '#FF6B8B')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv trip_invites%rowtype;
  v_mem trip_members%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_inv from trip_invites
  where code = upper(trim(p_code))
  for update;

  if not found or v_inv.expires_at < now() then
    raise exception 'invite_invalid';
  end if;

  select * into v_mem from trip_members where trip_id = v_inv.trip_id and user_id = v_uid;
  if found and v_mem.removed_at is null then
    return v_inv.trip_id; -- already a member: idempotent
  end if;

  if v_inv.used_by is not null then
    raise exception 'invite_used';
  end if;

  if found then
    update trip_members set removed_at = null, display_name = trim(p_member_name), color = p_color where id = v_mem.id;
  else
    insert into trip_members (trip_id, user_id, display_name, role, color)
    values (v_inv.trip_id, v_uid, trim(p_member_name), 'member', p_color);
  end if;

  update trip_invites set used_by = v_uid, used_at = now() where id = v_inv.id;

  update profiles set display_name = trim(p_member_name)
  where id = v_uid and display_name = '';

  return v_inv.trip_id;
end;
$$;
