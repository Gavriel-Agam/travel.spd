-- 1. Error log: the app records every error it shows (and uncaught ones) so
--    problems on the phones can be diagnosed from the server. Anyone may
--    write a row (errors can happen before sign-in); nobody can read through
--    the API. Inspect with SQL in the dashboard or the MCP server.
-- 2. join_shared_trip reports a stale session (its user no longer exists,
--    e.g. after the data was reset) as 'session_expired' instead of a
--    foreign-key failure, so the app can start a fresh session by itself.

create table public.client_errors (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid(),
  code        text check (char_length(code) <= 100),
  message     text check (char_length(message) <= 2000),
  context     text check (char_length(context) <= 200),  -- where in the app
  details     jsonb,                                       -- stack, status, extra
  url         text check (char_length(url) <= 500),
  user_agent  text check (char_length(user_agent) <= 500),
  app_version text check (char_length(app_version) <= 40)
);
create index client_errors_created_idx on public.client_errors (created_at desc);

alter table public.client_errors enable row level security;
create policy client_errors_insert on public.client_errors for insert to anon, authenticated with check (true);
revoke all on public.client_errors from anon, authenticated;
grant insert (code, message, context, details, url, user_agent, app_version) on public.client_errors to anon, authenticated;

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
  -- A token can outlive its user (deleted on reset): ask the app to start over
  if not exists (select 1 from auth.users where id = v_uid) then
    raise exception 'session_expired';
  end if;

  select id into v_trip from trips where shared;
  if v_trip is null then
    begin
      insert into trips (name, default_currency, timezone, created_by, shared)
      values ('Trip', 'THB', 'Asia/Bangkok', v_uid, true)
      returning id into v_trip;
    exception when unique_violation then
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
