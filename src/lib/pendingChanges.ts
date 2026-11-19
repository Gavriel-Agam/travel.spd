// Changes to a trip's settings made on this device and not yet on the server
// (offline, or still being sent): the trip's details, colour, category order
// and own payment methods; categories added, edited, hidden or reset; the
// trip budget; your own name and colour. They are queued in the outbox like
// expenses and applied on top of the saved data wherever it is shown, so the
// screen shows the change at once and keeps showing it after a restart.
import builtins from '@/data/categories.json';
import type { BudgetItem, CategoryItem, MemberItem, OutboxItem, OverrideItem, TripItem } from '@/store/outbox';
import type { Budget, Category, Member, Trip } from '@/types/db';

export const isTripItem = (i: OutboxItem): i is TripItem => i.kind === 'trip';
export const isCategoryItem = (i: OutboxItem): i is CategoryItem => i.kind === 'category';
export const isOverrideItem = (i: OutboxItem): i is OverrideItem => i.kind === 'override';
export const isBudgetItem = (i: OutboxItem): i is BudgetItem => i.kind === 'budget';
export const isMemberItem = (i: OutboxItem): i is MemberItem => i.kind === 'member';
/** A queued change to an expense (new, edit or delete) rather than to the trip's settings. */
export const isExpenseItem = (i: OutboxItem) => !i.kind || i.kind === 'create' || i.kind === 'update' || i.kind === 'delete' || i.kind === 'restore';

// Queue keys: one entry per thing changed; a second change to it is merged into the first
export const tripChangeKey = (tripId: string) => `trip:${tripId}`;
export const categoryChangeKey = (categoryId: string) => `cat:${categoryId}`;
export const overrideChangeKey = (tripId: string, categoryId: string) => `ovr:${tripId}:${categoryId}`;
export const budgetChangeKey = (tripId: string, scope: string, categoryId: string | null, memberId: string | null) =>
  `budget:${tripId}:${scope}:${categoryId ?? ''}:${memberId ?? ''}`;
export const memberChangeKey = (memberId: string) => `member:${memberId}`;

/** Two queued changes to the same thing, as one: the later values win. */
export function mergeChange(prev: OutboxItem, next: OutboxItem): OutboxItem {
  if (isTripItem(prev) && isTripItem(next)) return { ...next, patch: { ...prev.patch, ...next.patch } };
  if (isMemberItem(prev) && isMemberItem(next)) return { ...next, patch: { ...prev.patch, ...next.patch } };
  // Added offline and then edited: still has to be created
  if (isCategoryItem(prev) && isCategoryItem(next)) return { ...next, create: prev.create || next.create, fields: { ...prev.fields, ...next.fields } };
  // A reset wipes what came before it; edits after a reset still need the reset first
  if (isOverrideItem(prev) && isOverrideItem(next))
    return next.reset ? next : { ...next, reset: prev.reset, fields: { ...prev.fields, ...next.fields } };
  return next;
}

/** Trips with their queued changes. */
export function applyTripChanges(trips: Trip[], items: OutboxItem[]): Trip[] {
  const patches = items.filter(isTripItem);
  if (!patches.length) return trips;
  return trips.map((trip) => patches.filter((p) => p.tripId === trip.id).reduce((t, p) => ({ ...t, ...p.patch }), trip));
}

const BUILTIN = new Map(builtins.map((b) => [b.key, b]));

/** A trip's categories (built-ins merged with its overrides) with the queued changes. */
export function applyCategoryChanges(categories: Category[], items: OutboxItem[], tripId: string): Category[] {
  const own = items.filter((i): i is CategoryItem | OverrideItem => i.tripId === tripId && (isCategoryItem(i) || isOverrideItem(i)));
  if (!own.length) return categories;
  let list = categories.map((cat) => {
    let next = cat;
    for (const item of own) {
      if (item.categoryId !== cat.id) continue;
      if (isCategoryItem(item)) next = { ...next, ...item.fields };
      else {
        if (item.reset) {
          // Back to the built-in as shipped
          const base = cat.key ? BUILTIN.get(cat.key) : undefined;
          next = { ...next, ...(base ? { name: base.name, icon: base.icon, color: base.color } : null), image: null, renamed: false, hidden: false, edited: false };
        }
        const f = item.fields;
        next = {
          ...next,
          ...(f.name != null ? { name: f.name, renamed: true } : null),
          ...(f.icon != null ? { icon: f.icon } : null),
          ...(f.color != null ? { color: f.color } : null),
          ...(f.image !== undefined ? { image: f.image } : null),
          ...(f.hidden !== undefined ? { hidden: f.hidden } : null),
          edited: next.edited || Object.keys(f).length > 0,
        };
      }
    }
    return next;
  });
  // Added on this device and not on the server yet
  const known = new Set(list.map((c) => c.id));
  for (const item of own) {
    if (!isCategoryItem(item) || !item.create || known.has(item.categoryId)) continue;
    list = [
      ...list,
      {
        id: item.categoryId,
        trip_id: tripId,
        key: null,
        name: item.fields.name ?? '',
        icon: item.fields.icon ?? '🏷️',
        color: item.fields.color ?? '#8E8E93',
        image: item.fields.image ?? null,
        sort_order: 500,
        archived: item.fields.archived ?? false,
      },
    ];
  }
  return list;
}

/** A trip's budgets with the queued changes (a null amount removes one). */
export function applyBudgetChanges(budgets: Budget[], items: OutboxItem[], tripId: string): Budget[] {
  const own = items.filter((i): i is BudgetItem => i.tripId === tripId && isBudgetItem(i));
  if (!own.length) return budgets;
  let list = budgets;
  for (const item of own) {
    const same = (b: Budget) => b.scope === item.scope && (b.category_id ?? null) === item.categoryId && (b.member_id ?? null) === item.memberId;
    const rest = list.filter((b) => !same(b));
    if (item.amount == null) list = rest;
    else {
      const old = list.find(same);
      list = [
        ...rest,
        { id: old?.id ?? `pending:${item.clientId}`, trip_id: tripId, scope: item.scope, category_id: item.categoryId, member_id: item.memberId, amount_ils_minor: item.amount },
      ];
    }
  }
  return list;
}

/** Members with your own queued name / colour change. */
export function applyMemberChanges(members: Member[], items: OutboxItem[]): Member[] {
  const patches = items.filter(isMemberItem);
  if (!patches.length) return members;
  return members.map((m) => patches.filter((p) => p.memberId === m.id).reduce((x, p) => ({ ...x, ...p.patch }), m));
}
