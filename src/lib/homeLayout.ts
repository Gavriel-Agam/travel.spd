// Order of the cards on the Home screen, chosen per device.

export const HOME_SECTIONS = ['hero', 'today', 'couple', 'trend', 'categories', 'recent'] as const;
export type HomeSection = (typeof HOME_SECTIONS)[number];

/**
 * The saved order, cleaned up: unknown keys (from older versions) are dropped
 * and cards added in later versions are appended, so every card always shows.
 */
export function resolveHomeOrder(saved: string[] | undefined | null): HomeSection[] {
  const known = new Set<string>(HOME_SECTIONS);
  const kept = (saved ?? []).filter((k, i, a): k is HomeSection => known.has(k) && a.indexOf(k) === i);
  return [...kept, ...HOME_SECTIONS.filter((k) => !kept.includes(k))];
}

/** The list with the item at `from` moved to `to`. */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}
