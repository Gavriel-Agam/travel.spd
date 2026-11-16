-- 0019: card foreign-transaction fee and tax-free (VAT refund) estimates.
-- trips.card_fx_fee_pct: the % the card charges on foreign-currency payments.
-- trips.countries: the trip's destinations (ISO codes), for VAT refund rules.
-- expenses.fx_fee_pct: the fee included in this expense's home amount (kept,
--   so changing the trip setting later doesn't change old expenses).
-- expenses.tax_free / vat_country: bought tax free, and in which country.

alter table public.trips
  add column if not exists card_fx_fee_pct numeric(5,3) check (card_fx_fee_pct >= 0 and card_fx_fee_pct <= 10),
  add column if not exists countries text[] not null default '{}' check (cardinality(countries) <= 10);

alter table public.expenses
  add column if not exists fx_fee_pct numeric(5,3) not null default 0 check (fx_fee_pct >= 0 and fx_fee_pct <= 10),
  add column if not exists tax_free boolean not null default false,
  add column if not exists vat_country text check (vat_country ~ '^[A-Z]{2}$');

grant update (card_fx_fee_pct, countries) on public.trips to authenticated;

create or replace function public.save_expense_core(p_expense jsonb, p_expected_version int default null)
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
  v_fee numeric := coalesce((p_expense ->> 'fx_fee_pct')::numeric, 0);
  v_vat_country text := upper(nullif(p_expense ->> 'vat_country', ''));
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
    v_fee := 0;
  end if;
  if v_fee < 0 or v_fee > 10 then raise exception 'invalid_fee'; end if;

  -- No payer = paid from joint money (counts in totals, not in who owes whom).
  -- A settlement always has a payer.
  if v_payer is null then
    if coalesce(p_expense ->> 'kind', 'expense') = 'settlement' then raise exception 'invalid_payer'; end if;
  elsif not exists (select 1 from trip_members where id = v_payer and trip_id = v_trip) then
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
    if v_split_type = 'treat' and (v_payer is null or (v_splits -> 0 ->> 'member_id')::uuid <> v_payer) then
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
      order by coalesce((w ->> 'member_id')::uuid = v_payer, false) desc, (w ->> 'member_id')
    ) as o
    from jsonb_array_elements(v_weights) w
  ) x;

  -- The card's foreign-transaction fee is part of what the expense cost
  v_total := round(convert_minor(v_amount, v_currency, v_rate) * (100 + v_fee) / 100)::bigint;

  if v_id is null then
    insert into expenses (
      trip_id, kind, created_by, updated_by, paid_by_member_id, amount_minor, currency,
      fx_rate, fx_source, fx_rate_date, fx_fetched_at, fx_is_manual, amount_ils_minor,
      category_id, description, notes, occurred_at, receipt_path, payment_method, split_type,
      fx_fee_pct, tax_free, vat_country
    ) values (
      v_trip, coalesce(p_expense ->> 'kind', 'expense'), v_uid, v_uid, v_payer, v_amount, v_currency,
      v_rate, coalesce(p_expense ->> 'fx_source', 'manual'), (p_expense ->> 'fx_rate_date')::date,
      (p_expense ->> 'fx_fetched_at')::timestamptz, coalesce((p_expense ->> 'fx_is_manual')::boolean, false), v_total,
      (p_expense ->> 'category_id')::uuid, coalesce(trim(p_expense ->> 'description'), ''),
      nullif(trim(p_expense ->> 'notes'), ''), coalesce((p_expense ->> 'occurred_at')::timestamptz, now()),
      p_expense ->> 'receipt_path', p_expense ->> 'payment_method', v_split_type,
      v_fee, coalesce((p_expense ->> 'tax_free')::boolean, false), v_vat_country
    ) returning * into v_row;
  else
    select * into v_existing from expenses where id = v_id for update;
    if not found or v_existing.trip_id <> v_trip or v_existing.deleted_at is not null then
      raise exception 'not_found';
    end if;
    if p_expected_version is null or v_existing.version <> p_expected_version then
      raise exception 'conflict';
    end if;

    -- An older app version doesn't send these: keep what the expense has
    if not (p_expense ? 'fx_fee_pct') and v_currency <> (select home_currency from trips where id = v_trip) then
      v_fee := v_existing.fx_fee_pct;
      v_total := round(convert_minor(v_amount, v_currency, v_rate) * (100 + v_fee) / 100)::bigint;
    end if;
    if not (p_expense ? 'tax_free') then
      p_expense := p_expense || jsonb_build_object('tax_free', v_existing.tax_free);
      v_vat_country := v_existing.vat_country;
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
      fx_fee_pct = v_fee,
      tax_free = coalesce((p_expense ->> 'tax_free')::boolean, false),
      vat_country = v_vat_country,
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
alter function public.save_expense_core(jsonb, int) set search_path = public;
revoke all on function public.save_expense_core(jsonb, int) from public, anon, authenticated;
