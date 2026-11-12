// Expenses tab: the order of a day's expenses can be set by hand (hold an
// expense and drag it within its day). The order is kept on this device only
// (prefs.expenseOrder), per trip and day.
import { mergeVisibleOrder } from './homeLayout';

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
