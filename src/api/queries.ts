import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo } from 'react';
import { registerCurrencies, type Currency } from '@/lib/currencies';
import { supabase } from '@/lib/supabase';
import { usePrefs } from '@/store/prefs';
import type { Budget, Category, Expense, Member, RatesSnapshot, Trip } from '@/types/db';

export const keys = {
  trips: ['trips'] as const,
  members: (t: string) => ['members', t] as const,
  categories: (t: string) => ['categories', t] as const,
  expenses: (t: string) => ['expenses', t] as const,
  budgets: (t: string) => ['budgets', t] as const,
  invite: (t: string) => ['invite', t] as const,
  currencies: ['currencies'] as const,
  rates: (d: string) => ['rates', d] as const,
};

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// ---------------------------------------------------------------- trips

export function useTrips(enabled = true) {
  return useQuery({
    queryKey: keys.trips,
    enabled,
    queryFn: async () => unwrap(await supabase.from('trips').select('*').order('created_at', { ascending: false })) as Trip[],
  });
}

/** The trip the app is showing: the remembered one if still accessible, else the newest. */
export function useActiveTrip() {
  const trips = useTrips();
  const activeId = usePrefs((s) => s.activeTripId);
  const trip = useMemo(() => {
    const list = trips.data ?? [];
    return list.find((t) => t.id === activeId) ?? list[0] ?? null;
  }, [trips.data, activeId]);
  return { ...trips, trip };
}

export function useCreateTrip() {
  const qc = useQueryClient();
  const setActive = usePrefs((s) => s.setActiveTrip);
  return useMutation({
    mutationFn: async (p: {
      name: string;
      memberName: string;
      startDate: string | null;
      endDate: string | null;
      defaultCurrency: string;
      timezone: string;
      totalBudgetMinor: number | null;
      dailyBudgetMinor: number | null;
      color: string;
    }) =>
      unwrap(
        await supabase.rpc('create_trip', {
          p_name: p.name,
          p_member_name: p.memberName,
          p_start_date: p.startDate,
          p_end_date: p.endDate,
          p_default_currency: p.defaultCurrency,
          p_timezone: p.timezone,
          p_total_budget_ils_minor: p.totalBudgetMinor,
          p_daily_budget_ils_minor: p.dailyBudgetMinor,
          p_color: p.color,
        }),
      ) as string,
    onSuccess: async (tripId) => {
      setActive(tripId);
      await qc.invalidateQueries({ queryKey: keys.trips });
    },
  });
}

export function useJoinTrip() {
  const qc = useQueryClient();
  const setActive = usePrefs((s) => s.setActiveTrip);
  return useMutation({
    mutationFn: async (p: { code: string; memberName: string; color: string }) =>
      unwrap(await supabase.rpc('join_trip', { p_code: p.code, p_member_name: p.memberName, p_color: p.color })) as string,
    onSuccess: async (tripId) => {
      setActive(tripId);
      await qc.invalidateQueries({ queryKey: keys.trips });
    },
  });
}

export function useInviteCode(tripId: string | undefined) {
  return useQuery({
    queryKey: keys.invite(tripId ?? ''),
    enabled: !!tripId,
    staleTime: 5 * 60_000,
    queryFn: async () => unwrap(await supabase.rpc('create_invite', { p_trip_id: tripId })) as string,
  });
}

export function useUpdateTrip(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Pick<Trip, 'name' | 'start_date' | 'end_date' | 'default_currency'>>) =>
      unwrap(await supabase.from('trips').update(patch).eq('id', tripId).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.trips }),
  });
}

// ---------------------------------------------------------------- members & categories

export function useMembers(tripId: string | undefined) {
  return useQuery({
    queryKey: keys.members(tripId ?? ''),
    enabled: !!tripId,
    queryFn: async () =>
      unwrap(await supabase.from('trip_members').select('*').eq('trip_id', tripId!).order('joined_at')) as Member[],
  });
}

export function useUpdateMyMember(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { memberId: string; display_name?: string; color?: string }) =>
      unwrap(
        await supabase
          .from('trip_members')
          .update({ display_name: p.display_name, color: p.color })
          .eq('id', p.memberId)
          .select()
          .single(),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.members(tripId) }),
  });
}

export function useCategories(tripId: string | undefined) {
  return useQuery({
    queryKey: keys.categories(tripId ?? ''),
    enabled: !!tripId,
    staleTime: 10 * 60_000,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('expense_categories')
          .select('*')
          .or(`trip_id.is.null,trip_id.eq.${tripId}`)
          .eq('archived', false)
          .order('sort_order')
          .order('created_at'),
      ) as Category[],
  });
}

export function useAddCategory(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { name: string; icon: string; color: string }) =>
      unwrap(
        await supabase
          .from('expense_categories')
          .insert({ trip_id: tripId, name: p.name, icon: p.icon, color: p.color, sort_order: 500 })
          .select()
          .single(),
      ) as Category,
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.categories(tripId) }),
  });
}

export function useArchiveCategory(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) =>
      unwrap(await supabase.from('expense_categories').update({ archived: true }).eq('id', id).select().single()),
    onSuccess: () => qc.invalidateQueries({ queryKey: keys.categories(tripId) }),
  });
}

// ---------------------------------------------------------------- expenses

export function useExpenses(tripId: string | undefined) {
  return useQuery({
    queryKey: keys.expenses(tripId ?? ''),
    enabled: !!tripId,
    queryFn: async () =>
      unwrap(
        await supabase
          .from('expenses')
          .select('*, expense_splits(*)')
          .eq('trip_id', tripId!)
          .is('deleted_at', null)
          .order('occurred_at', { ascending: false }),
      ) as Expense[],
  });
}

