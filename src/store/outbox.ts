// Expenses created while offline. Kept on the device until the server has
// confirmed them; each carries a client_id so a retry can never duplicate.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { SaveExpenseInput } from '@/api/queries';

export type OutboxItem = {
  clientId: string;
  tripId: string;
  payload: SaveExpenseInput & { client_id: string };
  createdBy: string;
  queuedAt: string;
  /** Set when the server rejected it for a reason other than connectivity. */
  error?: string;
};

type OutboxState = {
  items: OutboxItem[];
  add: (item: OutboxItem) => void;
  remove: (clientId: string) => void;
  fail: (clientId: string, error: string) => void;
};

export const useOutbox = create<OutboxState>()(
  persist(
    (set) => ({
      items: [],
      add: (item) => set((s) => ({ items: [...s.items.filter((i) => i.clientId !== item.clientId), item] })),
      remove: (clientId) => set((s) => ({ items: s.items.filter((i) => i.clientId !== clientId) })),
      fail: (clientId, error) => set((s) => ({ items: s.items.map((i) => (i.clientId === clientId ? { ...i, error } : i)) })),
    }),
    { name: 'travelspend-outbox', storage: createJSONStorage(() => AsyncStorage) },
  ),
);
