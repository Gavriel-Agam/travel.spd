import { describe, expect, it } from 'vitest';
import builtIn from '@/data/categories.json';
import { HERO_GLOW_OPACITY, MEMBER_COLORS, TRIP_THEMES, themes, withTripTheme, type TripTheme } from '@/palette';
import { contrastRatio, flatten, readableOn } from '../contrast';

const AA_TEXT = 4.5;
const AA_GRAPHIC = 3;

// Every trip accent in both modes (the default blue included)
const variants = (Object.keys(TRIP_THEMES) as TripTheme[]).flatMap((accent) =>
  (['light', 'dark'] as const).map((mode) => [`${accent} / ${mode}`, withTripTheme(themes[mode], mode, accent)] as const),
);

describe.each([...Object.entries(themes), ...variants])('%s theme meets WCAG 2.1 AA', (_name, c) => {
  const surfaces = { bg: c.bg, card: c.card, cardAlt: c.cardAlt };
  const textColors = {
    text: c.text,
    textMuted: c.textMuted,
    textFaint: c.textFaint,
    primary: c.primary,
    success: c.success,
    warning: c.warning,
    danger: c.danger,
  };

  for (const [fgName, fg] of Object.entries(textColors)) {
    for (const [bgName, bg] of Object.entries(surfaces)) {
      it(`${fgName} text on ${bgName}`, () => {
        expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(AA_TEXT);
      });
    }
  }

  it('button labels on their backgrounds', () => {
    expect(contrastRatio(c.primaryText, c.primary)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.primary, c.primarySoft)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.danger, c.dangerSoft)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('total card text on both of its colours', () => {
    const on = readableOn(c.heroFrom);
    expect(contrastRatio(on, c.heroFrom)).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(on, c.heroTo)).toBeGreaterThanOrEqual(AA_TEXT);
    // ...and where the inner glow is brightest
    const glow = '#FFFFFF' + Math.round(HERO_GLOW_OPACITY * 255).toString(16).padStart(2, '0');
    expect(contrastRatio(on, flatten(glow, c.heroFrom))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(on, flatten(glow, c.heroTo))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('banners (tinted background, coloured icon)', () => {
    for (const color of [c.primary, c.success, c.warning, c.danger]) {
      for (const surface of [c.card, c.bg]) {
        const tint = flatten(color + '1A', surface);
        expect(contrastRatio(c.text, tint)).toBeGreaterThanOrEqual(AA_TEXT);
        expect(contrastRatio(color, tint)).toBeGreaterThanOrEqual(AA_GRAPHIC);
      }
    }
  });

  it('demo banner on the warning colour', () => {
    expect(contrastRatio(readableOn(c.warning), c.warning)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it('selected chips stay readable for every category colour', () => {
    for (const cat of builtIn) {
      expect(contrastRatio(c.text, flatten(cat.color + '2E', c.card))).toBeGreaterThanOrEqual(AA_TEXT);
    }
  });

  it('tab icons and swipe actions are visible', () => {
    expect(contrastRatio(c.textFaint, c.card)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    expect(contrastRatio(c.primaryText, c.primary)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    expect(contrastRatio(readableOn(c.danger), c.danger)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });
});

describe('avatar initials', () => {
  it.each(MEMBER_COLORS)('readable on %s', (color) => {
    expect(contrastRatio(readableOn(color), color)).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe('contrast helpers', () => {
  it('match the WCAG reference values', () => {
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
    expect(flatten('#00000080', '#FFFFFF')).toBe('#7f7f7f');
    expect(readableOn('#FFFFFF')).toBe('#11142D');
    expect(readableOn('#11142D')).toBe('#FFFFFF');
  });
});

describe('withTripTheme', () => {
  it('falls back to the default colours for no or unknown theme', () => {
    expect(withTripTheme(themes.light, 'light', null)).toBe(themes.light);
    expect(withTripTheme(themes.light, 'light', 'neon')).toBe(themes.light);
    expect(withTripTheme(themes.dark, 'dark', 'green').primary).toBe(TRIP_THEMES.green.dark.primary);
  });
});

