-- 0015: in-app feedback.
--
-- Signed-in users can send short feedback from the app. The table is
-- write-only for them (like client_errors): no one can read feedback through
-- the API; it is read in the Supabase dashboard. user_id is always the sender
-- (column not writable by the app).
--
-- New feedback can notify the developer through ntfy.sh (phone push, optional
-- email). Topic and email are secrets kept in Supabase Vault, never in this
-- repo; until they are set (or where pg_net / Vault are missing, e.g. tests),
-- feedback is only stored. A notification failure never blocks saving.

create table public.app_feedback (
  id          bigint generated always as identity primary key,
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  trip_id     uuid references public.trips (id) on delete set null,
  message     text not null check (char_length(btrim(message)) between 1 and 2000),
  lang        text check (char_length(lang) <= 10),
  app_version text check (char_length(app_version) <= 40)
);
create index app_feedback_created_idx on public.app_feedback (created_at desc);

alter table public.app_feedback enable row level security;
create policy app_feedback_insert on public.app_feedback for insert to authenticated
  with check (user_id = auth.uid() and (trip_id is null or public.is_trip_member(trip_id)));
revoke all on public.app_feedback from anon, authenticated;
grant insert (trip_id, message, lang, app_version) on public.app_feedback to authenticated;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    create extension if not exists pg_net;
  end if;
end;
$$;

create or replace function public.notify_new_feedback()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_topic text;
  v_email text;
  v_body jsonb;
begin
  if to_regclass('vault.decrypted_secrets') is null
     or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                    where n.nspname = 'net' and p.proname = 'http_post') then
    return new;
  end if;

  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'feedback_ntfy_topic' limit 1$q$ into v_topic;
  if v_topic is null or v_topic = '' then return new; end if;
  execute $q$select decrypted_secret from vault.decrypted_secrets where name = 'feedback_notify_email' limit 1$q$ into v_email;

  -- Only the text and app version: no name, email or trip
  v_body := jsonb_build_object(
    'topic', v_topic,
    'title', 'SmartTrip feedback',
    'message', left(new.message, 1000) || coalesce(E'\n\n(v' || new.app_version || ', ' || new.lang || ')', ''),
    'tags', jsonb_build_array('speech_balloon')
  );
  if v_email is not null and v_email <> '' then
    v_body := v_body || jsonb_build_object('email', v_email);
  end if;

  -- pg_net queues the request and sends it after the insert commits
  execute 'select net.http_post(url := $1, body := $2)' using 'https://ntfy.sh/', v_body;
  return new;
exception when others then
  return new; -- never lose feedback because a notification failed
end;
$$;

revoke execute on function public.notify_new_feedback() from public, anon, authenticated;

create trigger app_feedback_notify
  after insert on public.app_feedback
  for each row execute function public.notify_new_feedback();
