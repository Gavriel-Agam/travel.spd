-- Voice expenses (docs/VOICE_EXPENSE_SPEC.md).
--
-- 1. expenses.source gets 'voice'.
-- 2. expenses.field_sources: where each field of a voice expense came from
--    (spoken / inferred / default / unresolved / edited), so the app can mark
--    what was heard and what was filled in.
-- 3. voice_captures: one row per recording (or typed entry) read by the
--    voice-parse function: the transcript and what was found, kept 7 days to
--    check and improve accuracy, then removed. The audio itself is never stored.
--    Written only by the function (service role); the sender can read their own.

-- ---------------------------------------------------------------- expenses

alter table public.expenses drop constraint if exists expenses_source_check;
alter table public.expenses add constraint expenses_source_check
  check (source in ('manual', 'smart_import', 'shortcut_notification', 'shortcut_wallet', 'shortcut_share', 'statement_import', 'voice'));

alter table public.expenses
  add column if not exists field_sources jsonb
    check (field_sources is null or (jsonb_typeof(field_sources) = 'object' and octet_length(field_sources::text) <= 500));

-- apply_expense_extras (0024) also stores field_sources when it is sent
create or replace function public.apply_expense_extras(p_id uuid, p_expense jsonb)
returns public.expenses
language plpgsql security definer set search_path = public
as $$
declare
  v_row expenses%rowtype;
begin
  if not (p_expense ?| array['source', 'external_id', 'merchant', 'review_status', 'billed_ils_minor', 'booking_details', 'field_sources']) then
    select * into v_row from expenses where id = p_id;
    return v_row;
  end if;
  update expenses set
    source = case when p_expense ? 'source' then coalesce(p_expense ->> 'source', 'manual') else source end,
    external_id = case when p_expense ? 'external_id' then p_expense ->> 'external_id' else external_id end,
    merchant = case when p_expense ? 'merchant' then nullif(left(trim(p_expense ->> 'merchant'), 120), '') else merchant end,
    review_status = case when p_expense ? 'review_status' then coalesce(p_expense ->> 'review_status', 'confirmed') else review_status end,
    billed_ils_minor = case when p_expense ? 'billed_ils_minor' then (p_expense ->> 'billed_ils_minor')::bigint else billed_ils_minor end,
    booking_details = case when p_expense ? 'booking_details' then nullif(p_expense -> 'booking_details', 'null'::jsonb) else booking_details end,
    field_sources = case when p_expense ? 'field_sources' then nullif(p_expense -> 'field_sources', 'null'::jsonb) else field_sources end
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.apply_expense_extras(uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------- voice_captures

create table if not exists public.voice_captures (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null unique,
  trip_id        uuid not null references public.trips (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  input          text not null check (input in ('audio', 'text')),
  status         text not null check (status in ('parsed', 'not_expense', 'failed')),
  transcript     text check (char_length(transcript) <= 2000),
  parse          jsonb check (parse is null or octet_length(parse::text) <= 20000),
  model          text check (char_length(model) <= 60),
  prompt_version text check (char_length(prompt_version) <= 20),
  latency_ms     int,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null default now() + interval '7 days'
);

create index if not exists voice_captures_user_time on public.voice_captures (user_id, created_at desc);
create index if not exists voice_captures_expiry on public.voice_captures (expires_at);

alter table public.voice_captures enable row level security;
revoke all on public.voice_captures from anon, authenticated;
grant select on public.voice_captures to authenticated;

drop policy if exists voice_captures_select_own on public.voice_captures;
create policy voice_captures_select_own on public.voice_captures
  for select to authenticated using (user_id = auth.uid());

-- Removes captures past their 7 days. Called by the voice-parse function on
-- each use (no scheduler needed); service role only.
create or replace function public.purge_voice_captures()
returns void
language sql security definer set search_path = public
as $$
  delete from voice_captures where expires_at < now();
$$;
revoke all on function public.purge_voice_captures() from public, anon, authenticated;
