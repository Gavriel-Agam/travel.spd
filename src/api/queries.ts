import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { registerCurrencies, type Currency } from '@/lib/currencies';
import { mergeCategories } from '@/lib/categories';
import { displayMemberName, displayTripName } from '@/lib/defaultNames';
import { supabase } from '@/lib/supabase';
import { useIsDemo, usePrefs } from '@/store/prefs';
import type { Budget, Category, CategoryOverride, Expense, Member, RatesSnapshot, Trip } from '@/types/db';

export const keys = {
  trips: ['trips'] as const,
  members: (t: string) => ['members', t] as const,
  categories: (t: string) => ['categories', t] as const,
  expenses: (t: string) => ['expenses', t] as const,
  budgets: (t: string) => ['budgets', t] as const,
  invite: (t: string) => ['invite', t] as const,
  currencies: ['currencies'] as const,
  rates: (d: string) => ['rates', d] as const,
  userPrefs: ['user-preferences'] as const,
};

function unwrap<T>({ data, error }: { data: T | null; error: unknown }): T {
  if (error) throw error;
  return data as T;
}

// ---------------------------------------------------------------- trips

export function useTrips(enabled = true) {
  const demo = useIsDemo();
  const { t, i18n } = useTranslation();
  // Re-created when the language changes so placeholder names follow it
  const select = useCallback((list: Trip[]) => list.map((tr) => ({ ...tr, name: displayTripName(tr.name, t) })), [t, i18n.language]);
  return useQuery({
    queryKey: keys.trips,
    enabled: enabled && !demo,
    queryFn: async () => unwrap(await supabase.from('trips').select('*').order('created_at', { ascending: false })) as Trip[],
    select,
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
  const demo = useIsDemo();
  return useQuery({
    queryKey: keys.invite(tripId ?? ''),
    enabled: !!tripId && !demo,
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
  const demo = useIsDemo();
  const { t, i18n } = useTranslation();
  const select = useCallback(
    (list: Member[]) => list.map((m) => ({ ...m, display_name: displayMemberName(m.display_name, t) })),
    [t, i18n.language],
  );
  return useQuery({
    queryKey: keys.members(tripId ?? ''),
    enabled: !!tripId && !demo,
    queryFn: async () =>
      unwrap(await supabase.from('trip_members').select('*').eq('trip_id', tripId!).order('joined_at')) as Member[],
    select,
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
  const demo = useIsDemo();
  return useQuery({
    queryKey: keys.categories(tripId ?? ''),
    enabled: !!tripId && !demo,
    staleTime: 10 * 60_000,
    // All categories, including hidden and deleted ones, so past expenses still
    // show theirs; pickers filter with isSelectable
    queryFn: async () => {
      const [cats, overrides] = await Promise.all([
        supabase.from('expense_categories').select('*').or(`trip_id.is.null,trip_id.eq.${tripId}`).order('sort_order').order('created_at'),
        supabase.from('category_overrides').select('*').eq('trip_id', tripId!),
      ]);
      return mergeCategories(unwrap(cats) as Category[], unwrap(overrides) as CategoryOverride[]);
    },
  });
}

/** Edit a category: custom ones in place, built-ins through this trip's override. */
export function useUpdateCategory(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['update_category'],
    mutationFn: async (p: { category: Category; name: string; icon: string; color: string }) => {
      if (p.category.trip_id) {
        unwrap(await supabase.from('expense_categories').update({ name: p.name, icon: p.icon, color: p.color }).eq('id', p.category.id).select().single());
        return;
      }
      unwrap(
        await supabase
          .from('category_overrides')
          .upsert({ trip_id: tripId, category_id: p.category.id, name: p.name, icon: p.icon, color: p.color, hidden: false }),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.categories(tripId) }),
  });
}

/** Hide (built-in) or delete (custom) a category, or bring it back. Past expenses are unaffected. */
export function useSetCategoryHidden(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['hide_category'],
    mutationFn: async (p: { category: Category; hidden: boolean }) => {
      if (p.category.trip_id) {
        unwrap(await supabase.from('expense_categories').update({ archived: p.hidden }).eq('id', p.category.id).select().single());
        return;
      }
      unwrap(await supabase.from('category_overrides').upsert({ trip_id: tripId, category_id: p.category.id, hidden: p.hidden }));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.categories(tripId) }),
  });
}

/** Undo all of this trip's edits to a built-in category. */
export function useResetCategory(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationKey: ['reset_category'],
    mutationFn: async (categoryId: string) =>
      unwrap(await supabase.from('category_overrides').delete().eq('trip_id', tripId).eq('category_id', categoryId)),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.categories(tripId) }),
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

