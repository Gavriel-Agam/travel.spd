// Shows queued offline expenses alongside saved ones, with the amounts the
// server will store (same conversion and split rules), so totals stay right
// while the phone has no signal.
import { convertToHomeMinor } from './money';
import { sharesFromEntries, type SplitType } from './split';
import type { Expense } from '@/types/db';
import type { OutboxItem } from '@/store/outbox';

export function pendingToExpense(item: OutboxItem): Expense {
  const p = item.payload;
  const homeMinor = convertToHomeMinor(p.amount_minor, p.currency, p.fx_rate);
  const shares = sharesFromEntries(p.split_type as SplitType, p.splits, p.paid_by_member_id, homeMinor);
  return {
    id: item.clientId,
    client_id: item.clientId,
    trip_id: item.tripId,
    kind: p.kind ?? 'expense',
    created_by: item.createdBy,
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
    receipt_path: null,
    payment_method: p.payment_method as Expense['payment_method'],
    split_type: p.split_type as SplitType,
    version: 0,
    created_at: item.queuedAt,
    updated_at: item.queuedAt,
    deleted_at: null,
    expense_splits: shares.map((s) => ({
      expense_id: item.clientId,
      member_id: s.memberId,
      weight: '1',
      share_pct: null,
      share_original_minor: null,
      share_ils_minor: s.share,
    })),
    pending: item.error ? 'failed' : 'waiting',
    pending_error: item.error,
  };
}

/**
 * Saved expenses plus this trip's queued ones, newest first. A queued item the
 * server already has (same client_id) is dropped so it never counts twice.
 */
export function mergePending(saved: Expense[], outbox: OutboxItem[], tripId: string): Expense[] {
  const savedClientIds = new Set(saved.map((e) => e.client_id).filter(Boolean));
  const pending = outbox.filter((i) => i.tripId === tripId && !savedClientIds.has(i.clientId)).map(pendingToExpense);
  if (pending.length === 0) return saved;
  return [...pending, ...saved].sort((a, b) => (a.occurred_at < b.occurred_at ? 1 : a.occurred_at > b.occurred_at ? -1 : 0));
}
