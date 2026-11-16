-- Private personal expenses.
--
-- A personal expense that its owner paid for themself (split 'personal', the
-- one share is the payer's) involves nobody else: no debt, no settle-up. Only
-- the owner can read it; other trip members don't see it, its shares, or count
-- it in their totals. A personal expense paid by someone else stays visible to
-- everyone on the trip, since it is a debt between two members.
--
-- Writes go through the security definer RPCs (save_expense, delete_expense);
-- a trigger stops another member from changing or deleting a private expense.

create or replace function public.is_private_to_other(p_expense_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from expenses e
    join trip_members m on m.id = e.paid_by_member_id
    where e.id = p_expense_id
      and e.kind = 'expense'
      and e.split_type = 'personal'
      and m.user_id <> auth.uid()
      and not exists (select 1 from expense_splits s where s.expense_id = e.id and s.member_id <> e.paid_by_member_id)
  )
$$;
revoke all on function public.is_private_to_other(uuid) from public;
grant execute on function public.is_private_to_other(uuid) to authenticated;

drop policy if exists expenses_read on public.expenses;
create policy expenses_read on public.expenses for select to authenticated
  using (public.is_trip_member(trip_id) and not public.is_private_to_other(id));

drop policy if exists splits_read on public.expense_splits;
create policy splits_read on public.expense_splits for select to authenticated using (
  exists (select 1 from public.expenses e where e.id = expense_id and public.is_trip_member(e.trip_id))
  and not public.is_private_to_other(expense_id)
);

-- Another member can't edit or delete someone's private expense (the RPCs
-- answer not_found, as for an expense that doesn't exist). Edits and deletes
-- always bump the version; bookkeeping updates (client id, account transfer)
-- don't, and pass.
create or replace function public.guard_private_expense()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if auth.uid() is not null and new.version is distinct from old.version and public.is_private_to_other(old.id) then
    raise exception 'not_found';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_private_expense() from public;

drop trigger if exists expenses_guard_private on public.expenses;
create trigger expenses_guard_private
  before update on public.expenses
  for each row execute function public.guard_private_expense();

-- The receipt photo of a private expense is private too (receipts/<trip>/<file>)
create or replace function public.receipt_private_to_other(p_path text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (select 1 from expenses e where e.receipt_path = p_path and public.is_private_to_other(e.id))
$$;
revoke all on function public.receipt_private_to_other(text) from public;
grant execute on function public.receipt_private_to_other(text) to authenticated;

drop policy if exists receipts_read on storage.objects;
create policy receipts_read on storage.objects for select to authenticated
  using (bucket_id = 'receipts' and public.is_trip_member(((storage.foldername(name))[1])::uuid)
    and not public.receipt_private_to_other(name));

drop policy if exists receipts_delete on storage.objects;
create policy receipts_delete on storage.objects for delete to authenticated
  using (bucket_id = 'receipts' and public.is_trip_member(((storage.foldername(name))[1])::uuid)
    and not public.receipt_private_to_other(name));