// ---------------------------------------------------------------- expenses

export function useExpenses(tripId: string | undefined) {
  const demo = useIsDemo();
  return useQuery({
    queryKey: keys.expenses(tripId ?? ''),
    enabled: !!tripId && !demo,
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
  /** Set on new expenses; lets an offline retry return the saved row instead of duplicating it. */
  client_id?: string;
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
    // Fail fast when offline so the form can queue the expense instead of waiting
    networkMode: 'always',
    mutationFn: async ({ version, ...expense }: SaveExpenseInput) =>
      unwrap(await supabase.rpc('save_expense', { p_expense: expense, p_expected_version: version ?? null })) as Expense,
    onSettled: () => qc.invalidateQueries({ queryKey: keys.expenses(tripId) }),
  });
}

export function useDeleteExpense(tripId: string) {
  const qc = useQueryClient();
  return useMutation({
    networkMode: 'always',
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
  const demo = useIsDemo();
  return useQuery({
    queryKey: ['receipt', path],
    enabled: !!path && !demo,
    staleTime: 50 * 60_000,
    queryFn: async () => unwrap(await supabase.storage.from('receipts').createSignedUrl(path!, 3600)).signedUrl,
  });
}

// ---------------------------------------------------------------- budgets

export function useBudgets(tripId: string | undefined) {
  const demo = useIsDemo();
  return useQuery({
    queryKey: keys.budgets(tripId ?? ''),
    enabled: !!tripId && !demo,
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
  const demo = useIsDemo();
  return useQuery({
    queryKey: keys.currencies,
    enabled: !demo,
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
  const demo = useIsDemo();
  const cache = usePrefs((s) => s.cacheRates);
  const query = useQuery({
    queryKey: keys.rates(date),
    enabled: !demo,
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
  const demo = useIsDemo();
  useEffect(() => {
    if (!tripId || demo) return;
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'category_overrides', filter }, () =>
        qc.invalidateQueries({ queryKey: keys.categories(tripId) }),
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` }, () =>
        qc.invalidateQueries({ queryKey: keys.trips }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId, qc, demo]);
}

// ---------------------------------------------------------------- personal preferences

/**
 * Order of the Home cards. Kept on the device for instant display and, for a
 * signed-in user, also in user_preferences so it follows them to every device.
 */
export function useHomeLayout(signedIn: boolean) {
  const demo = useIsDemo();
  const local = usePrefs((s) => s.homeOrder);
  const setLocal = usePrefs((s) => s.setHomeOrder);
  const qc = useQueryClient();
  const remote = useQuery({
    queryKey: keys.userPrefs,
    enabled: signedIn && !demo,
    staleTime: 5 * 60_000,
    queryFn: async () =>
      unwrap(await supabase.from('user_preferences').select('home_layout').maybeSingle()) as { home_layout: string[] | null } | null,
  });

  // The saved order from the account wins over this device's copy
  const remoteLayout = remote.data?.home_layout ?? null;
  useEffect(() => {
    if (remoteLayout && remoteLayout.join('|') !== (usePrefs.getState().homeOrder ?? []).join('|')) setLocal(remoteLayout);
  }, [remoteLayout?.join('|')]);

  const save = useMutation({
    mutationKey: ['home_layout'],
    mutationFn: async (layout: string[] | null) =>
      unwrap(
        await supabase
          .from('user_preferences')
          .upsert({ home_layout: layout, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
          .select('home_layout')
          .single(),
      ),
    onSuccess: (row) => qc.setQueryData(keys.userPrefs, row),
  });

  const setOrder = useCallback(
    (layout: string[] | null) => {
      setLocal(layout);
      if (signedIn && !usePrefs.getState().demo) save.mutate(layout);
    },
    [signedIn, save.mutate],
  );

  return { order: local, setOrder };
}
