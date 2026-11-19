-- Security hardening (0025), from the Supabase security advisor.
--
-- 1. Three internal helpers were still callable by signed-out visitors (anon).
--    They answer only "false" for anon, but nothing outside RLS needs them.
--    guard_private_expense is a trigger function: nobody calls it directly.
-- 2. The API roles had TRUNCATE / TRIGGER / REFERENCES on the app's tables
--    (Supabase's default grants). The API never uses them, and TRUNCATE skips
--    row-level security, so they are removed.

revoke execute on function public.is_private_to_other(uuid) from anon, public;
revoke execute on function public.receipt_private_to_other(text) from anon, public;
revoke execute on function public.guard_private_expense() from anon, authenticated, public;
grant execute on function public.is_private_to_other(uuid) to authenticated;
grant execute on function public.receipt_private_to_other(text) to authenticated;

do $$
declare
  t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('revoke truncate, trigger, references on public.%I from anon, authenticated', t.tablename);
  end loop;
end;
$$;

-- New tables keep getting Supabase's defaults; at least never TRUNCATE
alter default privileges in schema public revoke truncate, trigger, references on tables from anon, authenticated;
