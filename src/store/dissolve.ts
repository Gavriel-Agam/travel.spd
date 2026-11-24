import { create } from 'zustand';

/** How long a deleted row takes to turn to dust and close up. */
export const DISSOLVE_MS = 560;

/** Rows turning to dust right now (expense id -> start time), and the rows on screen that can. */
export const useDissolve = create<{ ids: Record<string, number>; start: (id: string) => void; clear: (id: string) => void }>((set) => ({
  ids: {},
  start: (id) => set((s) => ({ ids: { ...s.ids, [id]: Date.now() } })),
  clear: (id) =>
    set((s) => {
      if (!(id in s.ids)) return s;
      const ids = { ...s.ids };
      delete ids[id];
      return { ids };
    }),
}));

const onScreen = new Map<string, number>();
/** A row that can dissolve is showing (returns the cleanup). */
export function registerDissolvable(id: string) {
  onScreen.set(id, (onScreen.get(id) ?? 0) + 1);
  return () => {
    const n = (onScreen.get(id) ?? 1) - 1;
    if (n <= 0) onScreen.delete(id);
    else onScreen.set(id, n);
  };
}

/**
 * Turns the row to dust, then runs `remove` (which takes it out of the list).
 * `delayMs` waits first, e.g. for the expense screen to close. With no row on
 * screen it just removes at once.
 */
export function dissolveThen(id: string, remove: () => void, delayMs = 0) {
  const go = () => {
    if (!onScreen.has(id)) return remove();
    useDissolve.getState().start(id);
    setTimeout(() => {
      remove();
      // Kept collapsed until the list has dropped it (or it comes back if the delete failed)
      setTimeout(() => useDissolve.getState().clear(id), 400);
    }, DISSOLVE_MS);
  };
  if (delayMs > 0) setTimeout(go, delayMs);
  else go();
}
