-- Automatic ingestion (0024): iOS Shortcuts send card / Wallet payments and
-- shared screenshots to the Edge Function ingest-smart-item, which adds them
-- as expenses waiting for the person's OK ("pending review").
--
-- ingestion_tokens: a personal key per Shortcut. Only its sha256 is kept; the
--   key itself is shown once when created. Revoked keys stop working at once.
-- ingestion_settings: which trip new items go to and how they are split.
-- merchant_category_map: the category a person chose for a merchant, used for
--   the next payment there.
-- expenses: where an expense came from (source), the merchant, the review
--   state, the amount the card statement billed, and flight / hotel details.
--
-- A pending item is visible only to the person it came from until they
-- confirm it (is_private_to_other below), so partners never see unconfirmed
-- card payments.

-- ---------------------------------------------------------------- tokens

create table if not exists public.ingestion_tokens (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label        text not null check (char_length(label) between 1 and 40),
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz,
  -- Rate limit: uses in the current one-hour window (server only)
  window_start timestamptz,
  window_count int not null default 0
);
create index if not exists ingestion_tokens_user_idx on public.ingestion_tokens (user_id);

alter table public.ingestion_tokens enable row level security;
drop policy if exists ingestion_tokens_own on public.ingestion_tokens;
create policy ingestion_tokens_own on public.ingestion_tokens for select to authenticated using (user_id = auth.uid());
revoke all on public.ingestion_tokens from anon, authenticated;
-- Never the hash
grant select (id, user_id, label, created_at, last_used_at, revoked_at) on public.ingestion_tokens to authenticated;

create or replace function public.create_ingestion_token(p_label text)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_label text := left(coalesce(nullif(trim(p_label), ''), 'iPhone'), 40);
  v_token text;
  v_id uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if (select count(*) from ingestion_tokens where user_id = v_uid and revoked_at is null) >= 5 then
    raise exception 'too_many_tokens';
  end if;
  -- 244 random bits
  v_token := 'st_' || replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
  insert into ingestion_tokens (user_id, token_hash, label)
  values (v_uid, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_label)
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token, 'label', v_label);
end;
$$;
revoke all on function public.create_ingestion_token(text) from public, anon;
grant execute on function public.create_ingestion_token(text) to authenticated;

create or replace function public.revoke_ingestion_token(p_token_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  update ingestion_tokens set revoked_at = now()
  where id = p_token_id and user_id = auth.uid() and revoked_at is null;
  if not found then raise exception 'not_found'; end if;
end;
$$;
revoke all on function public.revoke_ingestion_token(uuid) from public, anon;
grant execute on function public.revoke_ingestion_token(uuid) to authenticated;

-- ---------------------------------------------------------------- settings

create table if not exists public.ingestion_settings (
  user_id             uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  default_trip_id     uuid references public.trips (id) on delete set null,
  route_by_trip_dates boolean not null default true,
  default_split_mode  text not null default 'equal' check (default_split_mode in ('equal', 'personal')),
  notify_push         boolean not null default true,
  updated_at          timestamptz not null default now()
);

alter table public.ingestion_settings enable row level security;
drop policy if exists ingestion_settings_own on public.ingestion_settings;
create policy ingestion_settings_own on public.ingestion_settings for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and (default_trip_id is null or public.is_trip_member(default_trip_id)));
revoke all on public.ingestion_settings from anon, authenticated;
grant select, insert, update, delete on public.ingestion_settings to authenticated;

drop trigger if exists ingestion_settings_touch on public.ingestion_settings;
create trigger ingestion_settings_touch before update on public.ingestion_settings
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- learned categories

create table if not exists public.merchant_category_map (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  merchant_pattern text not null check (char_length(merchant_pattern) between 2 and 120),
  category_id      uuid not null references public.expense_categories (id) on delete cascade,
  updated_at       timestamptz not null default now(),
  unique (user_id, merchant_pattern)
);

