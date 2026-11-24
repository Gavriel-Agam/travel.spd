import { useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

/** A pull never spins longer than this; whatever is still loading carries on quietly. */
const MAX_WAIT_MS = 8000;

/**
 * Pull to refresh: reloads everything on screen from the server (changes made
 * offline are sent by the outbox on their own). Rejects when the trip's data
 * could not be reloaded, so the header can say so.
 */
export function useRefreshAll() {
  const qc = useQueryClient();
  return useCallback(async () => {
    const at = Date.now();
    await Promise.race([qc.refetchQueries({ type: 'active', predicate: (q) => q.queryKey[0] !== 'rates' }), new Promise((r) => setTimeout(r, MAX_WAIT_MS))]);
    // Only the trip's own data counts (a side lookup such as exchange rates may fail on its own)
    const failed = qc
      .getQueryCache()
      .findAll({ type: 'active' })
      .some((q) => q.state.status === 'error' && q.state.errorUpdatedAt >= at && q.queryKey[0] !== 'rates');
    if (failed) throw new Error('refresh_failed');
  }, [qc]);
}
