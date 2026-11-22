import { describe, expect, it } from 'vitest';
import { BRAND_ICONS } from '@/data/brandIcons';
import { brandOf, CATEGORY_BANK, inTrip, isBrandIcon } from '../categoryBank';
import { normalizeEmoji } from '../categories';

describe('category bank', () => {
  const items = CATEGORY_BANK.flatMap((g) => g.items);

  it('has unique ids, short icons (the database keeps 16) and valid colours', () => {
    expect(new Set(items.map((i) => i.id)).size).toBe(items.length);
    for (const i of items) {
      expect(i.icon.length).toBeLessThanOrEqual(16);
      expect(i.color).toMatch(/^#[0-9A-F]{6}$/i);
      // Emoji entries survive the editor's emoji clean-up unchanged
      if (!isBrandIcon(i.icon)) expect(normalizeEmoji(i.icon)).toBe(i.icon);
    }
  });

  it('every brand has a logo or a monogram', () => {
    for (const b of Object.values(BRAND_ICONS)) expect(b.path || b.text).toBeTruthy();
    expect(brandOf('b:grab')).toMatchObject({ id: 'grab', title: 'Grab' });
    expect(brandOf('b:7eleven')?.text).toBe('7');
    expect(brandOf('b:nope')).toBeNull();
    expect(brandOf('🍜')).toBeNull();
  });

  it('knows what the trip already has', () => {
    const grab = items.find((i) => i.id === 'grab')!;
    const sim = items.find((i) => i.id === 'sim')!;
    expect(inTrip(grab, 'Grab', [{ icon: 'b:grab', name: 'Grab rides' }])).toBe(true);
    expect(inTrip(sim, 'SIM / eSIM', [{ icon: '📶', name: 'sim / esim ' }])).toBe(true);
    expect(inTrip(sim, 'SIM / eSIM', [{ icon: '📶', name: 'Internet' }])).toBe(false);
  });
});
