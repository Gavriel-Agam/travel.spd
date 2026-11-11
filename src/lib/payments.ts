import type { TFunction } from 'i18next';

/** Built-in payment methods, in the order they are offered. */
export const BUILTIN_PAYMENTS = [
  { key: 'card', icon: '💳', color: '#3366FF' },
  { key: 'cash', icon: '💵', color: '#22C55E' },
  { key: 'bit', icon: '📲', color: '#0BB3C5' },
] as const;

/**
 * No longer offered when adding an expense, still shown on expenses that have
 * them: bank transfer (removed from the list 2026-11-11; settle-ups are still
 * recorded as transfers) and "other".
 */
const LEGACY_PAYMENTS = [{ key: 'transfer', icon: '🏦', color: '#7A5AF8' }] as const;
const KNOWN = [...BUILTIN_PAYMENTS, ...LEGACY_PAYMENTS];

const BUILTIN_KEYS = new Set<string>(['card', 'cash', 'bit', 'transfer', 'other', 'unknown']);
const CUSTOM_COLORS = ['#F79009', '#E05BD8', '#14B8A6', '#EF4444', '#8B5CF6', '#FFB020'];

export const MAX_CUSTOM_PAYMENTS = 20;
export const PAYMENT_NAME_MAX = 30;

export function isBuiltinPayment(key: string) {
  return BUILTIN_KEYS.has(key);
}

/** Built-ins are translated; the trip's own methods show their name. */
export function paymentLabel(key: string, t: TFunction) {
  return isBuiltinPayment(key) ? t(`payment.${key}`) : key;
}

export function paymentIcon(key: string) {
  return KNOWN.find((p) => p.key === key)?.icon ?? (key === 'other' ? '🧾' : '🏷️');
}

/** A steady colour per method for charts (custom names get one from a small palette). */
export function paymentColor(key: string, fallback: string) {
  const builtin = KNOWN.find((p) => p.key === key)?.color;
  if (builtin) return builtin;
  if (key === 'other') return '#F79009';
  if (key === 'unknown') return fallback;
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return CUSTOM_COLORS[h % CUSTOM_COLORS.length];
}

/**
 * A new custom method, cleaned up, or null when it can't be added: empty, too
 * long, the name of a built-in, or already in the list (any letter case).
 */
export function cleanPaymentName(input: string, existing: readonly string[], t: TFunction): string | null {
  const name = input.trim().replace(/\s+/g, ' ');
  if (!name || name.length > PAYMENT_NAME_MAX) return null;
  const lower = name.toLocaleLowerCase();
  // Names of built-in and older methods too, so two different entries never carry the same name
  const builtinNames = KNOWN.map((p) => [p.key, t(`payment.${p.key}`)]).flat();
  if (builtinNames.some((n) => n.toLocaleLowerCase() === lower)) return null;
  if (existing.some((n) => n.toLocaleLowerCase() === lower)) return null;
  return name;
}

/**
 * The payment chips that fit on one line, in their order, with room left for
 * the "+" button; the rest are reached through it. The chosen method always
 * stays in view (it takes the place of the last ones that fit).
 */
export function fitInRow(keys: readonly string[], widths: Record<string, number>, room: number, gap: number, selected: string | null): string[] {
  const span = (list: string[]) => list.reduce((t, k) => t + (widths[k] ?? 0), 0) + gap * Math.max(0, list.length - 1);
  const out: string[] = [];
  for (const k of keys) {
    if (span([...out, k]) > room) break;
    out.push(k);
  }
  if (selected && keys.includes(selected) && !out.includes(selected)) {
    while (out.length && span([...out, selected]) > room) out.pop();
    if (span([...out, selected]) <= room) out.push(selected);
  }
  return out;
}
