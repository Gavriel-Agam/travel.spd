import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { buildDemo } from '../demoData';
import { computeBalances } from '../settlement';
import { computeTripStats } from '../stats';

const t = ((k: string) => k) as unknown as TFunction;
const now = new Date('2026-11-20T05:00:00Z');

describe('demo trip', () => {
  const d = buildDemo(t, now);

  it('is a trip in progress with several currencies and every split type', () => {
    expect(d.trip.start_date! <= d.today && d.today <= d.trip.end_date!).toBe(true);
    expect(new Set(d.expenses.map((e) => e.currency))).toEqual(new Set(['ILS', 'THB', 'USD', 'VND', 'EUR']));
    expect(new Set(d.expenses.filter((e) => e.kind === 'expense').map((e) => e.split_type))).toEqual(
      new Set(['equal', 'percent', 'personal', 'treat', 'amount']),
    );
  });

  it('has shares that always add up to each expense', () => {
    for (const e of d.expenses) {
      expect(e.expense_splits.reduce((s, x) => s + x.share_ils_minor, 0)).toBe(e.amount_ils_minor);
    }
  });

  it('produces sensible dashboard numbers', () => {
    const s = computeTripStats({
      expenses: d.expenses,
      timeZone: d.trip.timezone,
      now,
      startDate: d.trip.start_date,
      endDate: d.trip.end_date,
      totalBudget: 1_800_000,
      dailyBudget: 90_000,
    });
    expect(s.total).toBeGreaterThan(450_000); // the flights alone are 4,500 ₪
    expect(s.dailyAverage).toBeGreaterThan(0);
    expect(s.projected).not.toBeNull();
    const bal = computeBalances(d.members.map((m) => m.id), d.expenses.map((e) => ({ ...e, splits: e.expense_splits })));
    expect(bal.reduce((x, b) => x + b.net, 0)).toBe(0);
  });

  it('only references its own categories and members', () => {
    const cats = new Set(d.categories.map((c) => c.id));
    const members = new Set(d.members.map((m) => m.id));
    for (const e of d.expenses) {
      if (e.category_id) expect(cats.has(e.category_id)).toBe(true);
      if (e.paid_by_member_id) expect(members.has(e.paid_by_member_id)).toBe(true);
    }
  });
});
