import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeleteExpense } from '@/api/queries';
import { useT } from '@/i18n';
import { blockedInDemo } from '@/lib/demoPrompt';
import { errorCode } from '@/lib/supabase';
import { deleteKey, editKey, useOutbox } from '@/store/outbox';
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

  return { open, edit, remove, removing: del.isPending };
}
