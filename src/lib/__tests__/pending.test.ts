import { describe, expect, it } from 'vitest';
import { mergePending, pendingToExpense } from '../pending';
import type { CreateItem } from '@/store/outbox';
import type { Expense } from '@/types/db';

const A = 'aaaaaaaa-0000-0000-0000-000000000000';
const B = 'bbbbbbbb-0000-0000-0000-000000000000';

const item = (clientId: string, extra: Partial<CreateItem['payload']> = {}, error?: string): CreateItem => ({
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

describe('mergePending: offline edits and deletes', () => {
  const saved = (id: string, extra: Partial<Expense> = {}): Expense => ({
    ...pendingToExpense(item(`c-${id}`)),
    id,
    client_id: null,
    version: 3,
    pending: undefined,
    pending_error: undefined,
    pending_op: undefined,
    ...extra,
  });
  const edit = (expenseId: string, extra: Partial<CreateItem['payload']> = {}, error?: string) => ({
    ...item(`edit:${expenseId}`, extra, error),
    kind: 'update' as const,
    expenseId,
    expectedVersion: 3,
  });
  const del = (expenseId: string, error?: string) => ({
    clientId: `del:${expenseId}`,
    tripId: 't1',
    createdBy: 'u1',
    queuedAt: '2026-11-03T06:00:00Z',
    kind: 'delete' as const,
    expenseId,
    expectedVersion: 3,
    error,
  });

  it('an edit replaces the saved expense, with amounts recomputed and the starting version kept', () => {
    const [e] = mergePending([saved('e1')], [edit('e1', { amount_minor: 250000, description: 'Dinner' })], 't1');
    expect(e.id).toBe('e1');
    expect(e.description).toBe('Dinner');
    expect(e.amount_ils_minor).toBe(23187); // 2,500 THB at the same rate
    expect(e.expense_splits.reduce((t, s) => t + s.share_ils_minor, 0)).toBe(23187);
    expect(e.version).toBe(3);
    expect(e.pending).toBe('waiting');
    expect(e.pending_op).toBe('update');
  });

  it('a delete hides the expense at once, so totals drop', () => {
    const list = mergePending([saved('e1'), saved('e2')], [del('e1')], 't1');
    expect(list.map((e) => e.id)).toEqual(['e2']);
  });

  it('a delete the server refused shows the expense again, marked', () => {
    const [e] = mergePending([saved('e1')], [del('e1', 'conflict')], 't1');
    expect(e.pending).toBe('failed');
    expect(e.pending_op).toBe('delete');
    expect(e.pending_error).toBe('conflict');
  });

  it('changes queued for another trip are ignored', () => {
    const list = mergePending([saved('e1')], [{ ...del('e1'), tripId: 't2' }], 't1');
    expect(list[0].pending).toBeUndefined();
  });
});
