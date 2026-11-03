import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { categoryLabel, isSelectable, mergeCategories } from '../categories';
import type { Category, CategoryOverride } from '@/types/db';

const t = ((k: string) => ({ 'categories.accommodation': 'לינה', 'categories.other': 'אחר' })[k] ?? k) as unknown as TFunction;
const cat = (id: string, extra: Partial<Category> = {}): Category => ({
  id, trip_id: null, key: id, name: id, icon: '🏷️', color: '#8E8E93', sort_order: 1, archived: false, ...extra,
});
const ov = (category_id: string, extra: Partial<CategoryOverride> = {}): CategoryOverride => ({
  trip_id: 't', category_id, name: null, icon: null, color: null, hidden: false, ...extra,
});

describe('mergeCategories', () => {
  const list = [cat('accommodation'), cat('other'), cat('c1', { trip_id: 't', key: null, name: 'עיסוי' })];

  it('applies a rename, emoji and colour to a built-in', () => {
    const [hotel] = mergeCategories(list, [ov('accommodation', { name: 'מלונות', icon: '🛏️', color: '#112233' })]);
    expect(categoryLabel(hotel, t)).toBe('מלונות');
    expect(hotel.icon).toBe('🛏️');
    expect(hotel.color).toBe('#112233');
    expect(hotel.id).toBe('accommodation'); // same id: past expenses keep it
  });

  it('keeps the translated name when only the emoji changed', () => {
    const [hotel] = mergeCategories(list, [ov('accommodation', { icon: '🛏️' })]);
    expect(categoryLabel(hotel, t)).toBe('לינה');
  });

  it('hides without removing, so old expenses still resolve', () => {
    const merged = mergeCategories(list, [ov('other', { hidden: true })]);
    expect(merged).toHaveLength(3);
    expect(merged.filter(isSelectable).map((c) => c.id)).toEqual(['accommodation', 'c1']);
  });

  it('ignores overrides for custom categories and leaves others untouched', () => {
    const merged = mergeCategories(list, [ov('c1', { name: 'x' })]);
    expect(merged[2].name).toBe('עיסוי');
    expect(merged[0]).toEqual(list[0]);
  });

  it('treats deleted custom categories as not selectable', () => {
    expect(isSelectable(cat('c2', { trip_id: 't', key: null, archived: true }))).toBe(false);
  });
});
