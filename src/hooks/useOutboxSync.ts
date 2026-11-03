import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { keys } from '@/api/queries';
import { errorCode, supabase } from '@/lib/supabase';
import { useOutbox } from '@/store/outbox';

/** Browser connectivity (React Query tracks the online/offline events). */
export function useOnline() {
  return useSyncExternalStore(
    (cb) => onlineManager.subscribe(cb),
    () => onlineManager.isOnline(),
    () => true,
  );
}

/**
 * Sends queued offline expenses, oldest first, whenever the device is online:
 * on launch, when the connection returns, when the app comes to the front, and
 * every 20 seconds while anything is waiting. Stops at the first network error.
 */
export function useOutboxSync() {
  const qc = useQueryClient();
  const online = useOnline();
  const waiting = useOutbox((s) => s.items.filter((i) => !i.error).length);
  const running = useRef(false);

  const flush = useCallback(async () => {
    if (running.current || !onlineManager.isOnline()) return;
    running.current = true;
    const touched = new Set<string>();
    try {
      const queue = useOutbox.getState().items.filter((i) => !i.error);
      for (const item of queue) {
        const { error } = await supabase.rpc('save_expense', { p_expense: item.payload, p_expected_version: null });
        if (!error) {
          useOutbox.getState().remove(item.clientId);
          touched.add(item.tripId);
          continue;
        }
        const code = errorCode(error);
        if (code === 'network') break;
        useOutbox.getState().fail(item.clientId, code);
      }
    } finally {
      running.current = false;
      touched.forEach((tripId) => qc.invalidateQueries({ queryKey: keys.expenses(tripId) }));
    }
  }, [qc]);

  useEffect(() => {
    if (online && waiting > 0) flush();
  }, [online, waiting, flush]);

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
