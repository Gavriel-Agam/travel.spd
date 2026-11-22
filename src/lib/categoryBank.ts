// The category & brand bank (Categories › בנק קטגוריות ומותגים): ready-made
// categories grouped by region or use, added to the trip with one tap. Brands
// are stored with the icon "b:<id>" (drawn from src/data/brandIcons, shipped
// with the app, so it shows offline); the rest use an emoji.
import { BRAND_ICONS, type BrandIcon } from '@/data/brandIcons';

const BRAND_PREFIX = 'b:';

export type BankItem = {
  id: string;
  /** "b:<brand id>" or an emoji. */
  icon: string;
  color: string;
  /** Brand name (the same in every language); without it the name is translated (`bank.items.<id>`). */
  brand?: string;
};

export type BankGroup = { key: 'asia' | 'global' | 'essentials'; items: BankItem[] };

const brand = (id: string): BankItem => {
  const b = BRAND_ICONS[id];
  if (!b) throw new Error(`unknown brand ${id}`);
  return { id, icon: BRAND_PREFIX + id, color: `#${b.hex}`, brand: b.title };
};
const plain = (id: string, icon: string, color: string): BankItem => ({ id, icon, color });

export const CATEGORY_BANK: readonly BankGroup[] = [
  { key: 'asia', items: ['7eleven', 'familymart', 'lawson', 'grab', 'gojek', 'bolt', 'shopee'].map(brand) },
  {
    key: 'global',
    items: [
      plain('metro', '🚇', '#3B9EFF'),
      ...['uber', 'lidl', 'carrefour', 'starbucks', 'mcdonalds', 'burgerking', 'kfc', 'decathlon', 'zara', 'hm', 'uniqlo', 'ikea', 'airbnb', 'booking'].map(brand),
    ],
  },
  {
    key: 'essentials',
    items: [
      plain('duty_free', '🛃', '#8B5CF6'),
      plain('sim', '📶', '#14B8A6'),
      plain('pharmacy', '💊', '#EF4444'),
      plain('train_bus', '🚆', '#3B82F6'),
      plain('taxi', '🚕', '#F59E0B'),
      plain('laundry', '🧺', '#06B6D4'),
      plain('atm', '🏧', '#64748B'),
      plain('tips', '🙏', '#EC4899'),
    ],
  },
];

/** The brand behind a category icon ("b:grab"), or null for an emoji or an unknown brand. */
export function brandOf(icon: string | null | undefined): (BrandIcon & { id: string }) | null {
  if (!icon?.startsWith(BRAND_PREFIX)) return null;
  const id = icon.slice(BRAND_PREFIX.length);
  const b = BRAND_ICONS[id];
  return b ? { ...b, id } : null;
}

export const isBrandIcon = (icon: string | null | undefined) => !!icon?.startsWith(BRAND_PREFIX);

/** Already in the trip's list: same brand, or the same emoji and name. */
export function inTrip(item: BankItem, name: string, active: { icon: string; name: string }[]): boolean {
  if (item.brand) return active.some((c) => c.icon === item.icon);
  const n = name.trim().toLowerCase();
  return active.some((c) => c.icon === item.icon && c.name.trim().toLowerCase() === n);
}
