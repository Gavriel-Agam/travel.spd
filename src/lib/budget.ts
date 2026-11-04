// Budget status and analytics series. Inputs are stored home-currency values;
// nothing here converts currencies or uses today's rate.
import { percent } from './money';
import { alertLevel, dayKey, daysInclusive, type AlertLevel } from './stats';

export type BudgetRow = {
  scope: 'total' | 'daily' | 'category' | 'member';
  category_id: string | null;
  member_id: string | null;
  amount_ils_minor: number;
};

export type BudgetStatus = {
  scope: BudgetRow['scope'];
  key: string; // 'total' | 'daily' | category id | member id
  limit: number;
  spent: number;
  remaining: number;
  pct: number;
  alert: AlertLevel;
};

type Spend = {
  kind: 'expense' | 'settlement';
  amount_ils_minor: number;
  occurred_at: string;
  category_id: string | null;
  payment_method?: string | null;
  paid_by_member_id?: string | null;
  splits?: { member_id: string; share_ils_minor: number }[];
};

/**
 * Status of every budget. Personal limits count each person's share of the
 * spending (what they consumed), not what they happened to pay for.
 */
export function budgetStatuses(budgets: BudgetRow[], expenses: Spend[], timeZone: string, now: Date): BudgetStatus[] {
  const spending = expenses.filter((e) => e.kind === 'expense');
  const today = dayKey(now, timeZone);
  const total = spending.reduce((t, e) => t + e.amount_ils_minor, 0);
  const todayTotal = spending.filter((e) => dayKey(e.occurred_at, timeZone) === today).reduce((t, e) => t + e.amount_ils_minor, 0);

  return budgets.map((b) => {
    let spent = 0;
    let key: string = b.scope;
    if (b.scope === 'total') spent = total;
    else if (b.scope === 'daily') spent = todayTotal;
    else if (b.scope === 'category') {
      key = b.category_id!;
      spent = spending.filter((e) => e.category_id === b.category_id).reduce((t, e) => t + e.amount_ils_minor, 0);
    } else {
      key = b.member_id!;
      spent = spending.reduce(
        (t, e) => t + (e.splits ?? []).filter((s) => s.member_id === b.member_id).reduce((u, s) => u + s.share_ils_minor, 0),
        0,
      );
    }
    const pct = percent(spent, b.amount_ils_minor);
    return { scope: b.scope, key, limit: b.amount_ils_minor, spent, remaining: b.amount_ils_minor - spent, pct, alert: alertLevel(pct) };
  });
}

/** The most urgent alert across all budgets (ties: total first), or null when nothing reached 50%. */
export function topAlert(statuses: BudgetStatus[]): BudgetStatus | null {
  const order = { total: 0, daily: 1, category: 2, member: 3 } as const;
  const hits = statuses.filter((s) => s.alert >= 50);
  hits.sort((a, b) => b.alert - a.alert || order[a.scope] - order[b.scope]);
  return hits[0] ?? null;
}

/**
 * One entry per calendar day from the first to the last day (zero-filled),
 * with the running total and the budget's straight-line pace for comparison.
 */
export function dailySeries(input: {
  expenses: Spend[];
  timeZone: string;
  now: Date;
  startDate: string | null;
  endDate: string | null;
  totalBudget: number | null;
}) {
  const spending = input.expenses.filter((e) => e.kind === 'expense');
  const byDay = new Map<string, number>();
  for (const e of spending) {
    const d = dayKey(e.occurred_at, input.timeZone);
    byDay.set(d, (byDay.get(d) ?? 0) + e.amount_ils_minor);
  }
  const today = dayKey(input.now, input.timeZone);
  const keys = [...byDay.keys()].sort();
  const first = [input.startDate, keys[0]].filter(Boolean).sort()[0] ?? today;
  const lastCandidates = [keys[keys.length - 1], input.endDate && input.endDate < today ? input.endDate : today].filter(Boolean) as string[];
  const last = lastCandidates.sort().pop()!;
  const n = Math.max(1, daysInclusive(first, last));
  const tripDays = input.startDate && input.endDate ? daysInclusive(input.startDate, input.endDate) : null;

  const out: { day: string; total: number; cumulative: number; pace: number | null }[] = [];
  let running = 0;
  const base = Date.parse(first);
  for (let i = 0; i < n; i++) {
    const day = new Date(base + i * 86_400_000).toISOString().slice(0, 10);
    const total = byDay.get(day) ?? 0;
    running += total;
    let pace: number | null = null;
    if (input.totalBudget && tripDays && input.startDate) {
      const dayIndex = daysInclusive(input.startDate, day);
      pace = dayIndex < 1 ? 0 : Math.round((input.totalBudget * Math.min(dayIndex, tripDays)) / tripDays);
    }
    out.push({ day, total, cumulative: running, pace });
  }
  return out;
}

/** Generic grouping: sum of amount by a key, largest first, with percentages. */
export function groupTotals<K extends string>(items: { key: K; amount: number }[]) {
  const map = new Map<K, number>();
  for (const i of items) map.set(i.key, (map.get(i.key) ?? 0) + i.amount);
  const sum = [...map.values()].reduce((a, b) => a + b, 0);
  return [...map.entries()]
    .map(([key, total]) => ({ key, total, pct: percent(total, sum) }))
    .sort((a, b) => b.total - a.total);
}

export function byPaymentMethod(expenses: Spend[]) {
  return groupTotals(
    expenses.filter((e) => e.kind === 'expense').map((e) => ({ key: (e.payment_method ?? 'unknown') as string, amount: e.amount_ils_minor })),
  );
}

/** Spending distribution: how many expenses fall in each ILS size band. */
export function sizeDistribution(expenses: Spend[], bandsMinor = [5000, 20000, 50000, 100000]) {
  const labels = bandsMinor.map((_, i) => i).concat(bandsMinor.length);
  const counts = labels.map(() => ({ count: 0, total: 0 }));
  for (const e of expenses) {
    if (e.kind !== 'expense') continue;
    let i = bandsMinor.findIndex((b) => e.amount_ils_minor < b);
    if (i === -1) i = bandsMinor.length;
    counts[i].count++;
    counts[i].total += e.amount_ils_minor;
  }
  return counts.map((c, i) => ({ from: i === 0 ? 0 : bandsMinor[i - 1], to: bandsMinor[i] ?? null, ...c }));
}
