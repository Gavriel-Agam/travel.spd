import { onlineManager, useQueryClient } from '@tanstack/react-query';
import { keys } from '@/api/queries';
import { confirmInput, merchantPattern } from '@/lib/pendingReview';
import { errorCode, supabase } from '@/lib/supabase';
import { useUserId } from '@/providers/AuthProvider';
import { useOutbox } from '@/store/outbox';
import { usePrefs } from '@/store/prefs';
import type { Expense, Member } from '@/types/db';

/** Remembers the category chosen for a merchant (the next payment there gets it). Best effort. */
export function learnMerchantCategory(merchant: string | null | undefined, categoryId: string | null | undefined) {
  const pattern = merchantPattern(merchant);
  if (!pattern || !categoryId || !onlineManager.isOnline()) return;
  void supabase.auth.getUser().then(({ data }) => {
    const uid = data.user?.id;
    if (!uid) return;
    return supabase.from('merchant_category_map').upsert({ user_id: uid, merchant_pattern: pattern, category_id: categoryId }, { onConflict: 'user_id,merchant_pattern' });
  });
}

/**
 * One-tap Approve from Home, with the split last used in this trip (shared
 * unless the last one saved was personal; alone in the trip, personal).
 * Queued while offline.
 */
export function useConfirmPending(tripId: string, members: readonly Member[], meId: string | null) {
  const qc = useQueryClient();
  const userId = useUserId();
  return (e: Expense) => {
    const last = usePrefs.getState().lastSplit[tripId];
    const mode = members.length < 2 || last === 'personal' ? 'personal' : 'shared';
    const input = confirmInput(e, mode, members, meId);
    // Out of the inbox at once
    qc.setQueryData<Expense[]>(keys.expenses(tripId), (list) => list?.map((x) => (x.id === e.id ? { ...x, review_status: 'confirmed' } : x)));
    learnMerchantCategory(e.merchant, e.category_id);
    const queue = () =>
      useOutbox.getState().queueUpdate({ expenseId: e.id, expectedVersion: e.version, tripId, createdBy: userId ?? '', queuedAt: new Date().toISOString(), payload: input });
    if (!onlineManager.isOnline()) return queue();
    supabase
      .rpc('save_expense', { p_expense: { ...input, id: e.id }, p_expected_version: e.version })
      .then(({ error }) => {
        if (error && errorCode(error) === 'network') queue();
      })
      .then(() => qc.invalidateQueries({ queryKey: keys.expenses(tripId) }));
  };
}
