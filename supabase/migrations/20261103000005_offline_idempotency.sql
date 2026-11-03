-- Offline support: expenses created on a phone without signal are queued and
-- retried. Each carries a client-generated id, so a retry after a lost
-- response returns the expense already saved instead of creating a duplicate.

alter table public.expenses add column client_id uuid;
create unique index expenses_client_id_idx on public.expenses (client_id) where client_id is not null;

alter function public.save_expense(jsonb, int) rename to save_expense_core;
revoke all on function public.save_expense_core(jsonb, int) from public, anon, authenticated;

create or replace function public.save_expense(p_expense jsonb, p_expected_version int default null)
returns public.expenses
language plpgsql security definer set search_path = public
as $$
declare
  v_client uuid := (p_expense ->> 'client_id')::uuid;
  v_row expenses%rowtype;
begin
  -- Updates and expenses without a client id behave exactly as before
  if p_expense ->> 'id' is not null or v_client is null then
    return save_expense_core(p_expense, p_expected_version);
  end if;

  -- A retry of something already saved: return it
  select * into v_row from expenses where client_id = v_client;
  if found then
    if not is_trip_member(v_row.trip_id) then raise exception 'forbidden'; end if;
    return v_row;
  end if;

  begin
    v_row := save_expense_core(p_expense, null);
    update expenses set client_id = v_client where id = v_row.id returning * into v_row;
  exception when unique_violation then
    -- Two retries raced; the other one won. Its insert is the only one kept.
    select * into v_row from expenses where client_id = v_client;
    if not is_trip_member(v_row.trip_id) then raise exception 'forbidden'; end if;
  end;
  return v_row;
end;
$$;

grant execute on function public.save_expense(jsonb, int) to authenticated;
