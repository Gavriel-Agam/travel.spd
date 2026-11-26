// Home › Pending review ("ממתין לאישור"): payments added by the person's iOS
// Shortcuts wait here for one tap (shared / personal), an edit, or dismissal.
import type { SaveExpenseInput } from '@/api/queries';
import type { Expense, Member } from '@/types/db';
import { inputFromExpense } from './expenseOrder';

/**
 * Waiting for a tap (a Shortcut payment, a voice expense with no payer yet):
 * not in any list, total, budget, balance or statistic until confirmed.
 */
export const isAwaitingReview = (e: Pick<Expense, 'review_status'>) => e.review_status === 'pending_review';

/** Only the expenses that count: everything except the ones waiting for review. */
export function confirmedOnly<T extends Pick<Expense, 'review_status'>>(list: readonly T[]): T[] {
  return list.filter((e) => !isAwaitingReview(e));
}

/** The person's own items waiting for review, newest first. */
export function pendingForMe(expenses: readonly Expense[], userId: string | null | undefined): Expense[] {
  if (!userId) return [];
  return expenses
    .filter((e) => e.review_status === 'pending_review' && e.created_by === userId && !e.deleted_at && e.kind === 'expense')
    .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
}

/** The edit that confirms it: split with everyone (shared) or only the payer (personal). */
export function confirmInput(e: Expense, mode: 'shared' | 'personal', members: readonly Pick<Member, 'id'>[], me: string | null): SaveExpenseInput {
  const payer = e.paid_by_member_id ?? me;
  const base = inputFromExpense(e);
  const personal = mode === 'personal' && payer;
  return {
    ...base,
    paid_by_member_id: e.paid_by_member_id ?? payer,
    split_type: personal ? 'personal' : 'equal',
    splits: personal ? [{ member_id: payer! }] : members.map((m) => ({ member_id: m.id })),
    review_status: 'confirmed',
  };
}

/** The key a merchant's category is learned under (same as the server's normalize_merchant). */
export function merchantPattern(merchant: string | null | undefined): string | null {
  const p = (merchant ?? '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 120);
  return p.length >= 2 ? p : null;
}

/** Another expense with the same amount and currency within 10 minutes: maybe the same payment twice. */
export function nearDuplicateOf(e: Expense, list: readonly Expense[]): Expense | null {
  const t = Date.parse(e.occurred_at);
  return (
    list.find(
      (x) => x.id !== e.id && !x.deleted_at && x.amount_minor === e.amount_minor && x.currency === e.currency && Math.abs(Date.parse(x.occurred_at) - t) <= 10 * 60_000,
    ) ?? null
  );
}
