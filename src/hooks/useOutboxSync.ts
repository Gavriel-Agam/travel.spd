import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { keys } from '@/api/queries';
import { errorCode, supabase } from '@/lib/supabase';
import { useOutbox, useSyncFlash, type OutboxItem } from '@/store/outbox';
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
  const { error } = await supabase.rpc('save_expense', { p_expense: item.payload, p_expected_version: null });
  return error ? errorCode(error) : null;
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
    const touched = new Set<string>();
    try {
      const queue = useOutbox.getState().items.filter((i) => !i.error);
      for (const item of queue) {
        const code = await send(item);
        if (code === null) {
          useOutbox.getState().remove(item.clientId);
          touched.add(item.tripId);
          continue;
        }
        if (code === 'network') break;
        useOutbox.getState().fail(item.clientId, code);
        touched.add(item.tripId);
      }
    } finally {
      running.current = false;
      await Promise.all([...touched].map((tripId) => qc.invalidateQueries({ queryKey: keys.expenses(tripId) })));
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
