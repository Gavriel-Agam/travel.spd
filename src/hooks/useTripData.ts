import { useMemo } from 'react';
import { useActiveTrip, useBudgets, useCategories, useExpenses, useMembers } from '@/api/queries';
import { budgetStatuses, topAlert } from '@/lib/budget';
import { categoryMap, isSelectable } from '@/lib/categories';
import { computeBalances, settleUp } from '@/lib/settlement';
import { mergePending } from '@/lib/pending';
import { computeTripStats } from '@/lib/stats';
import { useUserId } from '@/providers/AuthProvider';
import { useOutbox } from '@/store/outbox';
import { errorCode } from '@/lib/supabase';

/** Everything a trip screen needs, plus the derived figures. */
export function useTripData() {
  const { trip } = useActiveTrip();
  const userId = useUserId();
  const tripId = trip?.id;
  const members = useMembers(tripId);
  const categories = useCategories(tripId);
  const expenses = useExpenses(tripId);
  const budgets = useBudgets(tripId);
  const outbox = useOutbox((s) => s.items);

  // Saved expenses plus ones queued offline on this device
  const list = useMemo(
    () => (tripId ? mergePending(expenses.data ?? [], outbox, tripId) : []),
    [expenses.data, outbox, tripId],
  );

  const derived = useMemo(() => {
    // Every member ever in the trip: removed partners stay only so old expenses
    // can still show who paid. Everything else (balances, settle-up, budgets,
    // stats, pickers) uses the current partners only.
    const memberList = members.data ?? [];
    const activeIds = new Set(memberList.filter((m) => !m.removed_at).map((m) => m.id));
    const totalBudget = budgets.data?.find((b) => b.scope === 'total')?.amount_ils_minor ?? null;
    const dailyBudget = budgets.data?.find((b) => b.scope === 'daily')?.amount_ils_minor ?? null;
    const stats = trip
      ? computeTripStats({
          expenses: list,
          timeZone: trip.timezone,
          now: new Date(),
          startDate: trip.start_date,
          endDate: trip.end_date,
          totalBudget,
          dailyBudget,
        })
      : null;
    const balances = computeBalances(
      [...activeIds],
      list.map((e) => ({ ...e, splits: e.expense_splits })),
    ).filter((b) => activeIds.has(b.memberId));
    const statuses = trip
      ? budgetStatuses(
          budgets.data ?? [],
          list.map((e) => ({ ...e, splits: e.expense_splits })),
          trip.timezone,
          new Date(),
        ).filter((s) => s.scope !== 'member' || activeIds.has(s.key))
      : [];
    return {
      stats,
      budgetStatuses: statuses,
      topAlert: topAlert(statuses),
      balances,
      transfers: settleUp(balances),
      memberById: new Map(memberList.map((m) => [m.id, m])),
      categoryById: categoryMap(categories.data),
      me: memberList.find((m) => m.user_id === userId && activeIds.has(m.id)) ?? null,
    };
  }, [list, members.data, budgets.data, categories.data, trip, userId]);

  const queries = [members, categories, expenses, budgets];
  return {
    trip,
    // Current partners only (pickers, counts, Settings); memberById also has removed ones
    members: (members.data ?? []).filter((m) => !m.removed_at),
    // Pickers, filters and budgets: only categories still in use; categoryById has all
    categories: (categories.data ?? []).filter(isSelectable),
    allCategories: categories.data ?? [],
    expenses: list,
    budgets: budgets.data ?? [],
    isLoading: queries.some((q) => q.isLoading),
    // Offline with nothing saved on this device for this trip yet (paused, or failed for lack of signal)
    offlineEmpty: queries.some((q) => q.data === undefined && (q.fetchStatus === 'paused' || (!!q.error && errorCode(q.error) === 'network'))),
    // Only a problem when there is nothing to show; offline, the saved copy is used
    error: queries.find((q) => q.error && q.data === undefined && errorCode(q.error) !== 'network')?.error ?? null,
    refetch: async () => {
      await Promise.all(queries.map((q) => q.refetch()));
    },
    isRefetching: queries.some((q) => q.isRefetching),
    ...derived,
  };
}
