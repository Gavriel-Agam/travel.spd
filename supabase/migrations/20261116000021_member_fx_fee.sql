-- Card foreign-transaction fee per person (0021).
--
-- Each trip member has their own card, so the fee (%) is kept on their
-- trip_members row and each person sets their own (members_update_self policy).
-- An expense paid by card in a foreign currency adds the payer's fee. Members
-- start with the fee the trip had (0019's trips.card_fx_fee_pct), which stays
-- as a fallback for older app versions.

alter table public.trip_members
  add column if not exists card_fx_fee_pct numeric(5,3) check (card_fx_fee_pct >= 0 and card_fx_fee_pct <= 10);

update public.trip_members m
set card_fx_fee_pct = t.card_fx_fee_pct
from public.trips t
where t.id = m.trip_id and t.card_fx_fee_pct is not null and m.card_fx_fee_pct is null;

grant update (card_fx_fee_pct) on public.trip_members to authenticated;
