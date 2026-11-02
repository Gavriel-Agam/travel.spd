// Dashboard figures, computed from stored home-currency values in the trip's timezone.
import Decimal from 'decimal.js';
import { percent } from './money';

export type StatExpense = {
  kind: 'expense' | 'settlement';
  amount_ils_minor: number;
  occurred_at: string;
  category_id: string | null;
};

/** "YYYY-MM-DD" of an instant in a timezone. */
export function dayKey(date: Date | string, timeZone: string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Inclusive number of calendar days between two day keys. */
export function daysInclusive(from: string, to: string) {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
}

export type AlertLevel = 0 | 50 | 75 | 90 | 100;

export function alertLevel(pct: number): AlertLevel {
  if (pct >= 100) return 100;
  if (pct >= 90) return 90;
  if (pct >= 75) return 75;
  if (pct >= 50) return 50;
  return 0;
}

export type TripStats = {
  total: number;
  today: number;
  daysElapsed: number;
  tripDays: number | null;
  dailyAverage: number;
  projected: number | null;
  budget: number | null;
  remaining: number | null;
  pctUsed: number;
  alert: AlertLevel;
  dailyBudget: number | null;
  todayPct: number;
  byCategory: { categoryId: string | null; total: number; pct: number }[];
  byDay: { day: string; total: number }[];
  topDays: { day: string; total: number }[];
};

export function computeTripStats(input: {
  expenses: StatExpense[];
  timeZone: string;
  now: Date;
  startDate: string | null;
  endDate: string | null;
  totalBudget: number | null;
  dailyBudget: number | null;
}): TripStats {
  const spending = input.expenses.filter((e) => e.kind === 'expense');
  const today = dayKey(input.now, input.timeZone);

  const byDayMap = new Map<string, number>();
  const byCatMap = new Map<string | null, number>();
  let total = 0;
  for (const e of spending) {
    total += e.amount_ils_minor;
    const d = dayKey(e.occurred_at, input.timeZone);
    byDayMap.set(d, (byDayMap.get(d) ?? 0) + e.amount_ils_minor);
    byCatMap.set(e.category_id, (byCatMap.get(e.category_id) ?? 0) + e.amount_ils_minor);
  }

  const days = [...byDayMap.keys()].sort();
  // Average over the trip so far: from the trip start (or first expense) up to today
  // (or the trip end, if it is over). Spending before the trip (e.g. flights) counts
  // in the total but not in elapsed days.
  const firstDay = input.startDate ?? days[0] ?? today;
  const lastDay = input.endDate && input.endDate < today ? input.endDate : today;
  const daysElapsed = Math.max(1, daysInclusive(firstDay < lastDay ? firstDay : lastDay, lastDay));
  const tripDays = input.startDate && input.endDate ? daysInclusive(input.startDate, input.endDate) : null;
  const dailyAverage = new Decimal(total).div(daysElapsed).toDecimalPlaces(0).toNumber();
  const projected = tripDays ? Math.max(total, dailyAverage * tripDays) : null;

  const todayTotal = byDayMap.get(today) ?? 0;
  const pctUsed = input.totalBudget ? percent(total, input.totalBudget) : 0;

  return {
    total,
    today: todayTotal,
    daysElapsed,
    tripDays,
    dailyAverage,
    projected,
    budget: input.totalBudget,
    remaining: input.totalBudget != null ? input.totalBudget - total : null,
    pctUsed,
    alert: input.totalBudget ? alertLevel(pctUsed) : 0,
    dailyBudget: input.dailyBudget,
    todayPct: input.dailyBudget ? percent(todayTotal, input.dailyBudget) : 0,
    byCategory: [...byCatMap.entries()]
      .map(([categoryId, t]) => ({ categoryId, total: t, pct: percent(t, total) }))
      .sort((a, b) => b.total - a.total),
    byDay: days.map((day) => ({ day, total: byDayMap.get(day)! })),
    topDays: days
      .map((day) => ({ day, total: byDayMap.get(day)! }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 3),
  };
}

export type CurrencyTotal = { currency: string; originalMinor: number; ilsMinor: number; count: number };

/** Spending grouped by the currency it was paid in, with original and stored ILS totals. */
export function spendByCurrency(
  expenses: { kind: 'expense' | 'settlement'; currency: string; amount_minor: number; amount_ils_minor: number }[],
): CurrencyTotal[] {
  const map = new Map<string, CurrencyTotal>();
  for (const e of expenses) {
    if (e.kind !== 'expense') continue;
    const row = map.get(e.currency) ?? { currency: e.currency, originalMinor: 0, ilsMinor: 0, count: 0 };
    row.originalMinor += e.amount_minor;
    row.ilsMinor += e.amount_ils_minor;
    row.count += 1;
    map.set(e.currency, row);
  }
  return [...map.values()].sort((a, b) => b.ilsMinor - a.ilsMinor);
}

/** The last `n` day keys ending today, oldest first (for the trend chart). */
export function lastNDays(n: number, now: Date, timeZone: string): string[] {
  const out: string[] = [];
  const today = dayKey(now, timeZone);
  const base = Date.parse(today);
  for (let i = n - 1; i >= 0; i--) out.push(new Date(base - i * 86_400_000).toISOString().slice(0, 10));
  return out;
}
