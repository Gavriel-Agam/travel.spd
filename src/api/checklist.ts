import { useQuery } from '@tanstack/react-query';
import * as Crypto from 'expo-crypto';
import { useCallback, useMemo } from 'react';
import { applyChecklistChanges, cleanTitle, nextSortOrder } from '@/lib/checklist';
import { checklistChangeKey } from '@/lib/pendingChanges';
import { supabase } from '@/lib/supabase';
import { useOutbox, type ChecklistChange } from '@/store/outbox';
import { useIsDemo, usePrefs } from '@/store/prefs';
import type { ChecklistItem, ChecklistList } from '@/types/db';
import { keys } from './queries';

/**
 * The trip's checklist items the signed-in person can see (both shared lists
 * and their own "brought" list; the server leaves out other people's), with
 * the changes queued on this device on top. Kept in the saved copy, so it
 * shows offline.
 */
export function useChecklist(tripId: string | undefined) {
  const demo = useIsDemo();
  const changes = useOutbox((s) => s.items);
  const select = useCallback((list: ChecklistItem[]) => applyChecklistChanges(list, changes, tripId ?? ''), [changes, tripId]);
  return useQuery({
    select,
    queryKey: keys.checklist(tripId ?? ''),
    enabled: !!tripId && !demo,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trip_checklist_items')
        .select('*')
        .eq('trip_id', tripId!)
        .order('sort_order')
        .order('created_at');
      if (error) throw error;
      return data as ChecklistItem[];
    },
  });
}

/**
 * Add, tick, rename and remove checklist items. Each shows at once and is
 * queued in the outbox, sent now or when there is a connection. Returns false
 * in the guest demo (nothing is saved there; callers show the sign-up prompt).
 */
export function useChecklistActions(tripId: string | undefined, userId: string | undefined) {
  return useMemo(() => {
    const queue = (c: Omit<ChecklistChange, 'kind' | 'clientId' | 'tripId' | 'createdBy' | 'queuedAt' | 'userId'>) => {
      if (!tripId || !userId || usePrefs.getState().demo) return false;
      useOutbox.getState().queueChange({
        ...c,
        kind: 'checklist',
        clientId: checklistChangeKey(c.itemId),
        tripId,
        userId,
        createdBy: userId,
        queuedAt: new Date().toISOString(),
      });
      return true;
    };
    const edit = (item: ChecklistItem, fields: ChecklistChange['fields']) =>
      queue({ itemId: item.id, listType: item.list_type, create: false, remove: false, fields });
    return {
      add: (list: ChecklistList, text: string, all: ChecklistItem[]) => {
        const title = cleanTitle(text);
        if (!title) return false;
        return queue({ itemId: Crypto.randomUUID(), listType: list, create: true, remove: false, fields: { title, is_checked: false, sort_order: nextSortOrder(all, list) } });
      },
      toggle: (item: ChecklistItem) => edit(item, { is_checked: !item.is_checked }),
      rename: (item: ChecklistItem, text: string) => {
        const title = cleanTitle(text);
        return title ? edit(item, { title }) : false;
      },
      remove: (item: ChecklistItem) => queue({ itemId: item.id, listType: item.list_type, create: false, remove: true, fields: {} }),
    };
  }, [tripId, userId]);
}
