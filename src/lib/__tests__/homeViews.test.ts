import { describe, expect, it } from 'vitest';
import { myShareExpenses } from '../settlement';
import { computeTripStats } from '../stats';
import { cardFeeFor, memberFeePct } from '../taxFree';

const A = 'a';
const B = 'b';
const exp = (amount: number, splits: [string, number][], extra: Partial<{ kind: 'expense' | 'settlement'; category_id: string | null; occurred_at: string }> = {}) => ({
  kind: 'expense' as 'expense' | 'settlement',
  amount_ils_minor: amount,
  occurred_at: '2026-11-10T10:00:00Z',
  category_id: null as string | null,
  splits: splits.map(([member_id, share_ils_minor]) => ({ member_id, share_ils_minor })),
  ...extra,
});

describe('myShareExpenses (Home "My share")', () => {
  const list = [
    exp(10000, [[A, 5000], [B, 5000]], { category_id: 'food' }), // shared: my half
    exp(3000, [[A, 3000]], { category_id: 'shop' }), // my personal
    exp(2000, [[B, 2000]]), // partner's personal: not mine
    exp(9000, [[A, 9000]], { kind: 'settlement' }), // a transfer, not spending
    exp(999, [[A, 333], [B, 666]], { category_id: 'food' }), // uneven split
  ];

  it('counts personal in full plus my part of shared ones', () => {
    const mine = myShareExpenses(list, A);
    expect(mine.map((e) => e.amount_ils_minor)).toEqual([5000, 3000, 333]);
    expect(mine.reduce((t, e) => t + e.amount_ils_minor, 0)).toBe(8333);
  });

  it('my share plus the partner share equals the trip total', () => {
    const total = list.filter((e) => e.kind === 'expense').reduce((t, e) => t + e.amount_ils_minor, 0);
    const sum = (id: string) => myShareExpenses(list, id).reduce((t, e) => t + e.amount_ils_minor, 0);
    expect(sum(A) + sum(B)).toBe(total);
  });

  it('feeds the same stats engine (categories, total)', () => {
    const s = computeTripStats({ expenses: myShareExpenses(list, A), timeZone: 'UTC', now: new Date('2026-11-12T12:00:00Z'), startDate: '2026-11-08', endDate: null, totalBudget: null, dailyBudget: null });
    expect(s.total).toBe(8333);
    expect(s.byCategory.find((r) => r.categoryId === 'food')?.total).toBe(5333);
    expect(s.byCategory.find((r) => r.categoryId === 'shop')?.total).toBe(3000);
  });
});

describe('memberFeePct (card fee per person)', () => {
  it('uses the member’s own fee, 0 included', () => {
    expect(memberFeePct({ card_fx_fee_pct: '1.5' }, { card_fx_fee_pct: 2.5 })).toBe('1.5');
    expect(memberFeePct({ card_fx_fee_pct: 0 }, { card_fx_fee_pct: 2.5 })).toBe(0);
  });
  it('a member with no fee set gets none (not the trip’s)', () => {
    expect(memberFeePct({ card_fx_fee_pct: null }, { card_fx_fee_pct: 2.5 })).toBeNull();
  });
  it('data from before per-person fees falls back to the trip’s', () => {
    expect(memberFeePct({}, { card_fx_fee_pct: 2.5 })).toBe(2.5);
    expect(memberFeePct(null, null)).toBeNull();
  });
  it('two people, two fees on the same card expense', () => {
    expect(cardFeeFor('card', 'THB', 'ILS', memberFeePct({ card_fx_fee_pct: 0 }, null))).toBe(0);
    expect(cardFeeFor('card', 'THB', 'ILS', memberFeePct({ card_fx_fee_pct: '3' }, null))).toBe(3);
  });
});
