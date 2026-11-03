import { describe, expect, it } from 'vitest';
import { mergePending, pendingToExpense } from '../pending';
import type { OutboxItem } from '@/store/outbox';
import type { Expense } from '@/types/db';

const A = 'aaaaaaaa-0000-0000-0000-000000000000';
const B = 'bbbbbbbb-0000-0000-0000-000000000000';

const item = (clientId: string, extra: Partial<OutboxItem['payload']> = {}, error?: string): OutboxItem => ({
  clientId,
  tripId: 't1',
  createdBy: 'u1',
  queuedAt: '2026-11-03T05:00:00Z',
  error,
  payload: {
    client_id: clientId,
    trip_id: 't1',
    paid_by_member_id: A,
    amount_minor: 125000,
    currency: 'THB',
    fx_rate: '0.0927473927',
    fx_source: 'ecb',
    fx_rate_date: '2026-10-30',
    fx_fetched_at: null,
    fx_is_manual: false,
    category_id: null,
    description: 'Pad thai',
    notes: null,
    occurred_at: '2026-11-03T05:00:00Z',
    receipt_path: null,
    payment_method: null,
    split_type: 'equal',
    splits: [{ member_id: A }, { member_id: B }],
    ...extra,
  },
});

describe('pendingToExpense', () => {
  it('computes the same ILS amount and shares the server will', () => {
    const e = pendingToExpense(item('c1'));
    expect(e.amount_ils_minor).toBe(11593);
    expect(e.expense_splits.map((s) => [s.member_id, s.share_ils_minor])).toEqual([
      [A, 5797], // payer gets the odd agora
      [B, 5796],
    ]);
    expect(e.pending).toBe('waiting');
  });
  it('handles percent splits and marks failures', () => {
    const e = pendingToExpense(
      item('c2', { split_type: 'percent', splits: [{ member_id: A, value: 70 }, { member_id: B, value: 30 }] }, 'invalid_rate'),
    );
    expect(e.expense_splits.reduce((t, s) => t + s.share_ils_minor, 0)).toBe(11593);
    expect(e.pending).toBe('failed');
    expect(e.pending_error).toBe('invalid_rate');
  });
});

describe('mergePending', () => {
  const saved = [
    { id: 's1', client_id: 'c9', occurred_at: '2026-11-03T08:00:00Z' },
    { id: 's2', client_id: null, occurred_at: '2026-11-02T08:00:00Z' },
  ] as Expense[];
  it('adds queued expenses for this trip in date order', () => {
    const merged = mergePending(saved, [item('c1')], 't1');
    expect(merged.map((e) => e.id)).toEqual(['s1', 'c1', 's2']);
  });
  it('drops queued items the server already has, and other trips', () => {
    const other = { ...item('c3'), tripId: 't2' };
    expect(mergePending(saved, [item('c9'), other], 't1').map((e) => e.id)).toEqual(['s1', 's2']);
  });
});
