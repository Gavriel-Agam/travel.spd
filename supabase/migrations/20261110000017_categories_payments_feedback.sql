-- 0017: categories and payment methods people can shape, and a feedback prompt
-- that opens by itself only once per account.
--
-- 1. Category pictures. A category can show a small uploaded picture instead
--    of its emoji. The app shrinks it to an icon first (128 px) and stores it
--    inline as a data URL, so it shows offline and syncs like the rest of the
--    category. Built-ins get theirs through the trip's override row.
-- 2. Category order per trip (shared by everyone on the trip): ids in the
--    chosen order; categories not in the list follow in their default order.
-- 3. Payment methods: "bit" joins the built-ins, and a trip can keep its own
--    names (e.g. "PayPal"). An expense stores a built-in key or a custom name.
-- 4. The feedback panel opens by itself once per account, on any device. The
--    first claim wins; accounts that existed before this migration already
--    saw it and are marked as asked.

-- 1. Category pictures -------------------------------------------------------
alter table public.expense_categories add column if not exists image text
  check (image is null or (image ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and octet_length(image) <= 150000));
alter table public.category_overrides add column if not exists image text
  check (image is null or (image ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$' and octet_length(image) <= 150000));

-- 2 + 3. Per-trip category order and custom payment methods ------------------
alter table public.trips add column if not exists category_order uuid[]
  check (category_order is null or cardinality(category_order) <= 200);
alter table public.trips add column if not exists payment_methods text[] not null default '{}'
  check (
    cardinality(payment_methods) <= 20
    and array_position(payment_methods, null) is null
    and char_length(array_to_string(payment_methods, '')) <= 20 * 30
  );
grant update (category_order, payment_methods) on public.trips to authenticated;

-- An expense's payment method: a built-in key (cash, card, transfer, bit,
-- other) or one of the trip's own names
alter table public.expenses drop constraint if exists expenses_payment_method_check;
alter table public.expenses add constraint expenses_payment_method_check
  check (payment_method is null or char_length(btrim(payment_method)) between 1 and 30);

-- 4. Feedback prompt, once per account ---------------------------------------
create table if not exists public.feedback_prompts (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  prompted_at timestamptz not null default now()
);
alter table public.feedback_prompts enable row level security;
-- No policies: only the function below touches it
revoke all on public.feedback_prompts from anon, authenticated;

-- Everyone who already has an account has seen the panel by now
insert into public.feedback_prompts (user_id) select id from auth.users on conflict do nothing;

-- True the first time it is called for this account, false ever after
create or replace function public.claim_feedback_prompt()
returns boolean
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    return false;
  end if;
  insert into feedback_prompts (user_id) values (auth.uid()) on conflict do nothing;
  return found;
end;
$$;
revoke all on function public.claim_feedback_prompt() from public, anon;
grant execute on function public.claim_feedback_prompt() to authenticated;
