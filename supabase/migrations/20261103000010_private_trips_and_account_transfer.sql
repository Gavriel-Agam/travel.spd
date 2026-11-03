-- Real accounts (email + password, Google) replace the public no-login MVP.
--
-- 1. The shared trip becomes an ordinary private trip: its current members
--    keep it, everyone else needs an invite code. join_shared_trip is retired.
-- 2. Account transfer: a phone signed in with an anonymous identity (the MVP)
--    keeps its trips and expenses when its owner signs in. Before signing in,
--    the phone gets a one-time token for its anonymous user; after signing
--    in, it hands the token back and the server moves memberships and
--    authorship to the real account. Only the phone holding the anonymous
--    session can create the token, so nobody can claim someone else's data.

update public.trips set shared = false where shared;
revoke execute on function public.join_shared_trip() from public, anon, authenticated;

create table public.account_transfers (
  token      uuid primary key default gen_random_uuid(),
  from_user  uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '1 day'
);
alter table public.account_transfers enable row level security;  -- no policies: functions only
revoke all on public.account_transfers from anon, authenticated;

create or replace function public.start_account_transfer()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_token uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) is not true then
    raise exception 'not_anonymous';
  end if;
  delete from account_transfers where from_user = v_uid;
  insert into account_transfers (from_user) values (v_uid) returning token into v_token;
  return v_token;
end;
$$;

-- Returns how many trip memberships moved to the signed-in account.
create or replace function public.finish_account_transfer(p_token uuid)
returns int
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_from uuid;
  v_moved int;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'still_anonymous';
  end if;

  delete from account_transfers where token = p_token and expires_at > now() returning from_user into v_from;
  if v_from is null then raise exception 'transfer_invalid'; end if;
  if v_from = v_uid then return 0; end if;

  -- Memberships move unless the account is already in that trip
  update trip_members set user_id = v_uid
  where user_id = v_from
    and trip_id not in (select trip_id from trip_members where user_id = v_uid);
  get diagnostics v_moved = row_count;

  update expenses set created_by = v_uid where created_by = v_from;
  update expenses set updated_by = v_uid where updated_by = v_from;
  update trips set created_by = v_uid where created_by = v_from;
  update trip_invites set created_by = v_uid where created_by = v_from;
  update trip_invites set used_by = v_uid where used_by = v_from;

  -- Keep a display name the anonymous profile may have had
  update profiles p set display_name = o.display_name
  from profiles o
  where p.id = v_uid and o.id = v_from and p.display_name = '' and o.display_name <> '';

  return v_moved;
end;
$$;

revoke all on function public.start_account_transfer() from public, anon;
revoke all on function public.finish_account_transfer(uuid) from public, anon;
grant execute on function public.start_account_transfer() to authenticated;
grant execute on function public.finish_account_transfer(uuid) to authenticated;
