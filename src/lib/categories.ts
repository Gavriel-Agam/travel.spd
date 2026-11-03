import type { TFunction } from 'i18next';
import type { Category, CategoryOverride } from '@/types/db';

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
