import { describe, expect, it } from 'vitest';
import { confirmedOnly, isAwaitingReview, pendingForMe } from '../pendingReview';
import { computeTripStats } from '../stats';
import type { Expense } from '@/types/db';

const ex = (id: string, ils: number, review?: 'pending_review' | 'confirmed'): Expense =>
  ({
    id,
    trip_id: 't',
    kind: 'expense',
    created_by: 'u',
    paid_by_member_id: 'm',
    amount_minor: ils,
    currency: 'ILS',
    amount_ils_minor: ils,
    occurred_at: '2026-11-20T10:00:00Z',
    deleted_at: null,
    review_status: review,
    expense_splits: [],
  }) as unknown as Expense;

describe('payments waiting for approval count nowhere', () => {
  const list = [ex('a', 10000), ex('b', 12000, 'pending_review'), ex('c', 5000, 'confirmed')];
  it('drops them from the list that feeds totals, budgets and balances', () => {
    expect(confirmedOnly(list).map((e) => e.id)).toEqual(['a', 'c']);
    expect(isAwaitingReview(list[1])).toBe(true);
    const stats = computeTripStats({ expenses: confirmedOnly(list), timeZone: 'UTC', now: new Date('2026-11-21T00:00:00Z'), startDate: '2026-11-19', endDate: '2026-11-25', totalBudget: null, dailyBudget: null });
    expect(stats.total).toBe(15000);
  });
  it('the inbox still has them', () => {
    expect(pendingForMe(list, 'u').map((e) => e.id)).toEqual(['b']);
  });
});
