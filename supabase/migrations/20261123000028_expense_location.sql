-- Where an expense was added (for the expense screen's map, and later a trip
-- map): the phone's position when the expense was entered, and a short place
-- name. All optional: no permission, no fix, or the user turned it off in
-- Settings means null. Sent with the expense through save_expense.

alter table public.expenses
  add column if not exists lat double precision check (lat is null or (lat between -90 and 90)),
  add column if not exists lng double precision check (lng is null or (lng between -180 and 180)),
  add column if not exists location_name text check (location_name is null or char_length(location_name) <= 120);

alter table public.expenses drop constraint if exists expenses_location_pair;
alter table public.expenses add constraint expenses_location_pair check ((lat is null) = (lng is null));

-- apply_expense_extras (0024, 0027) also stores the location when it is sent
create or replace function public.apply_expense_extras(p_id uuid, p_expense jsonb)
returns public.expenses
language plpgsql security definer set search_path = public
as $$
declare
  v_row expenses%rowtype;
begin
  if not (p_expense ?| array['source', 'external_id', 'merchant', 'review_status', 'billed_ils_minor', 'booking_details', 'field_sources', 'lat', 'lng', 'location_name']) then
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
    field_sources = case when p_expense ? 'field_sources' then nullif(p_expense -> 'field_sources', 'null'::jsonb) else field_sources end,
    lat = case when p_expense ? 'lat' then (p_expense ->> 'lat')::double precision else lat end,
    lng = case when p_expense ? 'lng' then (p_expense ->> 'lng')::double precision else lng end,
    location_name = case when p_expense ? 'location_name' then nullif(left(trim(p_expense ->> 'location_name'), 120), '') else location_name end
  where id = p_id
  returning * into v_row;
  return v_row;
end;
$$;
revoke all on function public.apply_expense_extras(uuid, jsonb) from public, anon, authenticated;