export type SaveExpenseInput = {
  id?: string;
  version?: number;
  trip_id: string;
  kind?: 'expense' | 'settlement';
  paid_by_member_id: string;
  amount_minor: number;
  currency: string;
  fx_rate: string;
  fx_source: string;
  fx_rate_date: string | null;
  fx_fetched_at: string | null;
  fx_is_manual: boolean;
  category_id: string | null;
  description: string;
  notes: string | null;
  occurred_at: string;
  receipt_path: string | null;
  payment_method: string | null;
  split_type: string;
  splits: { member_id: string; value?: number }[];
};

export function useSaveExpense(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ version, ...expense }: SaveExpenseInput) =>
      unwrap(await supabase.rpc('save_expense', { p_expense: expense, p_expected_version: version ?? null })) as Expense,
    onSettled: () => qc.invalidateQueries({ queryKey: keys.expenses(tripId) }),
  });
}

export function useDeleteExpense(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { id: string; version: number }) =>
      unwrap(await supabase.rpc('delete_expense', { p_id: p.id, p_expected_version: p.version })),
    onMutate: async (p) => {
      // Remove from the list immediately; restored on error
      await qc.cancelQueries({ queryKey: keys.expenses(tripId) });
      const prev = qc.getQueryData<Expense[]>(keys.expenses(tripId));
      qc.setQueryData<Expense[]>(keys.expenses(tripId), (list) => list?.filter((e) => e.id !== p.id));
      return { prev };
    },
    onError: (_e, _p, ctx) => ctx?.prev && qc.setQueryData(keys.expenses(tripId), ctx.prev),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.expenses(tripId) }),
  });
}

export async function uploadReceipt(tripId: string, uri: string, mime = 'image/jpeg') {
  const ext = mime.split('/')[1] ?? 'jpg';
  const path = `${tripId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const body = await (await fetch(uri)).arrayBuffer();
  unwrap(await supabase.storage.from('receipts').upload(path, body, { contentType: mime }));
  return path;
}

export function useReceiptUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['receipt', path],
    enabled: !!path,
    staleTime: 50 * 60_000,
    queryFn: async () => unwrap(await supabase.storage.from('receipts').createSignedUrl(path!, 3600)).signedUrl,
  });
}

// ---------------------------------------------------------------- budgets

export function useBudgets(tripId: string | undefined) {
  return useQuery({
    queryKey: keys.budgets(tripId ?? ''),
    enabled: !!tripId,
    queryFn: async () => unwrap(await supabase.from('budgets').select('*').eq('trip_id', tripId!)) as Budget[],
  });
}

export function useSetBudget(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (p: { scope: Budget['scope']; amount: number | null; category_id?: string; member_id?: string }) => {
      let q = supabase.from('budgets').select('id').eq('trip_id', tripId).eq('scope', p.scope);
      q = p.category_id ? q.eq('category_id', p.category_id) : q.is('category_id', null);
      q = p.member_id ? q.eq('member_id', p.member_id) : q.is('member_id', null);
      const existing = unwrap(await q.maybeSingle()) as { id: string } | null;
      if (p.amount == null) {
        if (existing) unwrap(await supabase.from('budgets').delete().eq('id', existing.id));
        return;
      }
      if (existing) unwrap(await supabase.from('budgets').update({ amount_ils_minor: p.amount }).eq('id', existing.id));
      else
        unwrap(
          await supabase.from('budgets').insert({
            trip_id: tripId,
            scope: p.scope,
            amount_ils_minor: p.amount,
            category_id: p.category_id ?? null,
            member_id: p.member_id ?? null,
          }),
        );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.budgets(tripId) }),
  });
}

// ---------------------------------------------------------------- currencies & rates

export function useCurrencyList() {
  return useQuery({
    queryKey: keys.currencies,
    staleTime: 24 * 3600_000,
    queryFn: async () => {
      const list = unwrap(await supabase.from('currencies').select('*').order('sort_order')) as Currency[];
      registerCurrencies(list.map((c) => ({ ...c, code: c.code.trim() })));
      return list;
    },
  });
}

/**
 * ILS rates for a date. Network first (via the fx-rates Edge Function), falling
 * back to the device cache so the conversion preview also works offline.
 */
export function useRates(date: string) {
  const cache = usePrefs((s) => s.cacheRates);
  const query = useQuery({
    queryKey: keys.rates(date),
    staleTime: 30 * 60_000,
    retry: 1,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('fx-rates', { body: { date } });
      if (error) throw error;
      return data as RatesSnapshot;
    },
  });
  useEffect(() => {
    if (query.data) cache(query.data);
  }, [query.data, cache]);
  return query;
}

// ---------------------------------------------------------------- realtime

/** Live sync: any change by either partner refreshes the affected lists. */
export function useTripRealtime(tripId: string | undefined) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!tripId) return;
    const filter = `trip_id=eq.${tripId}`;
    const channel = supabase
      .channel(`trip:${tripId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expenses', filter }, () =>
        qc.invalidateQueries({ queryKey: keys.expenses(tripId) }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_members', filter }, () =>
        qc.invalidateQueries({ queryKey: keys.members(tripId) }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'budgets', filter }, () =>
        qc.invalidateQueries({ queryKey: keys.budgets(tripId) }),
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'expense_categories', filter }, () =>
        qc.invalidateQueries({ queryKey: keys.categories(tripId) }),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, () =>
        qc.invalidateQueries({ queryKey: keys.trips }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, qc]);
}
