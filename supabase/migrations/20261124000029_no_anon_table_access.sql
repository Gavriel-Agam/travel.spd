-- Signed-out requests (the public key, no user token) get no access to trip data.
--
-- Every policy on these tables is for "authenticated" only, so the anon grants
-- gave nothing but an empty answer. That empty answer was the problem: when a
-- signed-in phone failed to refresh its login token, its requests went out as
-- anon and the trip list came back empty (not an error), so the app showed the
-- welcome screen as if the trip were gone. Now such a request is refused with
-- "permission denied", which the app treats as a failure and keeps its saved data.
-- (client_errors keeps its insert-only access: sign-in screens log problems.)
revoke all on table
  public.trips,
  public.trip_members,
  public.trip_invites,
  public.expenses,
  public.expense_splits,
  public.expense_categories,
  public.budgets,
  public.profiles,
  public.push_tokens,
  public.currencies,
  public.exchange_rates
from anon;
