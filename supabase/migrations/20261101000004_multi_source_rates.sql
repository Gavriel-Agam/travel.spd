-- Two rate sources: ECB reference rates first ('ecb'), and an open daily
-- dataset for currencies the ECB does not publish, such as VND, KHR, LAK ('market').
-- Each currency comes from the highest-priority source that has it, and each
-- row carries its own rate date and source.

create or replace function public.ils_rates(p_date date default current_date)
returns table (currency char(3), rate text, rate_date date, source text, fetched_at timestamptz)
language sql stable security definer set search_path = public
as $$
  with sources (source, priority) as (values ('ecb', 1), ('market', 2)),
  snap as (
    select s.source, s.priority,
      (select max(r.rate_date) from exchange_rates r
        where r.source = s.source and r.base = 'EUR' and r.quote = 'ILS' and r.rate_date <= p_date) as d
    from sources s
  ),
  ils as (
    select sn.source, sn.priority, sn.d, r.rate as ils_rate, r.fetched_at
    from snap sn
    join exchange_rates r on r.source = sn.source and r.base = 'EUR' and r.quote = 'ILS' and r.rate_date = sn.d
  ),
  xr as (
    select r.quote as cur, i.ils_rate / r.rate as v, i.d, i.source, r.fetched_at, i.priority
    from ils i
    join exchange_rates r on r.source = i.source and r.base = 'EUR' and r.rate_date = i.d
    where r.quote <> 'ILS'
    union all
    select 'EUR', i.ils_rate, i.d, i.source, i.fetched_at, i.priority from ils i
  ),
  ranked as (
    select distinct on (cur) cur, v, d, source, fetched_at from xr order by cur, priority
  )
  select ranked.cur::char(3), round(ranked.v, 10)::text, ranked.d, ranked.source, ranked.fetched_at
  from ranked
  where ranked.cur in (select code from currencies) and ranked.cur <> 'ILS'
  union all
  select 'ILS'::char(3), '1', p_date, 'par', now();
$$;

-- An automatic (non-manual) rate must be exactly one the server published for
-- the stated rate date. Returns that rate's source, or null if there is none.
-- Manual rates are accepted as entered and flagged.
create or replace function public.check_auto_rate(p_currency char(3), p_rate numeric, p_rate_date date)
returns text
language sql stable security definer set search_path = public
as $$
  select r.source from ils_rates(p_rate_date) r
  where p_rate_date is not null and r.currency = p_currency and r.rate::numeric = p_rate and r.rate_date = p_rate_date
  limit 1;
$$;

create or replace function public.validate_expense_rate()
returns trigger language plpgsql as $$
declare
  v_home char(3);
  v_source text;
begin
  select home_currency into v_home from trips where id = new.trip_id;
  if new.currency = v_home then
    new.fx_source := 'par';
    new.fx_is_manual := false;
    return new;
  end if;
  if new.fx_is_manual then
    new.fx_source := 'manual';
    return new;
  end if;
  -- Only re-check when the rate itself changed (editing a description keeps the old rate valid)
  if tg_op = 'UPDATE' and new.fx_rate = old.fx_rate and new.currency = old.currency
     and new.fx_rate_date is not distinct from old.fx_rate_date then
    return new;
  end if;
  v_source := check_auto_rate(new.currency, new.fx_rate, new.fx_rate_date);
  if v_source is null then
    raise exception 'invalid_rate: % at % is not a published rate for %', new.fx_rate, new.fx_rate_date, new.currency;
  end if;
  new.fx_source := v_source;
  return new;
end;
$$;

create trigger expenses_validate_rate before insert or update of fx_rate, currency, fx_rate_date, fx_is_manual
  on public.expenses for each row execute function public.validate_expense_rate();

revoke all on function public.check_auto_rate(char, numeric, date) from public;
