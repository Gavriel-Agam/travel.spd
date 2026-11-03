import { describe, expect, it } from 'vitest';
import { alertLevel, computeTripStats, dayKey, lastNDays, spendByCurrency } from '../stats';

const TZ = 'Asia/Bangkok';
const e = (amount: number, at: string, cat: string | null = 'food', kind: 'expense' | 'settlement' = 'expense') => ({
  kind,
  amount_ils_minor: amount,
  occurred_at: at,
  category_id: cat,
});

describe('dayKey', () => {
  it('uses the trip timezone, not UTC', () => {
    // 20:00 UTC on Nov 1 is 03:00 Nov 2 in Bangkok
    expect(dayKey('2026-11-01T20:00:00Z', TZ)).toBe('2026-11-02');
    expect(dayKey('2026-11-01T20:00:00Z', 'Asia/Jerusalem')).toBe('2026-11-01');
  });
});

describe('computeTripStats', () => {
  const now = new Date('2026-11-03T05:00:00Z'); // Nov 3 noon in Bangkok
  const base = {
    timeZone: TZ,
    now,
    startDate: '2026-11-01',
    endDate: '2026-11-10',
    totalBudget: 100000,
    dailyBudget: 10000,
  };

  it('computes totals, average, projection and budget', () => {
    const s = computeTripStats({
      ...base,
      expenses: [
        e(6000, '2026-11-01T05:00:00Z'),
        e(9000, '2026-11-02T05:00:00Z', 'hotel'),
        e(3000, '2026-11-03T04:00:00Z'),
        e(99999, '2026-11-03T04:00:00Z', null, 'settlement'),
      ],
    });
    expect(s.total).toBe(18000);
    expect(s.today).toBe(3000);
    expect(s.daysElapsed).toBe(3);
    expect(s.dailyAverage).toBe(6000);
    expect(s.tripDays).toBe(10);
    expect(s.projected).toBe(60000);
    expect(s.remaining).toBe(82000);
    expect(s.pctUsed).toBe(18);
    expect(s.todayPct).toBe(30);
    expect(s.byCategory[0]).toEqual({ categoryId: 'food', total: 9000, pct: 50 });
    expect(s.topDays[0]).toEqual({ day: '2026-11-02', total: 9000 });
  });

  it('keeps pre-trip spending out of the daily average (flights before the trip)', () => {
    // Started: flights 3000 before the trip, then 1000 on each of the first two days
    const s = computeTripStats({
      ...base,
      startDate: '2026-11-02',
      endDate: '2026-11-11',
      expenses: [e(3000, '2026-11-01T05:00:00Z', 'flights'), e(1000, '2026-11-02T05:00:00Z'), e(1000, '2026-11-03T04:00:00Z')],
    });
    expect(s.total).toBe(5000);
    expect(s.dailyAverage).toBe(1000);
    expect(s.projected).toBe(3000 + 1000 * 10);
  });

  it('before the trip starts: no average or projection (was 4,980 x 39 days)', () => {
    const s = computeTripStats({
      ...base,
      startDate: '2026-11-10',
      endDate: '2026-12-18',
      expenses: [e(498000, '2026-11-03T04:00:00Z', 'flights')],
    });
    expect(s.total).toBe(498000);
    expect(s.today).toBe(498000);
    expect(s.dailyAverage).toBe(0);
    expect(s.projected).toBeNull();
  });

  it('handles an empty trip', () => {
    const s = computeTripStats({ ...base, expenses: [] });
    expect(s.total).toBe(0);
    expect(s.dailyAverage).toBe(0);
    expect(s.alert).toBe(0);
    expect(s.byDay).toEqual([]);
  });

  it('works without dates or budget', () => {
    const s = computeTripStats({ ...base, startDate: null, endDate: null, totalBudget: null, dailyBudget: null, expenses: [e(500, '2026-11-02T05:00:00Z')] });
    expect(s.daysElapsed).toBe(2);
    expect(s.projected).toBeNull();
    expect(s.remaining).toBeNull();
  });
});

describe('alertLevel', () => {
  it('maps thresholds', () => {
    expect([0, 49.9, 50, 74.9, 75, 90, 99.9, 100, 140].map(alertLevel)).toEqual([0, 0, 50, 50, 75, 90, 90, 100, 100]);
  });
});

describe('spendByCurrency', () => {
  it('sums original and ILS amounts per currency, excluding settlements', () => {
    const rows = spendByCurrency([
      { kind: 'expense', currency: 'THB', amount_minor: 125000, amount_ils_minor: 11593 },
      { kind: 'expense', currency: 'THB', amount_minor: 5000, amount_ils_minor: 464 },
      { kind: 'expense', currency: 'ILS', amount_minor: 30000, amount_ils_minor: 30000 },
      { kind: 'settlement', currency: 'ILS', amount_minor: 99999, amount_ils_minor: 99999 },
    ]);
    expect(rows).toEqual([
      { currency: 'ILS', originalMinor: 30000, ilsMinor: 30000, count: 1 },
      { currency: 'THB', originalMinor: 130000, ilsMinor: 12057, count: 2 },
    ]);
  });
});

describe('lastNDays', () => {
  it('returns oldest first ending today', () => {
    expect(lastNDays(3, new Date('2026-11-03T05:00:00Z'), TZ)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03']);
  });
});