alter table public.merchant_category_map enable row level security;
drop policy if exists merchant_category_map_own on public.merchant_category_map;
create policy merchant_category_map_own on public.merchant_category_map for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke all on public.merchant_category_map from anon, authenticated;
grant select, insert, update, delete on public.merchant_category_map to authenticated;

drop trigger if exists merchant_category_map_touch on public.merchant_category_map;
create trigger merchant_category_map_touch before update on public.merchant_category_map
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- expenses

alter table public.expenses
  add column if not exists source text not null default 'manual'
    check (source in ('manual', 'smart_import', 'shortcut_notification', 'shortcut_wallet', 'shortcut_share', 'statement_import')),
  add column if not exists external_id text check (char_length(external_id) <= 200),
  add column if not exists merchant text check (char_length(merchant) <= 120),
  add column if not exists review_status text not null default 'confirmed' check (review_status in ('confirmed', 'pending_review')),
  add column if not exists billed_ils_minor bigint check (billed_ils_minor >= 0),
  add column if not exists booking_details jsonb
    check (booking_details is null or (jsonb_typeof(booking_details) = 'object' and octet_length(booking_details::text) <= 4000));

create index if not exists expenses_pending_review_idx on public.expenses (created_by) where review_status = 'pending_review' and deleted_at is null;

-- Pending items are the sender's alone until confirmed (RLS on expenses, splits
-- and receipts, and the edit guard, all go through this function)
create or replace function public.is_private_to_other(p_expense_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from expenses e
    join trip_members m on m.id = e.paid_by_member_id
    where e.id = p_expense_id
      and e.kind = 'expense'
      and e.split_type = 'personal'
      and m.user_id <> auth.uid()
      and not exists (select 1 from expense_splits s where s.expense_id = e.id and s.member_id <> e.paid_by_member_id)
  ) or exists (
    select 1 from expenses e
    where e.id = p_expense_id and e.review_status = 'pending_review' and e.created_by <> auth.uid()
  )
$$;

-- The new fields, as sent with an expense. Not a version change.
create or replace function public.apply_expense_extras(p_id uuid, p_expense jsonb)
returns public.expenses
language plpgsql security definer set search_path = public
as $$
declare
  v_row expenses%rowtype;
begin
  if not (p_expense ?| array['source', 'external_id', 'merchant', 'review_status', 'billed_ils_minor', 'booking_details']) then
    select * into v_row from expenses where id = p_id;
    return v_row;
  end if;
  update expenses set
    source = case when p_expense ? 'source' then coalesce(p_expense ->> 'source', 'manual') else source end,
    external_id = case when p_expense ? 'external_id' then p_expense ->> 'external_id' else external_id end,
    merchant = case when p_expense ? 'merchant' then nullif(left(trim(p_expense ->> 'merchant'), 120), '') else merchant end,
    review_status = case when p_expense ? 'review_status' then coalesce(p_expense ->> 'review_status', 'confirmed') else review_status end,
    billed_ils_minor = case when p_expense ? 'billed_ils_minor' then (p_expense ->> 'billed_ils_minor')::bigint else billed_ils_minor end,
    booking_details = case when p_expense ? 'booking_details' then nullif(p_expense -> 'booking_details', 'null'::jsonb) else booking_details end
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.apply_expense_extras(uuid, jsonb) from public, anon, authenticated;

-- save_expense (0005) now also stores the fields above
create or replace function public.save_expense(p_expense jsonb, p_expected_version int default null)
returns public.expenses
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := (p_expense ->> 'client_id')::uuid;
  v_row expenses%rowtype;
begin
  if p_expense ->> 'id' is not null or v_client is null then
    v_row := save_expense_core(p_expense, p_expected_version);
    return apply_expense_extras(v_row.id, p_expense);
  end if;

  -- A retry of something already saved: return it
  select * into v_row from expenses where client_id = v_client;
  if found then
    if not is_trip_member(v_row.trip_id) then raise exception 'forbidden'; end if;
    return v_row;
  end if;

  begin
    v_row := save_expense_core(p_expense, null);
    update expenses set client_id = v_client where id = v_row.id;
    v_row := apply_expense_extras(v_row.id, p_expense);
  exception when unique_violation then
    -- Two retries raced; the other one won. Its insert is the only one kept.
    select * into v_row from expenses where client_id = v_client;
    if not is_trip_member(v_row.trip_id) then raise exception 'forbidden'; end if;
  end;
  return v_row;
