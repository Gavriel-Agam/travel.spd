// Expenses tab: the order of a day's expenses can be set by hand (hold an
// expense and drag it), within its day or onto another day. The order is kept
// on this device only (prefs.expenseOrder), per trip and day. Moving an
// expense to another day changes its date for everyone (same time of day).
import type { SaveExpenseInput } from '@/api/queries';
import type { Expense } from '@/types/db';
import { mergeVisibleOrder } from './homeLayout';
import type { SplitEntry } from './split';
import { dayKey } from './stats';

/**
 * A day's expenses in the order set by hand. Without one they stay as they
 * come (newest first). Expenses added since the order was set aren't in it:
 * they go first, newest first, where a new expense would appear anyway.
 */
export function orderDay<T extends { id: string }>(items: T[], saved: readonly string[] | undefined): T[] {
  if (!saved?.length) return items;
  const pos = new Map(saved.map((id, i) => [id, i]));
  const fresh = items.filter((e) => !pos.has(e.id));
  const known = items.filter((e) => pos.has(e.id)).sort((a, b) => pos.get(a.id)! - pos.get(b.id)!);
  return [...fresh, ...known];
}

/**
 * The day's full order after dragging among the expenses on screen (a search
 * or filter may hide some): the ones on screen take their new places, the
 * hidden ones keep theirs.
 */
export function nextDayOrder(fullDay: readonly string[], visibleNewOrder: string[]): string[] {
  return mergeVisibleOrder([...fullDay], visibleNewOrder);
}

/** Key of a day heading in the list that holds every day (headings and expenses together). */
export const dayHeadingKey = (day: string) => `day:${day}`;
const headingDay = (key: string) => (key.startsWith('day:') ? key.slice(4) : null);

export type DaySection = {
  day: string;
  /** Ids of the day's expenses on screen, in their current order. */
  visible: string[];
  /** Ids of all the day's expenses (also ones a search or filter hides), in their current order. */
  fullDay: string[];
};

/**
 * After a drag in the list of all days (headings included, `keys` in their new
 * order): each day's new full order, and the expense that landed under another
 * day's heading, if any. Something dropped above the first heading belongs to
 * the first day. Only days whose order changed are returned.
 */
export function dropAcrossDays(keys: string[], sections: DaySection[]): { orders: Record<string, string[]>; moved: { id: string; from: string; to: string } | null } {
  const dayOf = new Map<string, string>();
  for (const s of sections) for (const id of s.visible) dayOf.set(id, s.day);

  const visibleByDay = new Map<string, string[]>(sections.map((s) => [s.day, []]));
  let current = sections[0]?.day ?? null;
  for (const key of keys) {
    const heading = headingDay(key);
    if (heading !== null) {
      current = heading;
      continue;
    }
    if (current !== null) visibleByDay.get(current)?.push(key);
  }

  let moved: { id: string; from: string; to: string } | null = null;
  for (const [day, ids] of visibleByDay) {
    for (const id of ids) {
      const from = dayOf.get(id);
      if (from && from !== day) moved = { id, from, to: day };
    }
  }

  const orders: Record<string, string[]> = {};
  for (const s of sections) {
    const visible = visibleByDay.get(s.day) ?? [];
    let full = s.fullDay.filter((id) => id !== moved?.id || moved.from !== s.day);
    if (moved && moved.to === s.day) full = [...full, moved.id];
    const next = nextDayOrder(full, visible);
    if (next.join('|') !== s.fullDay.join('|')) orders[s.day] = next;
  }
  return { orders, moved };
}

/**
 * The same time of day on another date, in the trip's time zone. A daylight
 * saving change in between could push it over midnight; it is nudged back
 * onto the chosen day.
 */
export function moveToDay(iso: string, toDay: string, timeZone: string): string {
  const days = Math.round((Date.parse(`${toDay}T12:00:00Z`) - Date.parse(`${dayKey(iso, timeZone)}T12:00:00Z`)) / 86_400_000);
  let t = Date.parse(iso) + days * 86_400_000;
  for (const step of [-3_600_000, 3_600_000]) {
    if (dayKey(new Date(t), timeZone) !== toDay && dayKey(new Date(t + step), timeZone) === toDay) t += step;
  }
  return new Date(t).toISOString();
}

/** How a saved expense is split, as the save_expense call takes it. */
export function splitEntriesOf(e: Expense): SplitEntry[] {
  if (e.split_type === 'percent') return e.expense_splits.map((s) => ({ member_id: s.member_id, value: Number(s.share_pct) }));
  if (e.split_type === 'amount') return e.expense_splits.map((s) => ({ member_id: s.member_id, value: Number(s.share_original_minor) }));
  return e.expense_splits.map((s) => ({ member_id: s.member_id }));
}

/** A saved expense as an edit to send (same amounts, rate, split and photo). */
export function inputFromExpense(e: Expense): SaveExpenseInput {
  return {
    trip_id: e.trip_id,
    kind: e.kind,
    paid_by_member_id: e.paid_by_member_id,
    amount_minor: e.amount_minor,
    currency: e.currency,
    fx_rate: e.fx_rate,
    fx_source: e.fx_source,
    fx_rate_date: e.fx_rate_date,
    fx_fetched_at: e.fx_fetched_at,
    fx_is_manual: e.fx_is_manual,
    category_id: e.category_id,
    description: e.description,
    notes: e.notes,
    occurred_at: e.occurred_at,
    receipt_path: e.receipt_path,
    payment_method: e.payment_method,
    fx_fee_pct: Number(e.fx_fee_pct ?? 0),
    tax_free: e.tax_free ?? false,
    vat_country: e.vat_country ?? null,
    split_type: e.split_type,
    splits: splitEntriesOf(e),
  };
}
