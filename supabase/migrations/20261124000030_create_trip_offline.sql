-- A trip can be created without a connection (0030).
--
-- The phone makes up the trip's id and the creator's member id, shows the trip
-- at once and sends it when the connection returns (expenses added meanwhile
-- already use those ids). Sending it again (the answer was lost on a weak
-- signal) returns the same trip instead of making a second one.
-- Called without the ids (older app versions), it works as before.

drop function if exists public.create_trip(text, text, date, date, char, text, bigint, bigint, text);

create function public.create_trip(
  p_name text,
  p_member_name text,
  p_start_date date default null,
  p_end_date date default null,
  p_default_currency char(3) default 'THB',
  p_timezone text default 'Asia/Bangkok',
  p_total_budget_ils_minor bigint default null,
  p_daily_budget_ils_minor bigint default null,
  p_color text default '#4F7CFF',
  p_trip_id uuid default null,
  p_member_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trip uuid := coalesce(p_trip_id, gen_random_uuid());
  v_owner uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  -- Already created (a resend): the same trip, never a second one
  if p_trip_id is not null then
    select created_by into v_owner from trips where id = p_trip_id;
    if found then
      if v_owner = v_uid then return p_trip_id; end if;
      raise exception 'conflict';
    end if;
  end if;

  insert into trips (id, name, start_date, end_date, default_currency, timezone, created_by)
  values (v_trip, trim(p_name), p_start_date, p_end_date, p_default_currency, p_timezone, v_uid);

  insert into trip_members (id, trip_id, user_id, display_name, role, color)
  values (coalesce(p_member_id, gen_random_uuid()), v_trip, v_uid, trim(p_member_name), 'owner', p_color);

  if p_total_budget_ils_minor is not null then
    insert into budgets (trip_id, scope, amount_ils_minor) values (v_trip, 'total', p_total_budget_ils_minor);
  end if;
  if p_daily_budget_ils_minor is not null then
    insert into budgets (trip_id, scope, amount_ils_minor) values (v_trip, 'daily', p_daily_budget_ils_minor);
  end if;

  update profiles set display_name = trim(p_member_name)
  where id = v_uid and display_name = '';

  return v_trip;
end;
$$;

revoke all on function public.create_trip(text, text, date, date, char, text, bigint, bigint, text, uuid, uuid) from public, anon;
grant execute on function public.create_trip(text, text, date, date, char, text, bigint, bigint, text, uuid, uuid) to authenticated;