end;
$$;
grant execute on function public.save_expense(jsonb, int) to authenticated;

-- ---------------------------------------------------------------- ingestion (Edge Function only)

-- Checks a Shortcut's key (its sha256) and counts the use: 60 per key per hour.
create or replace function public.ingestion_auth(p_token_hash text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_t ingestion_tokens%rowtype;
begin
  select * into v_t from ingestion_tokens where token_hash = p_token_hash and revoked_at is null for update;
  if not found then raise exception 'invalid_token'; end if;
  if v_t.window_start is null or v_t.window_start < now() - interval '1 hour' then
    update ingestion_tokens set window_start = now(), window_count = 1, last_used_at = now() where id = v_t.id;
  elsif v_t.window_count >= 60 then
    raise exception 'rate_limited';
  else
    update ingestion_tokens set window_count = window_count + 1, last_used_at = now() where id = v_t.id;
  end if;
  return v_t.user_id;
end;
$$;
revoke all on function public.ingestion_auth(text) from public, anon, authenticated;

create or replace function public.normalize_merchant(p text)
returns text
language sql immutable set search_path = public
as $$ select left(regexp_replace(lower(trim(coalesce(p, ''))), '\s+', ' ', 'g'), 120) $$;

-- Adds one parsed payment as a pending expense of p_user.
-- p_item: { client_id, source, amount (decimal, as paid), currency? (else the trip's
--           default currency), merchant?, title?, occurred_at?, card_label?,
--           external_id?, booking_details? }
-- Returns { expense_id, trip_id, possible_duplicate }.
create or replace function public.ingest_expense(p_user uuid, p_item jsonb)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_when timestamptz := coalesce((p_item ->> 'occurred_at')::timestamptz, now());
  v_amount bigint;
  v_currency text := upper(nullif(p_item ->> 'currency', ''));
  v_merchant text := nullif(left(trim(p_item ->> 'merchant'), 120), '');
  v_norm text := normalize_merchant(p_item ->> 'merchant');
  v_client uuid := (p_item ->> 'client_id')::uuid;
  v_kind text := p_item -> 'booking_details' ->> 'kind';
  v_set ingestion_settings%rowtype;
  v_trip trips%rowtype;
  v_member trip_members%rowtype;
  v_rate text := '1';
  v_rate_date date;
  v_rate_source text := 'par';
  v_fee numeric := 0;
  v_cat uuid;
  v_splits jsonb;
  v_dup boolean;
  v_row expenses%rowtype;
begin
  if p_user is null or v_client is null then raise exception 'invalid_input'; end if;
  if coalesce(p_item ->> 'source', '') not in ('shortcut_notification', 'shortcut_wallet', 'shortcut_share') then
    raise exception 'invalid_input';
  end if;
  -- Act as that person for the checks inside save_expense
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', jsonb_build_object('sub', p_user, 'role', 'authenticated')::text, true);

  select * into v_set from ingestion_settings where user_id = p_user;
  if not found then
    v_set.route_by_trip_dates := true;
    v_set.default_split_mode := 'equal';
  end if;

  -- The trip whose dates include the payment, else the default trip
  if v_set.route_by_trip_dates then
    select t.* into v_trip from trips t join trip_members m on m.trip_id = t.id and m.user_id = p_user
    where t.start_date is not null
      and t.start_date <= (v_when at time zone t.timezone)::date
      and coalesce(t.end_date, t.start_date) >= (v_when at time zone t.timezone)::date
    order by t.start_date desc limit 1;
  end if;
  if v_trip.id is null and v_set.default_trip_id is not null then
    select t.* into v_trip from trips t join trip_members m on m.trip_id = t.id and m.user_id = p_user
    where t.id = v_set.default_trip_id;
  end if;
  if v_trip.id is null then raise exception 'no_trip'; end if;

  select * into v_member from trip_members where trip_id = v_trip.id and user_id = p_user;
  v_currency := coalesce(v_currency, v_trip.default_currency);
  select round((p_item ->> 'amount')::numeric * power(10, c.minor_units))::bigint into v_amount from currencies c where c.code = v_currency;
  if not found then raise exception 'invalid_currency'; end if;
  if v_amount is null or v_amount <= 0 then raise exception 'invalid_amount'; end if;

  -- The published rate for that day (or the latest), and the person's card fee
  if v_currency <> v_trip.home_currency then
    select r.rate, r.rate_date, r.source into v_rate, v_rate_date, v_rate_source
    from ils_rates((v_when at time zone v_trip.timezone)::date) r where r.currency = v_currency;
    if v_rate is null then
      select r.rate, r.rate_date, r.source into v_rate, v_rate_date, v_rate_source from ils_rates(current_date) r where r.currency = v_currency;
    end if;
    if v_rate is null then raise exception 'no_rate'; end if;
    v_fee := coalesce(v_member.card_fx_fee_pct, v_trip.card_fx_fee_pct, 0);
  end if;

  -- Category: learned for this merchant, else from the booking, else Other
  if v_norm <> '' then
    select mc.category_id into v_cat from merchant_category_map mc
    join expense_categories c on c.id = mc.category_id and (c.trip_id is null or c.trip_id = v_trip.id)
    where mc.user_id = p_user and (mc.merchant_pattern = v_norm or position(mc.merchant_pattern in v_norm) > 0)
    order by (mc.merchant_pattern = v_norm) desc, char_length(mc.merchant_pattern) desc limit 1;
  end if;
  if v_cat is null then
    select id into v_cat from expense_categories where trip_id is null
      and key = case v_kind when 'flight' then 'flights' when 'hotel' then 'accommodation' else 'other' end;
  end if;

  if v_set.default_split_mode = 'personal' then
    v_splits := jsonb_build_array(jsonb_build_object('member_id', v_member.id));
  else
    select jsonb_agg(jsonb_build_object('member_id', id)) into v_splits from trip_members where trip_id = v_trip.id;
  end if;

  -- Same amount and currency within 10 minutes: probably the same payment sent twice
  select exists (
    select 1 from expenses e
    where e.trip_id = v_trip.id and e.deleted_at is null and e.amount_minor = v_amount and e.currency = v_currency
      and abs(extract(epoch from e.occurred_at - v_when)) <= 600 and e.client_id is distinct from v_client
  ) into v_dup;

  v_row := save_expense(jsonb_build_object(
    'client_id', v_client,
    'trip_id', v_trip.id,
    'paid_by_member_id', v_member.id,
    'amount_minor', v_amount,
    'currency', v_currency,
    'fx_rate', v_rate,
    'fx_rate_date', v_rate_date,
    'fx_is_manual', false,
    'fx_fee_pct', v_fee,
    'category_id', v_cat,
    'description', left(coalesce(nullif(trim(p_item ->> 'title'), ''), v_merchant, ''), 120),
    'notes', nullif(left(trim(p_item ->> 'card_label'), 200), ''),
    'occurred_at', v_when,
    'payment_method', 'card',
    'split_type', case when v_set.default_split_mode = 'personal' then 'personal' else 'equal' end,
    'splits', v_splits,
    'source', p_item ->> 'source',
    'external_id', p_item ->> 'external_id',
    'merchant', v_merchant,
    'review_status', 'pending_review',
    'booking_details', p_item -> 'booking_details'
  ));
  return jsonb_build_object('expense_id', v_row.id, 'trip_id', v_trip.id, 'possible_duplicate', v_dup);
end;
$$;
revoke all on function public.ingest_expense(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.ingestion_auth(text) to service_role;
grant execute on function public.ingest_expense(uuid, jsonb) to service_role;
