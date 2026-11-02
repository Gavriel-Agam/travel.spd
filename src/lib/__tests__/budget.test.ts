import { describe, expect, it } from 'vitest';
import { budgetStatuses, byPaymentMethod, dailySeries, sizeDistribution, topAlert } from '../budget';

const TZ = 'Asia/Bangkok';
const A = 'a';
const B = 'b';
const exp = (amount: number, at: string, extra: Record<string, unknown> = {}) => ({
  kind: 'expense' as const,
  amount_ils_minor: amount,
  occurred_at: at,
  category_id: 'food',
  splits: [
    { member_id: A, share_ils_minor: Math.ceil(amount / 2) },
    { member_id: B, share_ils_minor: Math.floor(amount / 2) },
  ],
  ...extra,
});

const now = new Date('2026-11-03T05:00:00Z');
const expenses = [
  exp(6000, '2026-11-01T05:00:00Z'),
  exp(9000, '2026-11-02T05:00:00Z', { category_id: 'hotel', splits: [{ member_id: B, share_ils_minor: 9000 }] }),
  exp(3000, '2026-11-03T04:00:00Z', { payment_method: 'cash' }),
  { kind: 'settlement' as const, amount_ils_minor: 50000, occurred_at: '2026-11-03T04:00:00Z', category_id: null, splits: [{ member_id: A, share_ils_minor: 50000 }] },
];

describe('budgetStatuses', () => {
  const statuses = budgetStatuses(
    [
      { scope: 'total', category_id: null, member_id: null, amount_ils_minor: 20000 },
      { scope: 'daily', category_id: null, member_id: null, amount_ils_minor: 4000 },
      { scope: 'category', category_id: 'hotel', member_id: null, amount_ils_minor: 10000 },
      { scope: 'member', category_id: null, member_id: B, amount_ils_minor: 10000 },
    ],
    expenses,
    TZ,
    now,
  );
  it('computes spent per scope, ignoring settlements', () => {
    expect(statuses.map((s) => [s.key, s.spent, s.pct, s.alert])).toEqual([
      ['total', 18000, 90, 90],
      ['daily', 3000, 75, 75],
      ['hotel', 9000, 90, 90],
      [B, 3000 + 9000 + 1500, 135, 100], // B's shares: 3000 + 9000 + 1500
    ]);
  });
  it('picks the most urgent alert, total first on ties', () => {
    expect(topAlert(statuses)?.key).toBe(B);
    expect(topAlert(statuses.filter((s) => s.key !== B))?.key).toBe('total');
    expect(topAlert([])).toBeNull();
  });
});

describe('dailySeries', () => {
  it('zero-fills days and tracks cumulative vs budget pace', () => {
    const s = dailySeries({ expenses, timeZone: TZ, now, startDate: '2026-10-31', endDate: '2026-11-09', totalBudget: 100000 });
    expect(s.map((d) => d.day)).toEqual(['2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03']);
    expect(s.map((d) => d.total)).toEqual([0, 6000, 9000, 3000]);
    expect(s.map((d) => d.cumulative)).toEqual([0, 6000, 15000, 18000]);
    expect(s.map((d) => d.pace)).toEqual([10000, 20000, 30000, 40000]);
  });
  it('works without dates', () => {
    const s = dailySeries({ expenses: [], timeZone: TZ, now, startDate: null, endDate: null, totalBudget: null });
    expect(s).toEqual([{ day: '2026-11-03', total: 0, cumulative: 0, pace: null }]);
  });
});

describe('breakdowns', () => {
  it('groups by payment method', () => {
    expect(byPaymentMethod(expenses)).toEqual([
      { key: 'unknown', total: 15000, pct: 83.3 },
      { key: 'cash', total: 3000, pct: 16.7 },
    ]);
  });
  it('buckets expense sizes', () => {
    const d = sizeDistribution(expenses);
    // 30 ₪ is under 50 ₪; 60 ₪ and 90 ₪ fall in 50 to 200 ₪
    expect(d.map((b) => b.count)).toEqual([1, 2, 0, 0, 0]);
    expect(d[0]).toEqual({ from: 0, to: 5000, count: 1, total: 3000 });
    expect(d[1]).toEqual({ from: 5000, to: 20000, count: 2, total: 15000 });
    expect(d[4].to).toBeNull();
  });
});
