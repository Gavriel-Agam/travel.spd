-- Security hardening from the Supabase advisor:
-- 1. Pin search_path on the remaining functions so they cannot be redirected
--    to look-alike objects in another schema.
-- 2. Signed-out (anon) visitors can no longer call any function through the
--    API. Every RPC already refused them inside the function; now the API
--    refuses before the function runs.
-- 3. Internal helpers (trigger functions, the rate check) are not callable
--    through the API at all.

alter function public.touch_updated_at() set search_path = public;
alter function public.check_split_totals() set search_path = public;
alter function public.allocate_minor(bigint, jsonb) set search_path = public;
alter function public.generate_invite_code() set search_path = public;
alter function public.validate_expense_rate() set search_path = public;

-- App RPCs: signed-in users only
revoke execute on function
  public.create_trip(text, text, date, date, char, text, bigint, bigint, text),
  public.create_invite(uuid),
  public.join_trip(text, text, text),
  public.save_expense(jsonb, int),
  public.delete_expense(uuid, int),
  public.ils_rates(date)
from public, anon;
grant execute on function
  public.create_trip(text, text, date, date, char, text, bigint, bigint, text),
  public.create_invite(uuid),
  public.join_trip(text, text, text),
  public.save_expense(jsonb, int),
  public.delete_expense(uuid, int),
  public.ils_rates(date)
to authenticated;

-- Used inside row-level security policies, so signed-in users keep it
revoke execute on function public.is_trip_member(uuid) from public, anon;
grant execute on function public.is_trip_member(uuid) to authenticated;

-- Internal only: called by triggers or by other functions, never by the app
revoke execute on function
  public.handle_new_user(),
  public.check_auto_rate(char, numeric, date),
  public.validate_expense_rate(),
  public.check_split_totals(),
  public.touch_updated_at(),
  public.allocate_minor(bigint, jsonb),
  public.generate_invite_code(),
  public.save_expense_core(jsonb, int)
from public, anon, authenticated;
