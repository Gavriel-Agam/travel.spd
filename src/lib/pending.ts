// Shows changes queued on this device (offline) together with the saved
// expenses, with the amounts the server will store (same conversion and split
// rules), so lists, totals and balances are right while the phone has no signal.
// - new expenses appear, edits replace the saved version, deletes hide it;
// - a change the server rejected stays visible, marked, so it can be fixed.
import { convertToHomeMinor } from './money';
import { sharesFromEntries, type SplitType } from './split';
import type { SaveExpenseInput } from '@/api/queries';
import type { Expense } from '@/types/db';
import type { CreateItem, OutboxItem, UpdateItem } from '@/store/outbox';

/** The expense as the server will store it, from a queued payload. */
function fromPayload(p: SaveExpenseInput, id: string, item: CreateItem | UpdateItem, base?: Expense): Expense {
  const homeMinor = convertToHomeMinor(p.amount_minor, p.currency, p.fx_rate);
  const shares = sharesFromEntries(p.split_type as SplitType, p.splits, p.paid_by_member_id, homeMinor);
  return {
    id,
    client_id: base?.client_id ?? (item.kind === 'update' ? null : item.clientId),
    trip_id: item.tripId,
    kind: p.kind ?? base?.kind ?? 'expense',
    created_by: base?.created_by ?? item.createdBy,
    updated_by: item.createdBy,
    paid_by_member_id: p.paid_by_member_id,
    amount_minor: p.amount_minor,
    currency: p.currency,
    fx_rate: p.fx_rate,
    fx_source: p.fx_source,
    fx_rate_date: p.fx_rate_date,
    fx_fetched_at: p.fx_fetched_at,
    fx_is_manual: p.fx_is_manual,
    amount_ils_minor: homeMinor,
    category_id: p.category_id,
    description: p.description,
    notes: p.notes,
    occurred_at: p.occurred_at,
    receipt_path: p.receipt_path ?? base?.receipt_path ?? null,
    payment_method: p.payment_method as Expense['payment_method'],
    split_type: p.split_type as SplitType,
    // An edited expense keeps the version it was changed from: a further edit or a delete starts from it too
    version: item.kind === 'update' ? item.expectedVersion : 0,
    created_at: base?.created_at ?? item.queuedAt,
    updated_at: item.queuedAt,
    deleted_at: null,
    expense_splits: shares.map((s) => ({
      expense_id: id,
      member_id: s.memberId,
      weight: '1',
      share_pct: null,
      share_original_minor: null,
      share_ils_minor: s.share,
    })),
    pending: item.error ? 'failed' : 'waiting',
    pending_error: item.error,
    pending_op: item.kind === 'update' ? 'update' : 'create',
  };
}

/** A queued new expense, as it will be saved. */
export function pendingToExpense(item: CreateItem): Expense {
  return fromPayload(item.payload, item.clientId, item);
}

const byNewest = (a: Expense, b: Expense) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0);

/**
 * Saved expenses with this trip's queued changes applied, newest first. A
 * queued new expense the server already has (same client_id) is dropped so it
 * never counts twice.
 */
export function mergePending(saved: Expense[], outbox: OutboxItem[], tripId: string): Expense[] {
  const queue = outbox.filter((i) => i.tripId === tripId);
  if (queue.length === 0) return saved;
  const savedClientIds = new Set(saved.map((e) => e.client_id).filter(Boolean));
  const edits = new Map<string, UpdateItem>();
  const deletes = new Map<string, OutboxItem>();
  const created: Expense[] = [];
  for (const i of queue) {
    if (i.kind === 'update') edits.set(i.expenseId, i);
    else if (i.kind === 'delete') deletes.set(i.expenseId, i);
    else if (!savedClientIds.has(i.clientId)) created.push(pendingToExpense(i));
  }
  const merged: Expense[] = [];
  for (const e of saved) {
    const del = deletes.get(e.id);
    if (del) {
      // Hidden right away; shown again (marked) only if the server refused the delete
      if (del.error) merged.push({ ...e, pending: 'failed', pending_error: del.error, pending_op: 'delete' });
      continue;
    }
    const edit = edits.get(e.id);
    merged.push(edit ? fromPayload(edit.payload, e.id, edit, e) : e);
  }
  return [...created, ...merged].sort(byNewest);
}
