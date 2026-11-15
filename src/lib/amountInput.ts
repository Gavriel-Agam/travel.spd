// Money fields while typing: digits and one decimal point, cut to the
// currency's decimals, with thousands separators as you type (1234 -> 1,234).
// parseAmount ignores the commas, so the shown text can be parsed as is.

/**
 * A comma typed at the very end of a number with no decimal point yet is the
 * decimal separator of the phone's keyboard (some keyboards have "," instead
 * of "."), not a thousands separator.
 */
function normalize(raw: string): string {
  return /,$/.test(raw) && !raw.includes('.') ? `${raw.slice(0, -1)}.` : raw;
}

/** "1234567.5" -> "1,234,567.5" (the decimal part is left as typed). */
export function groupThousands(plain: string): string {
  const [whole, ...rest] = plain.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return rest.length ? `${grouped}.${rest.join('')}` : grouped;
}

/** The text to show after a keystroke: clean, cut to `decimals`, grouped. */
export function formatAmountTyping(raw: string, decimals: number): string {
  const clean = normalize(raw).replace(/[^\d.]/g, '');
  const [whole, ...rest] = clean.split('.');
  if (rest.length === 0 || decimals === 0) return groupThousands(whole);
  return `${groupThousands(whole)}.${rest.join('').slice(0, decimals)}`;
}

/** How many digits and decimal points come before position `at` (commas don't count). */
export function unitsBefore(raw: string, at: number): number {
  return (normalize(raw).slice(0, at).match(/[\d.]/g) ?? []).length;
}

/** The caret position in `text` just after its first `units` digits / decimal point. */
export function caretAfterUnits(text: string, units: number): number {
  if (units <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < text.length; i++) {
    if (/[\d.]/.test(text[i])) seen++;
    if (seen === units) return i + 1;
  }
  return text.length;
}
