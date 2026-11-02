import type { TFunction } from 'i18next';
import type { Category } from '@/types/db';

export const UNCATEGORIZED = { icon: '🏷️', color: '#8E8E93' };

/** Built-in categories are translated by key; custom ones show their own name. */
export function categoryLabel(cat: Category | undefined | null, t: TFunction) {
  if (!cat) return t('categories.uncategorized');
  return cat.key ? t(`categories.${cat.key}`) : cat.name;
}

export function categoryMap(list: Category[] | undefined) {
  return new Map((list ?? []).map((c) => [c.id, c]));
}
