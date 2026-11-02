-- TravelSpend Couple: core schema
-- Money is stored as integer minor units (bigint). Exchange rates are numeric.
-- Expenses and splits are written only through security definer RPCs, which
-- compute the ILS amount and the split shares on the server.


-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table public.currencies (
  code        char(3) primary key check (code ~ '^[A-Z]{3}$'),
  name_en     text not null,
  name_he     text not null,
  symbol      text not null,
  flag        text not null default '',
  minor_units smallint not null default 2 check (minor_units between 0 and 4),
  sort_order  int not null default 1000
);

-- ---------------------------------------------------------------------------
-- Users and trips
-- ---------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 60),
  avatar_url   text,
  locale       text not null default 'en' check (locale in ('en', 'he')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.trips (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 80),
  start_date       date,
  end_date         date,
  home_currency    char(3) not null default 'ILS' references public.currencies (code),
  default_currency char(3) not null default 'THB' references public.currencies (code),
  timezone         text not null default 'Asia/Bangkok',
  created_by       uuid not null references auth.users (id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (end_date is null or start_date is null or end_date >= start_date)
);

create table public.trip_members (
  id           uuid primary key default gen_random_uuid(),
  trip_id      uuid not null references public.trips (id) on delete cascade,
  user_id      uuid not null references auth.users (id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  color        text not null default '#4F7CFF',
  role         text not null default 'member' check (role in ('owner', 'member')),
  joined_at    timestamptz not null default now(),
  unique (trip_id, user_id)
);
create index trip_members_user_idx on public.trip_members (user_id);

create table public.trip_invites (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid not null references public.trips (id) on delete cascade,
  code       text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  created_by uuid not null references auth.users (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  used_by    uuid references auth.users (id),
  used_at    timestamptz
);
create index trip_invites_trip_idx on public.trip_invites (trip_id);

-- ---------------------------------------------------------------------------
-- Categories, expenses, splits, budgets, rates
-- ---------------------------------------------------------------------------

create table public.expense_categories (
  id         uuid primary key default gen_random_uuid(),
  trip_id    uuid references public.trips (id) on delete cascade, -- null = built-in
  key        text, -- stable key for built-in categories (translated in the app)
  name       text not null check (char_length(name) between 1 and 40),
  icon       text not null default '🏷️',
  color      text not null default '#8E8E93',
  sort_order int not null default 100,
  archived   boolean not null default false,
  created_at timestamptz not null default now(),
  check ((trip_id is null) = (key is not null))
);
create unique index expense_categories_key_idx on public.expense_categories (key) where trip_id is null;
create index expense_categories_trip_idx on public.expense_categories (trip_id);

create table public.expenses (
  id                uuid primary key default gen_random_uuid(),
  trip_id           uuid not null references public.trips (id) on delete cascade,
  kind              text not null default 'expense' check (kind in ('expense', 'settlement')),
  created_by        uuid not null references auth.users (id),
  updated_by        uuid not null references auth.users (id),
  paid_by_member_id uuid not null references public.trip_members (id),
  amount_minor      bigint not null check (amount_minor > 0 and amount_minor < 1000000000000000),
  currency          char(3) not null references public.currencies (code),
  fx_rate           numeric(24, 12) not null check (fx_rate > 0), -- home currency per 1 unit of `currency`
  fx_source         text not null default 'manual',
  fx_rate_date      date,
  fx_fetched_at     timestamptz,
  fx_is_manual      boolean not null default false,
  amount_ils_minor  bigint not null check (amount_ils_minor >= 0), -- set by trigger only
  category_id       uuid references public.expense_categories (id) on delete set null,
  description       text not null default '' check (char_length(description) <= 120),
  notes             text check (char_length(notes) <= 1000),
  occurred_at       timestamptz not null default now(),
  receipt_path      text,
  payment_method    text check (payment_method in ('cash', 'card', 'transfer', 'other')),
  split_type        text not null check (split_type in ('equal', 'treat', 'personal', 'percent', 'amount')),
  version           int not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  deleted_at        timestamptz
);
create index expenses_trip_time_idx on public.expenses (trip_id, occurred_at desc) where deleted_at is null;
create index expenses_trip_category_idx on public.expenses (trip_id, category_id);
create index expenses_trip_payer_idx on public.expenses (trip_id, paid_by_member_id);

create table public.expense_splits (
  expense_id           uuid not null references public.expenses (id) on delete cascade,
  member_id            uuid not null references public.trip_members (id),
  weight               numeric(24, 6) not null check (weight > 0),
  share_pct            numeric(7, 4), -- informational, for percent splits
  share_original_minor bigint,        -- informational, for amount splits
  share_ils_minor      bigint not null check (share_ils_minor >= 0),
  primary key (expense_id, member_id)
);
create index expense_splits_member_idx on public.expense_splits (member_id);

create table public.budgets (
  id               uuid primary key default gen_random_uuid(),
  trip_id          uuid not null references public.trips (id) on delete cascade,
  scope            text not null check (scope in ('total', 'daily', 'category', 'member')),
  category_id      uuid references public.expense_categories (id) on delete cascade,
  member_id        uuid references public.trip_members (id) on delete cascade,
  amount_ils_minor bigint not null check (amount_ils_minor > 0),
  updated_at       timestamptz not null default now(),
  check ((scope = 'category') = (category_id is not null)),
  check ((scope = 'member') = (member_id is not null))
);
create unique index budgets_unique_idx on public.budgets
  (trip_id, scope, coalesce(category_id, '00000000-0000-0000-0000-000000000000'::uuid),
   coalesce(member_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- Raw provider rates: 1 `base` = `rate` `quote`. Cross rates are derived in SQL.
create table public.exchange_rates (
  base       char(3) not null,
  quote      char(3) not null,
  rate_date  date not null,
  rate       numeric(24, 12) not null check (rate > 0),
  source     text not null,
  fetched_at timestamptz not null default now(),
  primary key (source, base, quote, rate_date)
);
create index exchange_rates_date_idx on public.exchange_rates (rate_date desc);

create table public.push_tokens (
  user_id    uuid not null references auth.users (id) on delete cascade,
  token      text not null,
  platform   text not null check (platform in ('ios', 'android', 'web')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.is_trip_member(p_trip_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.trip_members
    where trip_id = p_trip_id and user_id = auth.uid()
  );
$$;

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger trips_touch before update on public.trips
  for each row execute function public.touch_updated_at();
create trigger budgets_touch before update on public.budgets
  for each row execute function public.touch_updated_at();

-- New auth user -> profile row
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Converts an amount in minor units to home-currency minor units (2 decimals),
-- rounding half away from zero. All money math stays in numeric.
create or replace function public.convert_minor(p_amount_minor bigint, p_currency char(3), p_rate numeric)
returns bigint
language sql stable set search_path = public
as $$
  select round(
    (p_amount_minor::numeric / power(10::numeric, c.minor_units)) * p_rate * 100
  )::bigint
  from public.currencies c where c.code = p_currency;
$$;

-- Splits `p_total` into integer shares proportional to the weights. Each share
-- is floored, then the leftover units go one by one to members in `ord` order
-- (payer first, then member id). The shares always sum exactly to p_total.
create or replace function public.allocate_minor(p_total bigint, p_weights jsonb)
returns table (member_id uuid, share bigint)
language sql immutable
as $$
  with w as (
    select (x ->> 'member_id')::uuid as m, (x ->> 'ord')::int as ord, (x ->> 'weight')::numeric as wt
    from jsonb_array_elements(p_weights) x
  ),
  f as (
    select m, ord, floor(p_total * wt / sum(wt) over ())::bigint as s from w
  ),
  r as (
    select m, ord, s, row_number() over (order by ord) as rn, p_total - sum(s) over () as rest from f
  )
  select m, s + case when rn <= rest then 1 else 0 end from r order by ord;
$$;

-- ---------------------------------------------------------------------------
-- Trip RPCs
-- ---------------------------------------------------------------------------

create or replace function public.generate_invite_code()
returns text language sql volatile as $$
  -- 8 chars, no ambiguous characters (0/O, 1/I)
  select string_agg(substr('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 1 + floor(random() * 32)::int, 1), '')
  from generate_series(1, 8);
$$;

create or replace function public.create_trip(
  p_name text,
  p_member_name text,
  p_start_date date default null,
  p_end_date date default null,
  p_default_currency char(3) default 'THB',
  p_timezone text default 'Asia/Bangkok',
  p_total_budget_ils_minor bigint default null,
  p_daily_budget_ils_minor bigint default null,
  p_color text default '#4F7CFF'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_trip uuid;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  insert into trips (name, start_date, end_date, default_currency, timezone, created_by)
  values (trim(p_name), p_start_date, p_end_date, p_default_currency, p_timezone, v_uid)
  returning id into v_trip;

  insert into trip_members (trip_id, user_id, display_name, role, color)
  values (v_trip, v_uid, trim(p_member_name), 'owner', p_color);

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

create or replace function public.create_invite(p_trip_id uuid)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_code text;
begin
  if not is_trip_member(p_trip_id) then raise exception 'forbidden'; end if;

  -- Reuse a still-valid unused code so both partners see the same one
  select code into v_code from trip_invites
  where trip_id = p_trip_id and used_by is null and expires_at > now()
  order by created_at desc limit 1;
  if v_code is not null then return v_code; end if;

  loop
    v_code := generate_invite_code();
    begin
      insert into trip_invites (trip_id, code, created_by) values (p_trip_id, v_code, auth.uid());
      return v_code;
    exception when unique_violation then
      -- try another code
    end;
  end loop;
end;
$$;

create or replace function public.join_trip(p_code text, p_member_name text, p_color text default '#FF6B8B')
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_inv trip_invites%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_inv from trip_invites
  where code = upper(trim(p_code))
  for update;

  if not found or v_inv.expires_at < now() then
    raise exception 'invite_invalid';
  end if;

  if exists (select 1 from trip_members where trip_id = v_inv.trip_id and user_id = v_uid) then
    return v_inv.trip_id; -- already a member: idempotent
  end if;

  if v_inv.used_by is not null then
    raise exception 'invite_used';
  end if;

  insert into trip_members (trip_id, user_id, display_name, role, color)
  values (v_inv.trip_id, v_uid, trim(p_member_name), 'member', p_color);

  update trip_invites set used_by = v_uid, used_at = now() where id = v_inv.id;

  update profiles set display_name = trim(p_member_name)
  where id = v_uid and display_name = '';

  return v_inv.trip_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Expense RPCs
-- ---------------------------------------------------------------------------

-- p_expense keys: id (optional), trip_id, kind, paid_by_member_id, amount_minor,
--   currency, fx_rate, fx_source, fx_rate_date, fx_fetched_at, fx_is_manual,
--   category_id, description, notes, occurred_at, receipt_path, payment_method,
--   split_type, splits: [{member_id, value}]
-- `value` meaning by split_type: equal -> ignored (members listed are the
-- beneficiaries), percent -> percentage, amount -> original-currency minor units.
-- treat/personal need exactly one entry (the member who owns the cost).
-- p_expected_version: required for updates; mismatch raises 'conflict'.
create or replace function public.save_expense(p_expense jsonb, p_expected_version int default null)
returns public.expenses
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := (p_expense ->> 'id')::uuid;
  v_trip uuid := (p_expense ->> 'trip_id')::uuid;
  v_payer uuid := (p_expense ->> 'paid_by_member_id')::uuid;
  v_split_type text := p_expense ->> 'split_type';
  v_amount bigint := (p_expense ->> 'amount_minor')::bigint;
  v_currency char(3) := upper(p_expense ->> 'currency');
  v_rate numeric := (p_expense ->> 'fx_rate')::numeric;
  v_total bigint;
  v_splits jsonb := coalesce(p_expense -> 'splits', '[]'::jsonb);
  v_weights jsonb;
  v_count int;
  v_sum numeric;
  v_existing expenses%rowtype;
  v_row expenses%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if not is_trip_member(v_trip) then raise exception 'forbidden'; end if;

  if not exists (select 1 from currencies where code = v_currency) then
    raise exception 'invalid_currency';
  end if;
  if v_amount is null or v_amount <= 0 then raise exception 'invalid_amount'; end if;
  if v_rate is null or v_rate <= 0 then raise exception 'invalid_rate'; end if;

  -- Home currency is always at par
  if v_currency = (select home_currency from trips where id = v_trip) then
    v_rate := 1;
  end if;

  if not exists (select 1 from trip_members where id = v_payer and trip_id = v_trip) then
    raise exception 'invalid_payer';
  end if;

  -- Every split member must belong to the trip, with no duplicates
  select count(*), count(distinct s ->> 'member_id') into v_count, v_sum
  from jsonb_array_elements(v_splits) s;
  if v_count = 0 or v_count <> v_sum then raise exception 'invalid_split: members'; end if;
  if exists (
    select 1 from jsonb_array_elements(v_splits) s
    where not exists (
      select 1 from trip_members m where m.id = (s ->> 'member_id')::uuid and m.trip_id = v_trip
    )
  ) then
    raise exception 'invalid_split: member not in trip';
  end if;

  -- Turn the split configuration into weights
  if v_split_type = 'equal' then
    select jsonb_agg(jsonb_build_object('member_id', s ->> 'member_id', 'weight', 1)) into v_weights
    from jsonb_array_elements(v_splits) s;
  elsif v_split_type in ('treat', 'personal') then
    if v_count <> 1 then raise exception 'invalid_split: exactly one member'; end if;
    if v_split_type = 'treat' and (v_splits -> 0 ->> 'member_id')::uuid <> v_payer then
      raise exception 'invalid_split: treat belongs to payer';
    end if;
    v_weights := jsonb_build_array(jsonb_build_object('member_id', v_splits -> 0 ->> 'member_id', 'weight', 1));
  elsif v_split_type = 'percent' then
    select sum((s ->> 'value')::numeric) into v_sum from jsonb_array_elements(v_splits) s;
    if v_sum <> 100 or exists (select 1 from jsonb_array_elements(v_splits) s where (s ->> 'value')::numeric <= 0) then
      raise exception 'invalid_split: percentages must be positive and sum to 100';
    end if;
    select jsonb_agg(jsonb_build_object('member_id', s ->> 'member_id', 'weight', (s ->> 'value')::numeric)) into v_weights
    from jsonb_array_elements(v_splits) s;
  elsif v_split_type = 'amount' then
    select sum((s ->> 'value')::bigint) into v_sum from jsonb_array_elements(v_splits) s;
    if v_sum <> v_amount or exists (select 1 from jsonb_array_elements(v_splits) s where (s ->> 'value')::bigint <= 0) then
      raise exception 'invalid_split: amounts must be positive and sum to the total';
    end if;
    select jsonb_agg(jsonb_build_object('member_id', s ->> 'member_id', 'weight', (s ->> 'value')::bigint)) into v_weights
    from jsonb_array_elements(v_splits) s;
  else
    raise exception 'invalid_split: type';
  end if;

  -- Ordering for leftover units: payer first, then by member id
  select jsonb_agg(w || jsonb_build_object('ord', o)) into v_weights
  from (
    select w, row_number() over (
      order by ((w ->> 'member_id')::uuid = v_payer) desc, (w ->> 'member_id')
    ) as o
    from jsonb_array_elements(v_weights) w
  ) x;

  v_total := convert_minor(v_amount, v_currency, v_rate);

  if v_id is null then
    insert into expenses (
      trip_id, kind, created_by, updated_by, paid_by_member_id, amount_minor, currency,
      fx_rate, fx_source, fx_rate_date, fx_fetched_at, fx_is_manual, amount_ils_minor,
      category_id, description, notes, occurred_at, receipt_path, payment_method, split_type
    ) values (
      v_trip, coalesce(p_expense ->> 'kind', 'expense'), v_uid, v_uid, v_payer, v_amount, v_currency,
      v_rate, coalesce(p_expense ->> 'fx_source', 'manual'), (p_expense ->> 'fx_rate_date')::date,
      (p_expense ->> 'fx_fetched_at')::timestamptz, coalesce((p_expense ->> 'fx_is_manual')::boolean, false), v_total,
      (p_expense ->> 'category_id')::uuid, coalesce(trim(p_expense ->> 'description'), ''),
      nullif(trim(p_expense ->> 'notes'), ''), coalesce((p_expense ->> 'occurred_at')::timestamptz, now()),
      p_expense ->> 'receipt_path', p_expense ->> 'payment_method', v_split_type
    ) returning * into v_row;
  else
    select * into v_existing from expenses where id = v_id for update;
    if not found or v_existing.trip_id <> v_trip or v_existing.deleted_at is not null then
      raise exception 'not_found';
    end if;
    if p_expected_version is null or v_existing.version <> p_expected_version then
      raise exception 'conflict';
    end if;

    update expenses set
      kind = coalesce(p_expense ->> 'kind', kind),
      updated_by = v_uid,
      paid_by_member_id = v_payer,
      amount_minor = v_amount,
      currency = v_currency,
      fx_rate = v_rate,
      fx_source = coalesce(p_expense ->> 'fx_source', 'manual'),
      fx_rate_date = (p_expense ->> 'fx_rate_date')::date,
      fx_fetched_at = (p_expense ->> 'fx_fetched_at')::timestamptz,
      fx_is_manual = coalesce((p_expense ->> 'fx_is_manual')::boolean, false),
      amount_ils_minor = v_total,
      category_id = (p_expense ->> 'category_id')::uuid,
      description = coalesce(trim(p_expense ->> 'description'), ''),
      notes = nullif(trim(p_expense ->> 'notes'), ''),
      occurred_at = coalesce((p_expense ->> 'occurred_at')::timestamptz, occurred_at),
      receipt_path = p_expense ->> 'receipt_path',
      payment_method = p_expense ->> 'payment_method',
      split_type = v_split_type,
      version = version + 1,
      updated_at = now()
    where id = v_id
    returning * into v_row;

    delete from expense_splits where expense_id = v_id;
  end if;

  if v_row.category_id is not null and not exists (
    select 1 from expense_categories c
    where c.id = v_row.category_id and (c.trip_id is null or c.trip_id = v_trip)
  ) then
    raise exception 'invalid_category';
  end if;

  insert into expense_splits (expense_id, member_id, weight, share_pct, share_original_minor, share_ils_minor)
  select v_row.id, a.member_id,
         (select (w ->> 'weight')::numeric from jsonb_array_elements(v_weights) w where (w ->> 'member_id')::uuid = a.member_id),
         case when v_split_type = 'percent' then
           (select (s ->> 'value')::numeric from jsonb_array_elements(v_splits) s where (s ->> 'member_id')::uuid = a.member_id) end,
         case when v_split_type = 'amount' then
           (select (s ->> 'value')::bigint from jsonb_array_elements(v_splits) s where (s ->> 'member_id')::uuid = a.member_id) end,
         a.share
  from allocate_minor(v_total, v_weights) a;

  return v_row;
end;
$$;

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
end;
$$;

-- Guard: shares of a live expense must always add up to its total
create or replace function public.check_split_totals()
returns trigger language plpgsql as $$
declare
  v_id uuid := coalesce(new.expense_id, old.expense_id);
  v_total bigint;
  v_sum bigint;
begin
  select amount_ils_minor into v_total from expenses where id = v_id;
  if v_total is null then return null; end if;
  select coalesce(sum(share_ils_minor), 0) into v_sum from expense_splits where expense_id = v_id;
  if v_sum <> v_total then
    raise exception 'split_mismatch: % <> %', v_sum, v_total;
  end if;
  return null;
end;
$$;

create constraint trigger expense_splits_total
  after insert or update or delete on public.expense_splits
  deferrable initially deferred
  for each row execute function public.check_split_totals();

-- ---------------------------------------------------------------------------
-- Exchange rates
-- ---------------------------------------------------------------------------

-- Home-currency (ILS) value of 1 unit of each currency, derived from the most
-- recent provider snapshot on or before p_date. Returned as text to keep precision.
create or replace function public.ils_rates(p_date date default current_date)
returns table (currency char(3), rate text, rate_date date, source text, fetched_at timestamptz)
language sql stable security definer set search_path = public
as $$
  with snap as (
    select r.source, r.base, max(r.rate_date) as d
    from exchange_rates r
    where r.rate_date <= p_date and r.quote = 'ILS'
    group by r.source, r.base
    order by max(r.rate_date) desc
    limit 1
  ),
  rows as (
    select r.* from exchange_rates r join snap s
      on r.source = s.source and r.base = s.base and r.rate_date = s.d
  ),
  ils as (select rate from rows where quote = 'ILS')
  select r.quote, round((select rate from ils) / r.rate, 10)::text, r.rate_date, r.source, r.fetched_at
  from rows r where r.quote <> 'ILS'
  union all
  select r.base, round((select rate from ils), 10)::text, r.rate_date, r.source, r.fetched_at
  from rows r where r.quote = 'ILS'
  union all
  select 'ILS'::char(3), '1', p_date, 'par', now();
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.currencies enable row level security;
alter table public.profiles enable row level security;
alter table public.trips enable row level security;
alter table public.trip_members enable row level security;
alter table public.trip_invites enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.budgets enable row level security;
alter table public.exchange_rates enable row level security;
alter table public.push_tokens enable row level security;

create policy currencies_read on public.currencies for select to authenticated using (true);
create policy rates_read on public.exchange_rates for select to authenticated using (true);

create policy profiles_read on public.profiles for select to authenticated using (
  id = auth.uid() or exists (
    select 1 from public.trip_members a
    join public.trip_members b on a.trip_id = b.trip_id
    where a.user_id = auth.uid() and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

create policy trips_read on public.trips for select to authenticated using (public.is_trip_member(id));
create policy trips_update on public.trips for update to authenticated
  using (public.is_trip_member(id)) with check (public.is_trip_member(id));

create policy members_read on public.trip_members for select to authenticated using (public.is_trip_member(trip_id));
create policy members_update_self on public.trip_members for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_trip_member(trip_id));

create policy invites_read on public.trip_invites for select to authenticated using (public.is_trip_member(trip_id));

create policy categories_read on public.expense_categories for select to authenticated
  using (trip_id is null or public.is_trip_member(trip_id));
create policy categories_insert on public.expense_categories for insert to authenticated
  with check (trip_id is not null and key is null and public.is_trip_member(trip_id));
create policy categories_update on public.expense_categories for update to authenticated
  using (trip_id is not null and public.is_trip_member(trip_id))
  with check (trip_id is not null and key is null and public.is_trip_member(trip_id));

-- Expenses and splits: read for members, write only through the RPCs above
create policy expenses_read on public.expenses for select to authenticated using (public.is_trip_member(trip_id));
create policy splits_read on public.expense_splits for select to authenticated using (
  exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id))
);

create policy budgets_read on public.budgets for select to authenticated using (public.is_trip_member(trip_id));
create policy budgets_insert on public.budgets for insert to authenticated with check (public.is_trip_member(trip_id));
create policy budgets_update on public.budgets for update to authenticated
  using (public.is_trip_member(trip_id)) with check (public.is_trip_member(trip_id));
create policy budgets_delete on public.budgets for delete to authenticated using (public.is_trip_member(trip_id));

create policy push_tokens_own on public.push_tokens for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Column-level write limits (RLS decides rows, grants decide columns)
revoke insert, update, delete on public.profiles, public.trips, public.trip_members, public.trip_invites,
  public.expenses, public.expense_splits, public.currencies, public.exchange_rates from anon, authenticated;
grant update (display_name, avatar_url, locale) on public.profiles to authenticated;
grant update (name, start_date, end_date, default_currency, timezone) on public.trips to authenticated;
grant update (display_name, color) on public.trip_members to authenticated;

-- RPC access
revoke all on function public.allocate_minor(bigint, jsonb) from public;
revoke all on function public.generate_invite_code() from public;
grant execute on function public.create_trip(text, text, date, date, char, text, bigint, bigint, text) to authenticated;
grant execute on function public.create_invite(uuid) to authenticated;
grant execute on function public.join_trip(text, text, text) to authenticated;
grant execute on function public.save_expense(jsonb, int) to authenticated;
grant execute on function public.delete_expense(uuid, int) to authenticated;
grant execute on function public.ils_rates(date) to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table
      public.expenses, public.expense_splits, public.trip_members,
      public.budgets, public.expense_categories, public.trips;
  end if;
end;
$$;
