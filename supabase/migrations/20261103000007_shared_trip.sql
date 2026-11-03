-- MVP without login: every device signs in anonymously (no email, code or
-- password) and joins one shared trip. Anyone who opens the app joins it, by
-- design for now; real accounts can be linked to these users later.

alter table public.trips add column shared boolean not null default false;
create unique index trips_one_shared_idx on public.trips (shared) where shared;

create or replace function public.join_shared_trip()
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trip uuid;
  v_count int;
  v_colors text[] := array['#3366FF', '#FF4D88', '#12B76A', '#F79009', '#7A5AF8', '#06AED4'];
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select id into v_trip from trips where shared;
  if v_trip is null then
    begin
      insert into trips (name, default_currency, timezone, created_by, shared)
      values ('Trip', 'THB', 'Asia/Bangkok', v_uid, true)
      returning id into v_trip;
    exception when unique_violation then
      -- Another device created it at the same moment
      select id into v_trip from trips where shared;
    end;
  end if;

  if not exists (select 1 from trip_members where trip_id = v_trip and user_id = v_uid) then
    select count(*) into v_count from trip_members where trip_id = v_trip;
    insert into trip_members (trip_id, user_id, display_name, role, color)
    values (
      v_trip, v_uid, 'Traveler ' || (v_count + 1),
      case when v_count = 0 then 'owner' else 'member' end,
      v_colors[1 + v_count % array_length(v_colors, 1)]
    );
  end if;

  return v_trip;
end;
$$;

revoke execute on function public.join_shared_trip() from public, anon;
grant execute on function public.join_shared_trip() to authenticated;
