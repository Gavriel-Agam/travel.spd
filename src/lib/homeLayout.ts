// Order of the cards on the Home screen, chosen per user (synced to their account).

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

export type Rect = { x: number; y: number; width: number; height: number };

/** One column on phones, two side by side from tablet width up. */
export function columnCount(screenWidth: number) {
  return screenWidth >= 768 ? 2 : 1;
}

/** Cards placed into columns left to right, row by row (the order still reads 1, 2, 3...). */
export function splitColumns<T>(items: T[], columns: number): T[][] {
  const out: T[][] = Array.from({ length: columns }, () => []);
  items.forEach((it, i) => out[i % columns].push(it));
  return out;
}

/**
 * Which card a dragged card is over: the one containing the point, otherwise
 * the closest one. Returns its index in `rects`, or -1 when there are none.
 */
export function dropTarget(rects: (Rect | undefined)[], px: number, py: number) {
  let best = -1;
  let bestDist = Infinity;
  rects.forEach((r, i) => {
    if (!r) return;
    if (px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height) {
      best = i;
      bestDist = -1;
      return;
    }
    if (bestDist < 0) return;
    const dx = px - (r.x + r.width / 2);
    const dy = py - (r.y + r.height / 2);
    const d = dx * dx + dy * dy;
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

/** Scroll speed (px per frame) while dragging near the top or bottom edge; 0 elsewhere. */
export function autoScrollSpeed(pointerY: number, viewTop: number, viewBottom: number, edge = 90, max = 14) {
  if (pointerY < viewTop + edge) return -Math.ceil(max * Math.min(1, (viewTop + edge - pointerY) / edge));
  if (pointerY > viewBottom - edge) return Math.ceil(max * Math.min(1, (pointerY - (viewBottom - edge)) / edge));
  return 0;
}

/**
 * The full order after reordering only the cards on screen: hidden cards (no
 * data yet) keep their slots, the visible ones fill the rest in their new order.
 */
export function mergeVisibleOrder<T>(full: T[], visibleNewOrder: T[]): T[] {
  const visible = new Set(visibleNewOrder);
  const next = visibleNewOrder[Symbol.iterator]();
  return full.map((k) => (visible.has(k) ? (next.next().value as T) : k));
}
