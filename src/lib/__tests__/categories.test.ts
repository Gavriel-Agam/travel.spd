import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { categoryLabel, isSelectable, mergeCategories, nextCategoryOrder, normalizeEmoji, orderCategories } from '../categories';
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

describe('category pictures', () => {
  it('a built-in takes its picture from the trip override', () => {
    const png = 'data:image/png;base64,AAAA';
    const [hotel] = mergeCategories([cat('accommodation')], [ov('accommodation', { image: png })]);
    expect(hotel.image).toBe(png);
    const [plain] = mergeCategories([cat('accommodation')], [ov('accommodation', { icon: '🛏️' })]);
    expect(plain.image).toBeNull();
  });
});

describe('orderCategories', () => {
  const list = [cat('a'), cat('b'), cat('c'), cat('d')];
  const ids = (l: Category[]) => l.map((c) => c.id);

  it('keeps the default order when nothing was arranged', () => {
    expect(ids(orderCategories(list, null))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(orderCategories(list, []))).toEqual(['a', 'b', 'c', 'd']);
  });

  it('follows the saved order; ones added later go last in their default order', () => {
    expect(ids(orderCategories(list, ['c', 'a']))).toEqual(['c', 'a', 'b', 'd']);
  });

  it('ignores ids that no longer exist', () => {
    expect(ids(orderCategories(list, ['gone', 'd', 'b']))).toEqual(['d', 'b', 'a', 'c']);
  });

  it('a reorder of the visible ones keeps hidden ones in their slots', () => {
    // b is hidden; the visible a, c, d become d, a, c
    expect(nextCategoryOrder(list, ['d', 'a', 'c'])).toEqual(['d', 'b', 'a', 'c']);
  });
});

describe('normalizeEmoji', () => {
  it('keeps the last emoji typed, whole', () => {
    expect(normalizeEmoji('🏨💆‍♀️')).toBe('💆‍♀️');
    expect(normalizeEmoji('👨‍👩‍👧')).toBe('👨‍👩‍👧');
    expect(normalizeEmoji('🇹🇭')).toBe('🇹🇭');
    expect(normalizeEmoji('👍🏽')).toBe('👍🏽');
    expect(normalizeEmoji('  ')).toBe('');
  });

  it('asks for the colour version of symbols phones draw as text', () => {
    expect(normalizeEmoji('✈')).toBe('✈️');
    expect(normalizeEmoji('✈️')).toBe('✈️');
    expect(normalizeEmoji('🍜')).toBe('🍜');
  });
});

