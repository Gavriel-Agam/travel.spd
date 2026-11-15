import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { keys } from '@/api/queries';
import { logError } from '@/lib/log';
import {
  applyBudgetChanges,
  applyCategoryChanges,
  applyMemberChanges,
  applyTripChanges,
  isExpenseItem,
} from '@/lib/pendingChanges';
import { errorCode, supabase } from '@/lib/supabase';
import { useOutbox, useSyncFlash, type ChangeItem, type CreateItem, type OutboxItem } from '@/store/outbox';
import type { Budget, Category, Member, Trip } from '@/types/db';
import { useIsDemo } from '@/store/prefs';

/** Browser connectivity (React Query tracks the online/offline events). */
export function useOnline() {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/** Sends one queued change; resolves to an error code, or null when the server has it. */
async function send(item: OutboxItem): Promise<string | null> {
  if (item.kind === 'delete') {
    const { error } = await supabase.rpc('delete_expense', { p_id: item.expenseId, p_expected_version: item.expectedVersion });
    if (!error) return null;
    const code = errorCode(error);
    // Already gone (deleted on the other phone): nothing left to do
    return code === 'not_found' ? null : code;
  }
  if (item.kind === 'update') {
    const { version: _v, ...payload } = item.payload;
    const { error } = await supabase.rpc('save_expense', { p_expense: { ...payload, id: item.expenseId }, p_expected_version: item.expectedVersion });
    return error ? errorCode(error) : null;
  }
  if (!isExpenseItem(item)) return sendChange(item as ChangeItem);
  const { error } = await supabase.rpc('save_expense', { p_expense: (item as CreateItem).payload, p_expected_version: null });
  return error ? errorCode(error) : null;
}

/** Sends a queued change to the trip's settings (see lib/pendingChanges). */
async function sendChange(item: ChangeItem): Promise<string | null> {
  const fail = (error: unknown) => (error ? errorCode(error) : null);
  switch (item.kind) {
    case 'trip':
      return fail((await supabase.from('trips').update(item.patch).eq('id', item.tripId).select('id').single()).error);
    case 'member':
      return fail((await supabase.from('trip_members').update(item.patch).eq('id', item.memberId).select('id').single()).error);
    case 'category':
      // Added offline: created with the id the screens already use (sending it again is harmless)
      if (item.create)
        return fail(
          (await supabase.from('expense_categories').upsert({ id: item.categoryId, trip_id: item.tripId, sort_order: 500, ...item.fields }, { onConflict: 'id' })).error,
        );
      return fail((await supabase.from('expense_categories').update(item.fields).eq('id', item.categoryId).select('id').single()).error);
    case 'override': {
      if (item.reset) {
        const { error } = await supabase.from('category_overrides').delete().eq('trip_id', item.tripId).eq('category_id', item.categoryId);
        if (error) return errorCode(error);
      }
      if (!Object.keys(item.fields).length) return null;
      return fail((await supabase.from('category_overrides').upsert({ trip_id: item.tripId, category_id: item.categoryId, ...item.fields })).error);
    }
    case 'budget': {
      let q = supabase.from('budgets').select('id').eq('trip_id', item.tripId).eq('scope', item.scope);
      q = item.categoryId ? q.eq('category_id', item.categoryId) : q.is('category_id', null);
      q = item.memberId ? q.eq('member_id', item.memberId) : q.is('member_id', null);
      const found = await q.maybeSingle();
      if (found.error) return errorCode(found.error);
      const existing = found.data as { id: string } | null;
      if (item.amount == null) return existing ? fail((await supabase.from('budgets').delete().eq('id', existing.id)).error) : null;
      if (existing) return fail((await supabase.from('budgets').update({ amount_ils_minor: item.amount }).eq('id', existing.id)).error);
      return fail(
        (
          await supabase
            .from('budgets')
            .insert({ trip_id: item.tripId, scope: item.scope, amount_ils_minor: item.amount, category_id: item.categoryId, member_id: item.memberId })
        ).error,
      );
    }
  }
}

/** Once the server has a settings change: put it into the saved copy too, so the screen doesn't flick back until the next reload. */
function keepInCache(qc: ReturnType<typeof useQueryClient>, item: ChangeItem) {
  if (item.kind === 'trip') qc.setQueryData<Trip[]>(keys.trips, (list) => list && applyTripChanges(list, [item]));
  else if (item.kind === 'member') qc.setQueryData<Member[]>(keys.members(item.tripId), (list) => list && applyMemberChanges(list, [item]));
  else if (item.kind === 'budget') qc.setQueryData<Budget[]>(keys.budgets(item.tripId), (list) => list && applyBudgetChanges(list, [item], item.tripId));
  else qc.setQueryData<Category[]>(keys.categories(item.tripId), (list) => list && applyCategoryChanges(list, [item], item.tripId));
}

/** What to reload after a sync, by the kinds of change sent. */
function keysFor(item: OutboxItem) {
  if (isExpenseItem(item)) return [keys.expenses(item.tripId)];
  if (item.kind === 'trip') return [keys.trips];
  if (item.kind === 'member') return [keys.members(item.tripId)];
  if (item.kind === 'budget') return [keys.budgets(item.tripId)];
  return [keys.categories(item.tripId)];
}

/**
 * Sends queued offline changes (new expenses, edits, deletes), oldest first,
 * whenever the server is reachable: on launch, when the connection returns,
 * when the app comes to the front, and every 20 seconds while anything is
 * waiting. Stops at the first network error. A change the server refuses
 * (e.g. the partner edited the same expense meanwhile) is kept, marked, for
 * the user to look at. After a sync, the trip's data is reloaded and
 * "all synced" shows briefly.
 */
export function useOutboxSync() {
  const qc = useQueryClient();
  const online = useOnline();
  const demo = useIsDemo();
  const waiting = useOutbox((s) => (demo ? 0 : s.items.filter((i) => !i.error).length));
  const running = useRef(false);

  const flush = useCallback(async () => {
    if (running.current || !onlineManager.isOnline()) return;
    running.current = true;
    // Query keys to reload afterwards (one entry per key)
    const touched = new Map<string, readonly unknown[]>();
    const touch = (item: OutboxItem) => keysFor(item).forEach((k) => touched.set(JSON.stringify(k), k));
    try {
      const queue = useOutbox.getState().items.filter((i) => !i.error);
      for (const item of queue) {
        const code = await send(item);
        if (code === 'network') break;
        touch(item);
        if (code === null) {
          if (!isExpenseItem(item)) keepInCache(qc, item as ChangeItem);
          // Only if it wasn't changed again while it was being sent (that change still has to go)
          useOutbox.getState().remove(item.clientId, item.queuedAt);
          continue;
        }
        if (isExpenseItem(item)) useOutbox.getState().fail(item.clientId, code);
        else {
          // A settings change the server refuses (the trip was deleted, or you were removed
          // from it) can't be fixed by hand: drop it; the reload shows what the trip has
          logError(new Error(code), 'outbox.change', { kind: item.kind });
          useOutbox.getState().remove(item.clientId, item.queuedAt);
        }
      }
    } finally {
      running.current = false;
      await Promise.all([...touched.values()].map((queryKey) => qc.invalidateQueries({ queryKey })));
      if (touched.size && useOutbox.getState().items.length === 0) useSyncFlash.getState().flash();
    }
  }, [qc]);

  useEffect(() => {
    if (online && waiting > 0) flush();
  }, [online, waiting, flush]);

  // Back online after being offline: send the queue, reload what's on screen,
  // then say "all synced" for a moment
  const wasOffline = useRef(!onlineManager.isOnline());
  useEffect(() => {
    if (demo) return;
    if (!online) {
      wasOffline.current = true;
      return;
    }
    if (!wasOffline.current) return;
    wasOffline.current = false;
    (async () => {
      await flush();
      await qc.refetchQueries({ type: 'active' }, { cancelRefetch: false }).catch(() => {});
      const left = useOutbox.getState().items.filter((i) => !i.error).length;
      if (onlineManager.isOnline() && left === 0) useSyncFlash.getState().flash();
    })();
  }, [online, demo, flush, qc]);

  useEffect(() => {
    if (waiting === 0) return;
    const timer = setInterval(flush, 20_000);
    const sub = AppState.addEventListener('change', (s) => s === 'active' && flush());
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [waiting, flush]);
}
