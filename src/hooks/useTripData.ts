import { useMemo } from 'react';
import { useActiveTrip, useBudgets, useCategories, useExpenses, useMembers } from '@/api/queries';
import { budgetStatuses, topAlert } from '@/lib/budget';
import { categoryMap } from '@/lib/categories';
import { computeBalances, settleUp } from '@/lib/settlement';
import { computeTripStats } from '@/lib/stats';
import { useUserId } from '@/providers/AuthProvider';

/** Everything a trip screen needs, plus the derived figures. */
export function useTripData() {
  const { trip } = useActiveTrip();
  const userId = useUserId();
  const tripId = trip?.id;
  const members = useMembers(tripId);
  const categories = useCategories(tripId);
  const expenses = useExpenses(tripId);
  const budgets = useBudgets(tripId);

  const derived = useMemo(() => {
    const list = expenses.data ?? [];
    const memberList = members.data ?? [];
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
      memberList.map((m) => m.id),
      list.map((e) => ({ ...e, splits: e.expense_splits })),
    );
    const statuses = trip
      ? budgetStatuses(
          budgets.data ?? [],
          list.map((e) => ({ ...e, splits: e.expense_splits })),
          trip.timezone,
          new Date(),
        )
      : [];
    return {
      stats,
      budgetStatuses: statuses,
      topAlert: topAlert(statuses),
      balances,
      transfers: settleUp(balances),
      memberById: new Map(memberList.map((m) => [m.id, m])),
      categoryById: categoryMap(categories.data),
      me: memberList.find((m) => m.user_id === userId) ?? null,
    };
  }, [expenses.data, members.data, budgets.data, categories.data, trip, userId]);

  const queries = [members, categories, expenses, budgets];
  return {
    trip,
    members: members.data ?? [],
    categories: categories.data ?? [],
    expenses: expenses.data ?? [],
    budgets: budgets.data ?? [],
    isLoading: queries.some((q) => q.isLoading),
    error: queries.find((q) => q.error)?.error ?? null,
    refetch: async () => {
      await Promise.all(queries.map((q) => q.refetch()));
    },
    isRefetching: queries.some((q) => q.isRefetching),
    ...derived,
  };
}
