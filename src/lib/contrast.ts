// WCAG 2.1 contrast helpers. Text needs 4.5:1 against its background (3:1 for
// large text and for icons, bars and other graphics).

function channel(v: number) {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function parse(hex: string): [number, number, number, number] {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = (i: number) => parseInt(full.slice(i, i + 2), 16);
  return [n(0), n(2), n(4), full.length === 8 ? n(6) / 255 : 1];
}

/** A colour with transparency, flattened onto the background behind it. */
export function flatten(fg: string, bg: string): string {
  const [r, g, b, a] = parse(fg);
  const [R, G, B] = parse(bg);
  const mix = (x: number, y: number) => Math.round(x * a + y * (1 - a)).toString(16).padStart(2, '0');
  return `#${mix(r, R)}${mix(g, G)}${mix(b, B)}`;
}

export function luminance(hex: string) {
  const [r, g, b] = parse(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string) {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

export const ON_DARK = '#FFFFFF';
export const ON_LIGHT = '#11142D';

/** White or near-black, whichever reads better on this background. */
export function readableOn(bg: string) {
  return contrastRatio(ON_DARK, bg) >= contrastRatio(ON_LIGHT, bg) ? ON_DARK : ON_LIGHT;
}
