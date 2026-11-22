// The trip checklist (צ'ק ליסט): three short lists per trip. "To pack" and
// "To buy / do" are shared with everyone on the trip; "What I brought" is each
// person's own. Items are added, ticked and removed on the device at once and
// queued in the outbox (kind 'checklist'), so the lists work offline; the
// queued changes are laid over the saved copy wherever the list is shown.
import type { ChecklistChange, OutboxItem } from '@/store/outbox';
import type { ChecklistItem, ChecklistList } from '@/types/db';
import { isChecklistItem } from './pendingChanges';

export const CHECKLIST_LISTS: readonly ChecklistList[] = ['to_pack', 'to_buy_do', 'brought'];

/** Longest item text (the database allows 200). */
export const CHECKLIST_TITLE_MAX = 200;

/** The text as saved: trimmed, one line, at most CHECKLIST_TITLE_MAX characters; '' when nothing is left. */
export function cleanTitle(input: string): string {
  return input.replace(/\s+/g, ' ').trim().slice(0, CHECKLIST_TITLE_MAX).trim();
}

/** The saved items with this device's queued changes on top (added, ticked, renamed, removed). */
export function applyChecklistChanges(items: ChecklistItem[], queue: OutboxItem[], tripId: string): ChecklistItem[] {
  const own = queue.filter((i): i is ChecklistChange => i.tripId === tripId && isChecklistItem(i));
  if (!own.length) return items;
  const byId = new Map(own.map((c) => [c.itemId, c]));
  const list: ChecklistItem[] = [];
  for (const item of items) {
    const c = byId.get(item.id);
    if (c?.remove) continue;
    list.push(c ? { ...item, ...c.fields } : item);
  }
  const known = new Set(items.map((i) => i.id));
  for (const c of own) {
    if (!c.create || c.remove || known.has(c.itemId)) continue;
    list.push({
      id: c.itemId,
      trip_id: tripId,
      user_id: c.userId,
      list_type: c.listType,
      title: c.fields.title ?? '',
      is_checked: c.fields.is_checked ?? false,
      sort_order: c.fields.sort_order ?? 0,
      created_at: c.queuedAt,
    });
  }
  return list;
}

/** One list in the order shown: still to do first (in their order), then the ticked ones. */
export function listItems(items: ChecklistItem[], list: ChecklistList, userId: string | undefined): ChecklistItem[] {
  return items
    .filter((i) => i.list_type === list && (list !== 'brought' || i.user_id === userId))
    .sort((a, b) => Number(a.is_checked) - Number(b.is_checked) || a.sort_order - b.sort_order || a.created_at.localeCompare(b.created_at));
}

/** Where a new item goes: after the last one in its list. */
export function nextSortOrder(items: ChecklistItem[], list: ChecklistList): number {
  return items.filter((i) => i.list_type === list).reduce((max, i) => Math.max(max, i.sort_order + 1), 0);
}

/** How many are ticked, of how many, in one list. */
export function progress(items: ChecklistItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.is_checked).length, total: items.length };
}
