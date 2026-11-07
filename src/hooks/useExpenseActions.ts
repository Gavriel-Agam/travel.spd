import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useDeleteExpense } from '@/api/queries';
import { useT } from '@/i18n';
import { blockedInDemo } from '@/lib/demoPrompt';
import { errorCode } from '@/lib/supabase';
import { useOutbox } from '@/store/outbox';
import type { Expense } from '@/types/db';
import { confirmDialog, showDialog } from '@/ui/Dialog';

/**
 * Open / edit / delete for an expense row, the same on every screen that lists
 * expenses (Home › Recent, Expenses). Delete asks first, removes the row at once
 * (totals and balances follow) and syncs; an expense still waiting to sync is
 * just discarded from this phone.
 */
export function useExpenseActions(tripId: string) {
  const { t } = useT();
  const qc = useQueryClient();
  const del = useDeleteExpense(tripId);

  const open = (e: Expense) => router.push({ pathname: '/expense/[id]', params: { id: e.id } });

  const edit = (e: Expense) => {
    if (blockedInDemo(qc)) return;
    router.push({ pathname: '/expense/[id]/edit', params: { id: e.id } });
  };

  const remove = async (e: Expense) => {
    if (blockedInDemo(qc)) return;
    if (e.pending) {
      if (await confirmDialog(t('sync.discardConfirm'), t('sync.discardBody'), t('common.delete'), t('common.cancel'), true)) {
        useOutbox.getState().remove(e.id);
      }
      return;
    }
    const ok = await confirmDialog(t('expenses.deleteConfirm'), t('expenses.deleteConfirmBody'), t('common.delete'), t('common.cancel'), true);
    if (!ok) return;
    del.mutate({ id: e.id, version: e.version }, { onError: (err) => showDialog(t('errors.title'), t(`errors.${errorCode(err)}`)) });
  };

  return { open, edit, remove };
}
