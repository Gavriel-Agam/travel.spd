// Changes made while offline (or when a save failed for lack of signal). Kept
// on the device until the server has confirmed them, sent oldest first.
// - create: a new expense; its client_id makes a retry return the saved row
//   instead of adding it twice.
// - update / delete: an existing expense, with the version it was changed
//   from, so a partner's edit made in the meantime is detected, not overwritten.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SaveExpenseInput } from '@/api/queries';

type Base = {
  /** create: the new expense's client id. update: `edit:<expense id>`. delete: `del:<expense id>`. */
  clientId: string;
  tripId: string;
  createdBy: string;
  queuedAt: string;
  /** Set when the server rejected it for a reason other than connectivity. */
  error?: string;
};

export type CreateItem = Base & { kind?: 'create'; payload: SaveExpenseInput & { client_id: string } };
export type UpdateItem = Base & { kind: 'update'; expenseId: string; expectedVersion: number; payload: SaveExpenseInput };
export type DeleteItem = Base & { kind: 'delete'; expenseId: string; expectedVersion: number };
export type OutboxItem = CreateItem | UpdateItem | DeleteItem;

export const editKey = (expenseId: string) => `edit:${expenseId}`;
export const deleteKey = (expenseId: string) => `del:${expenseId}`;

type OutboxState = {
  items: OutboxItem[];
  add: (item: OutboxItem) => void;
  /** Queue an edit of a saved expense (a second edit replaces the first). */
  queueUpdate: (item: Omit<UpdateItem, 'kind' | 'clientId'>) => void;
  /** Queue a delete of a saved expense (drops any queued edit of it). */
  queueDelete: (item: Omit<DeleteItem, 'kind' | 'clientId'>) => void;
  remove: (clientId: string) => void;
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
      remove: (clientId) => set((s) => ({ items: s.items.filter((i) => i.clientId !== clientId) })),
      fail: (clientId, error) => set((s) => ({ items: s.items.map((i) => (i.clientId === clientId ? { ...i, error } : i)) })),
    }),
    { name: 'travelspend-outbox', storage: createJSONStorage(() => AsyncStorage) },
  ),
);

/** When everything last finished syncing, so the banner can say "all synced" for a moment. */
export const useSyncFlash = create<{ at: number; flash: () => void }>((set) => ({
  at: 0,
  flash: () => set({ at: Date.now() }),
}));
