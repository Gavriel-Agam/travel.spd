// Changes made while offline (or when a save failed for lack of signal). Kept
// on the device until the server has confirmed them, sent oldest first.
// - create: a new expense; its client_id makes a retry return the saved row
//   instead of adding it twice.
// - update / delete: an existing expense, with the version it was changed
//   from, so a partner's edit made in the meantime is detected, not overwritten.
// - trip / category / override / budget / member: a change to the trip's
//   settings (details, colour, category order, own payment methods, categories,
//   budget, your own name). A second change to the same thing is merged into
//   the first, in its place in the queue (so a category added offline is still
//   created before an expense that uses it). See lib/pendingChanges.
import { persistStorage } from '@/lib/deviceStorage';
import { mergeChange } from '@/lib/pendingChanges';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SaveExpenseInput } from '@/api/queries';
import type { Budget, Category, CategoryOverride, Member, Trip } from '@/types/db';

type Base = {
  /** create: the new expense's client id. update: `edit:<expense id>`. delete: `del:<expense id>`. Settings: see lib/pendingChanges. */
  clientId: string;
  tripId: string;
  createdBy: string;
  /** When it was queued, or last changed (a merged change gets a new time). */
  queuedAt: string;
  /** Set when the server rejected it for a reason other than connectivity. */
  error?: string;
};

export type CreateItem = Base & { kind?: 'create'; payload: SaveExpenseInput & { client_id: string } };
export type UpdateItem = Base & { kind: 'update'; expenseId: string; expectedVersion: number; payload: SaveExpenseInput };
export type DeleteItem = Base & { kind: 'delete'; expenseId: string; expectedVersion: number };

export type TripPatch = Partial<Pick<Trip, 'name' | 'start_date' | 'end_date' | 'default_currency' | 'theme_color' | 'category_order' | 'payment_methods'>>;
/** The trip's details, colour, category order or own payment methods. */
export type TripItem = Base & { kind: 'trip'; patch: TripPatch };
/** One of the trip's own categories, added (`create`) or changed (archived = deleted from the list). */
export type CategoryItem = Base & { kind: 'category'; categoryId: string; create: boolean; fields: Partial<Pick<Category, 'name' | 'icon' | 'color' | 'image' | 'archived'>> };
/** The trip's edit of a built-in category: back to the default first when `reset`, then these fields. */
export type OverrideItem = Base & { kind: 'override'; categoryId: string; reset: boolean; fields: Partial<Pick<CategoryOverride, 'name' | 'icon' | 'color' | 'image' | 'hidden'>> };
/** A budget amount; null removes it. */
export type BudgetItem = Base & { kind: 'budget'; scope: Budget['scope']; categoryId: string | null; memberId: string | null; amount: number | null };
/** Your own name or colour in the trip. */
export type MemberItem = Base & { kind: 'member'; memberId: string; patch: Partial<Pick<Member, 'display_name' | 'color'>> };

export type ChangeItem = TripItem | CategoryItem | OverrideItem | BudgetItem | MemberItem;
export type OutboxItem = CreateItem | UpdateItem | DeleteItem | ChangeItem;

export const editKey = (expenseId: string) => `edit:${expenseId}`;
export const deleteKey = (expenseId: string) => `del:${expenseId}`;

type OutboxState = {
  items: OutboxItem[];
  add: (item: OutboxItem) => void;
  /** Queue an edit of a saved expense (a second edit replaces the first). */
  queueUpdate: (item: Omit<UpdateItem, 'kind' | 'clientId'>) => void;
  /** Queue a delete of a saved expense (drops any queued edit of it). */
  queueDelete: (item: Omit<DeleteItem, 'kind' | 'clientId'>) => void;
  /** Queue a settings change, merged into an earlier one to the same thing (kept in its place). */
  queueChange: (item: ChangeItem) => void;
  /** Change a queued new expense in place (e.g. moved to another day before it was sent). */
  patchCreate: (clientId: string, patch: Partial<SaveExpenseInput>) => void;
  /** Done with it. With `queuedAt`, only if it wasn't changed again since (that newer change still has to be sent). */
  remove: (clientId: string, queuedAt?: string) => void;
  fail: (clientId: string, error: string) => void;
};

export const useOutbox = create<OutboxState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) => set((s) => ({ items: [...s.items.filter((i) => i.clientId !== item.clientId), item] })),
      queueUpdate: (item) =>
        set((s) => {
          const clientId = editKey(item.expenseId);
          const prev = s.items.find((i) => i.clientId === clientId) as UpdateItem | undefined;
          // Keep the version the first offline edit started from
          const next: UpdateItem = { ...item, kind: 'update', clientId, expectedVersion: prev?.expectedVersion ?? item.expectedVersion, error: undefined };
          return { items: [...s.items.filter((i) => i.clientId !== clientId), next] };
        }),
      queueDelete: (item) =>
        set((s) => {
          const edit = s.items.find((i) => i.clientId === editKey(item.expenseId)) as UpdateItem | undefined;
          const next: DeleteItem = { ...item, kind: 'delete', clientId: deleteKey(item.expenseId), expectedVersion: edit?.expectedVersion ?? item.expectedVersion };
          return { items: [...s.items.filter((i) => i.clientId !== editKey(item.expenseId) && i.clientId !== next.clientId), next] };
        }),
      queueChange: (item) =>
        set((s) => {
          const at = s.items.findIndex((i) => i.clientId === item.clientId);
          if (at < 0) return { items: [...s.items, item] };
          const items = s.items.slice();
          items[at] = { ...mergeChange(items[at], item), error: undefined };
          return { items };
        }),
      patchCreate: (clientId, patch) =>
        set((s) => ({
          items: s.items.map((i) =>
            i.clientId === clientId && (!i.kind || i.kind === 'create') ? { ...i, queuedAt: new Date().toISOString(), payload: { ...(i as CreateItem).payload, ...patch } } : i,
          ),
        })),
      remove: (clientId, queuedAt) =>
        set((s) => ({ items: s.items.filter((i) => i.clientId !== clientId || (queuedAt !== undefined && i.queuedAt !== queuedAt)) })),
      fail: (clientId, error) => set((s) => ({ items: s.items.map((i) => (i.clientId === clientId ? { ...i, error } : i)) })),
    }),
    { name: 'travelspend-outbox', storage: createJSONStorage(persistStorage) },
  ),
);

/** When everything last finished syncing, so the banner can say "all synced" for a moment. */
export const useSyncFlash = create<{ at: number; flash: () => void }>((set) => ({
  at: 0,
  flash: () => set({ at: Date.now() }),
}));
