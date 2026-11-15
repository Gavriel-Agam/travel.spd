import { describe, expect, it } from 'vitest';
import { dayHeadingKey, dropAcrossDays, inputFromExpense, moveToDay, nextDayOrder, orderDay } from '../expenseOrder';
import { dayKey } from '../stats';
import type { Expense } from '@/types/db';

const day = [{ id: 'd' }, { id: 'c' }, { id: 'b' }, { id: 'a' }]; // newest first

describe('order of a day’s expenses', () => {
  it('stays newest first until arranged by hand', () => {
    expect(orderDay(day, undefined).map((e) => e.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(orderDay(day, []).map((e) => e.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('follows the order set by hand; expenses added since come first', () => {
    expect(orderDay(day, ['a', 'b', 'c', 'd']).map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    // "d" was added after the order was set, and "x" (in the order) was deleted since
    expect(orderDay(day, ['b', 'x', 'a', 'c']).map((e) => e.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('dragging among the visible ones (a search hides some) keeps the hidden ones in place', () => {
    // Full day a b c d; search shows a and c; drag c above a
    expect(nextDayOrder(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['c', 'b', 'a', 'd']);
    expect(nextDayOrder(['a', 'b'], ['b', 'a'])).toEqual(['b', 'a']);
  });
});

describe('dragging an expense onto another day', () => {
  const sections = [
    { day: '2026-11-15', visible: ['a', 'b'], fullDay: ['a', 'b'] },
    { day: '2026-11-14', visible: ['c', 'd'], fullDay: ['c', 'x', 'd'] }, // x is hidden by a search
  ];

  it('moves it under the heading it was dropped below', () => {
    const keys = [dayHeadingKey('2026-11-15'), 'a', dayHeadingKey('2026-11-14'), 'c', 'b', 'd'];
    const r = dropAcrossDays(keys, sections);
    expect(r.moved).toEqual({ id: 'b', from: '2026-11-15', to: '2026-11-14' });
    expect(r.orders['2026-11-15']).toEqual(['a']);
    // On screen: c, b, d; the hidden x keeps its place (second) in the day
    expect(r.orders['2026-11-14']).toEqual(['c', 'x', 'b', 'd']);
  });

  it('dropped above the first heading: the first day', () => {
    const keys = ['d', dayHeadingKey('2026-11-15'), 'a', 'b', dayHeadingKey('2026-11-14'), 'c'];
    const r = dropAcrossDays(keys, sections);
    expect(r.moved).toEqual({ id: 'd', from: '2026-11-14', to: '2026-11-15' });
    expect(r.orders['2026-11-15']).toEqual(['d', 'a', 'b']);
  });

  it('within its own day: only that day changes, nothing moves', () => {
    const keys = [dayHeadingKey('2026-11-15'), 'b', 'a', dayHeadingKey('2026-11-14'), 'c', 'd'];
    const r = dropAcrossDays(keys, sections);
    expect(r.moved).toBeNull();
    expect(r.orders).toEqual({ '2026-11-15': ['b', 'a'] });
  });

  it('keeps the time of day on the new date, in the trip’s time zone', () => {
    // 21:30 in Bangkok on 15 Nov (14:30 UTC) -> 21:30 on 13 Nov
    expect(moveToDay('2026-11-15T14:30:00.000Z', '2026-11-13', 'Asia/Bangkok')).toBe('2026-11-13T14:30:00.000Z');
    // 00:30 in Bangkok on 16 Nov (17:30 UTC on the 15th) -> 00:30 on 14 Nov
    expect(moveToDay('2026-11-15T17:30:00.000Z', '2026-11-14', 'Asia/Bangkok')).toBe('2026-11-13T17:30:00.000Z');
    // Across a daylight saving change it still lands on the chosen day
    const moved = moveToDay('2026-03-30T22:30:00.000Z', '2026-03-28', 'Europe/Berlin');
    expect(dayKey(moved, 'Europe/Berlin')).toBe('2026-03-28');
  });

  it('turns a saved expense back into an edit with the same split', () => {
    const e = {
      id: 'e1', trip_id: 't', kind: 'expense', created_by: 'u', updated_by: 'u', paid_by_member_id: 'm1', amount_minor: 1000, currency: 'THB',
      fx_rate: '0.1', fx_source: 'ecb', fx_rate_date: '2026-11-14', fx_fetched_at: null, fx_is_manual: false, amount_ils_minor: 100, category_id: null,
      description: 'Taxi', notes: null, occurred_at: '2026-11-15T10:00:00Z', receipt_path: null, payment_method: 'cash', split_type: 'percent', version: 3,
      created_at: '', updated_at: '', deleted_at: null,
      expense_splits: [
        { expense_id: 'e1', member_id: 'm1', weight: '60', share_pct: '60.0000', share_original_minor: null, share_ils_minor: 60 },
        { expense_id: 'e1', member_id: 'm2', weight: '40', share_pct: '40.0000', share_original_minor: null, share_ils_minor: 40 },
      ],
    } as Expense;
    const input = inputFromExpense(e);
    expect(input.splits).toEqual([{ member_id: 'm1', value: 60 }, { member_id: 'm2', value: 40 }]);
    expect(input).toMatchObject({ fx_rate: '0.1', fx_rate_date: '2026-11-14', fx_is_manual: false, occurred_at: e.occurred_at, payment_method: 'cash' });
  });
});
