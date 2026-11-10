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
  /** Spending per day over the trip so far: `averagedTotal` ÷ `daysElapsed`. */
  dailyAverage: number;
  /** First and last day the average covers (null before the trip starts). */
  averageFrom: string | null;
  averageTo: string | null;
  /** Spending on the days the average covers. */
  averagedTotal: number;
  /** In the total but not in the average: before the trip start (e.g. flights)... */
  preTrip: number;
  /** ...and dated after today (or after the trip end). */
  afterAverage: number;
  /** The daily average split by category (same days), largest first. */
  averageByCategory: { categoryId: string | null; total: number; perDay: number; pct: number }[];
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
  // Average over the trip so far: spending from the trip start (or the first
  // expense) up to today (or the trip end, if it is over), divided by those days.
  // Spending before the trip (e.g. flights) and expenses dated later than today
  // count in the total but not in the daily average; the projection adds the
  // pre-trip part once.
  const lastDay = input.endDate && input.endDate < today ? input.endDate : today;
  const notStarted = !!input.startDate && today < input.startDate;
  const firstDay = input.startDate ?? days.find((d) => d <= lastDay) ?? lastDay;
  const from = firstDay < lastDay ? firstDay : lastDay;
  const daysElapsed = notStarted ? 0 : Math.max(1, daysInclusive(from, lastDay));
  const tripDays = input.startDate && input.endDate ? daysInclusive(input.startDate, input.endDate) : null;
  const sumDays = (keep: (d: string) => boolean) => days.filter(keep).reduce((t, d) => t + byDayMap.get(d)!, 0);
  const preTrip = input.startDate ? sumDays((d) => d < input.startDate!) : 0;
  const inAverage = (d: string) => !notStarted && d >= from && d <= lastDay;
  const averagedTotal = sumDays(inAverage);
  const afterAverage = sumDays((d) => d > lastDay && (!input.startDate || d >= input.startDate));
  const perDay = (minor: number) => (daysElapsed ? new Decimal(minor).div(daysElapsed).toDecimalPlaces(0).toNumber() : 0);
  const dailyAverage = perDay(averagedTotal);
  const avgCat = new Map<string | null, number>();
  for (const e of spending) {
    if (!inAverage(dayKey(e.occurred_at, input.timeZone))) continue;
    avgCat.set(e.category_id, (avgCat.get(e.category_id) ?? 0) + e.amount_ils_minor);
  }
  // Nothing to project from before the first trip day
  const projected = tripDays && !notStarted ? Math.max(total, preTrip + dailyAverage * tripDays) : null;

  const todayTotal = byDayMap.get(today) ?? 0;
  const pctUsed = input.totalBudget ? percent(total, input.totalBudget) : 0;

  return {
    total,
    today: todayTotal,
    daysElapsed,
    tripDays,
    dailyAverage,
    averageFrom: notStarted ? null : from,
    averageTo: notStarted ? null : lastDay,
    averagedTotal,
    preTrip,
    afterAverage,
    averageByCategory: [...avgCat.entries()]
      .map(([categoryId, t]) => ({ categoryId, total: t, perDay: perDay(t), pct: percent(t, averagedTotal) }))
      .sort((a, b) => b.total - a.total),
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

/** A day key moved by `n` days. */
export function addDays(day: string, n: number): string {
  return new Date(Date.parse(day) + n * 86_400_000).toISOString().slice(0, 10);
}

export type Period = 'day' | 'week' | 'month';

/**
 * The day, week or month containing `anchor`, moved `offset` periods back
 * (negative) or forward. Weeks start on Sunday (0) or Monday (1).
 */
export function periodRange(period: Period, anchor: string, offset: number, weekStart: 0 | 1): { from: string; to: string } {
  if (period === 'day') {
    const d = addDays(anchor, offset);
    return { from: d, to: d };
  }
  if (period === 'week') {
    const dow = new Date(anchor + 'T00:00:00Z').getUTCDay();
    const from = addDays(anchor, -((dow - weekStart + 7) % 7) + 7 * offset);
    return { from, to: addDays(from, 6) };
  }
  const [y, m] = anchor.split('-').map(Number);
  const first = new Date(Date.UTC(y, m - 1 + offset, 1));
  const next = new Date(Date.UTC(y, m + offset, 1));
  return { from: first.toISOString().slice(0, 10), to: new Date(next.getTime() - 86_400_000).toISOString().slice(0, 10) };
}

/** Spending per category between two days (inclusive, trip timezone), largest first. */
export function byCategoryBetween(expenses: StatExpense[], timeZone: string, from: string, to: string) {
  const map = new Map<string | null, number>();
  let total = 0;
  for (const e of expenses) {
    if (e.kind !== 'expense') continue;
    const d = dayKey(e.occurred_at, timeZone);
    if (d < from || d > to) continue;
    total += e.amount_ils_minor;
    map.set(e.category_id, (map.get(e.category_id) ?? 0) + e.amount_ils_minor);
  }
  const rows = [...map.entries()].map(([categoryId, t]) => ({ categoryId, total: t, pct: percent(t, total) })).sort((a, b) => b.total - a.total);
  return { total, rows };
}
