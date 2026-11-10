import type { TFunction } from 'i18next';
import type { Category, CategoryOverride } from '@/types/db';
import { mergeVisibleOrder } from './homeLayout';

export const UNCATEGORIZED = { icon: '🏷️', color: '#8E8E93' };

/** Built-in categories are translated by key unless the trip renamed them; custom ones show their own name. */
export function categoryLabel(cat: Category | undefined | null, t: TFunction) {
  if (!cat) return t('categories.uncategorized');
  return cat.key && !cat.renamed ? t(`categories.${cat.key}`) : cat.name;
}

export function categoryMap(list: Category[] | undefined) {
  return new Map((list ?? []).map((c) => [c.id, c]));
}

/**
 * Applies this trip's edits to the shared built-in categories. Every category
 * is kept (hidden and archived ones too) so old expenses still show theirs;
 * use `isSelectable` for pickers and lists.
 */
export function mergeCategories(list: Category[], overrides: CategoryOverride[]): Category[] {
  const byId = new Map(overrides.map((o) => [o.category_id, o]));
  return list.map((c) => {
    const o = c.trip_id ? undefined : byId.get(c.id);
    if (!o) return c;
    return {
      ...c,
      name: o.name ?? c.name,
      icon: o.icon ?? c.icon,
      color: o.color ?? c.color,
      image: o.image ?? c.image ?? null,
      renamed: !!o.name,
      hidden: o.hidden,
      edited: true,
    };
  });
}

/** Shown in pickers, filters and budgets: not hidden for this trip, not deleted. */
export function isSelectable(c: Category) {
  return !c.archived && !c.hidden;
}

/**
 * Categories in the order chosen for the trip. Ones not in the saved order
 * (added later, or never arranged) follow in their default order.
 */
export function orderCategories(list: Category[], order: readonly string[] | null | undefined): Category[] {
  if (!order?.length) return list;
  const rank = new Map(order.map((id, i) => [id, i]));
  return list
    .map((c, i) => ({ c, i }))
    .sort((a, b) => (rank.get(a.c.id) ?? order.length + a.i) - (rank.get(b.c.id) ?? order.length + b.i))
    .map((x) => x.c);
}

/**
 * The new full order after the visible (selectable) categories were rearranged:
 * hidden ones keep their place relative to the rest.
 */
export function nextCategoryOrder(all: Category[], visibleOrder: string[]): string[] {
  return mergeVisibleOrder(
    all.map((c) => c.id),
    visibleOrder,
  );
}

const PICTO = /\p{Extended_Pictographic}/u;
const PRESENTED = /\p{Emoji_Presentation}/u;

/** The text split into what a reader sees as single characters (keeps 👨‍👩‍👧 or 🇹🇭 whole). */
function graphemes(text: string): string[] {
  const Seg = (Intl as unknown as { Segmenter?: new (l?: string, o?: { granularity: string }) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
  if (Seg) return Array.from(new Seg(undefined, { granularity: 'grapheme' }).segment(text), (s) => s.segment);
  // Older browsers: keep joined emoji, skin tones and variation selectors together
  const out: string[] = [];
  for (const ch of Array.from(text)) {
    const prev = out[out.length - 1];
    if (prev && (/[‍️⃣]|[\u{1f3fb}-\u{1f3ff}]|[\u{e0020}-\u{e007f}]/u.test(ch) || prev.endsWith('‍'))) out[out.length - 1] = prev + ch;
    else out.push(ch);
  }
  return out;
}

/**
 * What the emoji field keeps: the last character typed, whole (some emoji are
 * several code points; cutting them showed half an emoji, e.g. ♀️ instead of
 * 💆‍♀️). Symbols that phones draw as plain black text unless asked (✈ ☀ ❤)
 * get the colour-emoji marker.
 */
export function normalizeEmoji(input: string): string {
  const last = graphemes(input.trim()).pop() ?? '';
  if (!last) return '';
  const cps = Array.from(last);
  if (cps.length === 1 && PICTO.test(last) && !PRESENTED.test(last)) return last + '️';
  return last;
}

/** Ready-made emoji for the picker in the category editor. */
export const EMOJI_CHOICES = [
  '🏨', '🏠', '⛺', '🍽️', '🍜', '🍕', '🍔', '☕', '🍺', '🍸', '🍦', '🛒',
  '🛺', '🚕', '🚌', '🚆', '⛴️', '✈️', '⛽', '🚗', '🛵', '🚲', '🎟️', '🏛️',
  '🏖️', '🤿', '🏄', '🧗', '🎢', '💆', '💊', '🏥', '🛍️', '🎁', '👕', '💇',
  '📱', '📶', '🧺', '💸', '🏧', '🎓', '🐘', '🙏', '📷', '🎉', '🧳', '🏷️',
] as const;
