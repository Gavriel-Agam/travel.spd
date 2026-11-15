import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeleteExpense } from '@/api/queries';
import { useT } from '@/i18n';
import { blockedInDemo } from '@/lib/demoPrompt';
import { errorCode } from '@/lib/supabase';
import { inputFromExpense, moveToDay as sameTimeOnDay } from '@/lib/expenseOrder';
import { deleteKey, editKey, useOutbox, type UpdateItem } from '@/store/outbox';
import { onlineManager } from '@tanstack/react-query';
import { useUserId } from '@/providers/AuthProvider';
import type { Expense } from '@/types/db';
import { confirmDialog, showDialog } from '@/ui/Dialog';

/**
 * Open / edit / delete for an expense row, the same on every screen that lists
 * expenses (Home › Recent, Expenses, the expense screen). Delete asks first,
 * removes the row at once (totals and balances follow) and syncs; offline it is
 * queued and sent when the connection returns. A new expense still waiting to
 * sync is just discarded from this phone.
 */
export function useExpenseActions(tripId: string) {
  const { t } = useT();
  const qc = useQueryClient();
  const del = useDeleteExpense(tripId);
  const userId = useUserId();

  const open = (e: Expense) => router.push({ pathname: '/expense/[id]', params: { id: e.id } });

  const edit = (e: Expense) => {
    if (blockedInDemo(qc)) return;
    router.push({ pathname: '/expense/[id]/edit', params: { id: e.id } });
  };

  /** Delete (asks first). `onDone` runs once it's gone from the list (e.g. leave the detail screen). */
  const remove = async (e: Expense, onDone?: () => void) => {
    if (blockedInDemo(qc)) return;
    // A new expense that never reached the server: just drop it from the phone
    if (e.pending_op === 'create') {
      if (await confirmDialog(t('sync.discardConfirm'), t('sync.discardBody'), t('common.delete'), t('common.cancel'), true)) {
        useOutbox.getState().remove(e.id);
        onDone?.();
      }
      return;
    }
    const ok = await confirmDialog(t('expenses.deleteConfirm'), t('expenses.deleteConfirmBody'), t('common.delete'), t('common.cancel'), true);
    if (!ok) return;
    // No signal: hidden now (totals follow), deleted on the server when the connection returns
    const queue = () => {
      useOutbox.getState().queueDelete({ expenseId: e.id, expectedVersion: e.version, tripId: e.trip_id, createdBy: userId ?? '', queuedAt: new Date().toISOString() });
      onDone?.();
    };
    if (!onlineManager.isOnline()) return queue();
    del.mutate(
      { id: e.id, version: e.version },
      {
        onSuccess: () => {
          // Nothing queued for it may be sent later
          useOutbox.getState().remove(editKey(e.id));
          useOutbox.getState().remove(deleteKey(e.id));
          onDone?.();
        },
        onError: (err) => (errorCode(err) === 'network' ? queue() : showDialog(t('errors.title'), t(`errors.${errorCode(err)}`))),
      },
    );
  };

  /**
   * Moves an expense to another day (dragged under that day's heading): same time
   * of day, same amounts and rate. Shows at once and is sent like any edit
   * (queued while offline; a partner's change meanwhile is caught, not overwritten).
   */
  const moveToDay = (e: Expense, day: string, timeZone: string) => {
    if (blockedInDemo(qc) || e.pending_op === 'delete') return;
    const occurred_at = sameTimeOnDay(e.occurred_at, day, timeZone);
    const outbox = useOutbox.getState();
    // A new expense still waiting to be sent: change it in the queue
    if (e.pending_op === 'create') return outbox.patchCreate(e.id, { occurred_at });
    // Already edited on this phone: keep that edit and add the new date to it
    const queued = outbox.items.find((i) => i.clientId === editKey(e.id)) as UpdateItem | undefined;
    const payload = { ...(queued?.payload ?? inputFromExpense(e)), occurred_at };
    outbox.queueUpdate({ expenseId: e.id, expectedVersion: e.version, tripId: e.trip_id, createdBy: userId ?? '', queuedAt: new Date().toISOString(), payload });
  };

  return { open, edit, remove, moveToDay, removing: del.isPending };
}
