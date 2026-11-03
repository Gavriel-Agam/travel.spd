// All money is integer minor units (agorot, satang, ...). Conversions go through
// decimal.js with the same rounding as the database (half away from zero).
import Decimal from 'decimal.js';
import { getCurrency, HOME_CURRENCY } from './currencies';

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

/** Max digits after the decimal point the user may type for a currency. */
export function maxDecimals(code: string) {
  return getCurrency(code).minor_units;
}

/** "1,250.5" -> 125050 for a 2-decimal currency. Returns null for invalid/empty input. */
export function parseAmount(input: string, code: string): number | null {
  const clean = input.replace(/[\s,]/g, '');
  if (!/^\d+(\.\d*)?$/.test(clean)) return null;
  const units = maxDecimals(code);
  const [, frac = ''] = clean.split('.');
  if (frac.length > units) return null;
  const minor = new Decimal(clean).mul(new Decimal(10).pow(units));
  if (!minor.isInteger() || minor.lte(0) || minor.gte(1e15)) return null;
  return minor.toNumber();
}

/** Typing filter: digits and one decimal point, cut to the currency's decimals (none for VND, JPY...). */
export function clampDecimals(input: string, decimals: number): string {
  const clean = input.replace(',', '.').replace(/[^\d.]/g, '');
  const [whole, ...rest] = clean.split('.');
  if (rest.length === 0) return whole;
  return decimals === 0 ? whole : `${whole}.${rest.join('').slice(0, decimals)}`;
}

/** 125050 -> "1250.5" (plain, for editing). */
export function minorToInput(minor: number, code: string): string {
  const units = maxDecimals(code);
  return new Decimal(minor).div(new Decimal(10).pow(units)).toFixed();
}

/** Home-currency minor units for an amount, using a rate of "home per 1 unit". */
export function convertToHomeMinor(amountMinor: number, code: string, rate: string | number): number {
  if (code === HOME_CURRENCY) return amountMinor;
  const units = maxDecimals(code);
  return new Decimal(amountMinor)
    .div(new Decimal(10).pow(units))
    .mul(new Decimal(rate))
    .mul(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
}

/** Inverse rate for display: "1 ₪ = 10.79 ฿". */
export function invertRate(rate: string, digits = 4): string {
  return new Decimal(1).div(new Decimal(rate)).toDecimalPlaces(digits).toFixed();
}

/**
 * Manual rates can be typed either way round ("₪ per 1 ฿" or "฿ per 1 ₪");
 * storage is always home currency per 1 unit, to 10 decimal places.
 */
export function rateFromInput(input: string, direction: 'homePerUnit' | 'unitsPerHome'): string | null {
  const v = input.trim();
  if (!isValidRate(v)) return null;
  if (direction === 'homePerUnit') return new Decimal(v).toDecimalPlaces(10).toFixed();
  return new Decimal(1).div(new Decimal(v)).toDecimalPlaces(10).toFixed();
}

/** "0.092747392700" -> "0.0927473927" (drops trailing zeros). */
export function trimRate(rate: string): string {
  return new Decimal(rate).toFixed();
}

/**
 * Human-friendly rate: whichever direction reads as a number above 1.
 * 0.0927 THB -> "1 ₪ = 10.78 ฿"; 3.65 EUR -> "1 € = 3.65 ₪".
 */
export function formatRate(rate: string, code: string, symbol = getCurrency(code).symbol): string {
  const r = new Decimal(rate);
  // Display only: grouped digits ("8,202.5"), at most 4 decimals
  const fmt = (d: Decimal) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(d.toNumber());
  if (r.gte(1)) return `1 ${symbol} = ${fmt(r.toDecimalPlaces(4))} ₪`;
  return `1 ₪ = ${fmt(new Decimal(1).div(r).toSignificantDigits(5))} ${symbol}`;
}

export type RateDirection = 'homePerUnit' | 'unitsPerHome';

export function isValidRate(input: string) {
  return /^\d+(\.\d+)?$/.test(input.trim()) && new Decimal(input.trim()).gt(0);
}

type FormatOpts = { lang?: string; compact?: boolean; withSymbol?: boolean; forceDecimals?: boolean };

/**
 * 125050 THB -> "1,250.50 ฿". Decimals are hidden when they are zero
 * (unless forceDecimals), which keeps lists calm: "1,250 ฿".
 */
export function formatMoney(minor: number, code: string, opts: FormatOpts = {}): string {
  const c = getCurrency(code);
  const value = new Decimal(minor).div(new Decimal(10).pow(c.minor_units));
  const hasFraction = !value.isInteger();
  const locale = opts.lang === 'he' ? 'he-IL' : 'en-US';
  let text: string;
  if (opts.compact && value.abs().gte(10000)) {
    text = new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(value.toNumber());
  } else {
    const digits = hasFraction || opts.forceDecimals ? c.minor_units : 0;
    text = new Intl.NumberFormat(locale, { minimumFractionDigits: digits, maximumFractionDigits: digits }).format(
      // toNumber is safe here: display only, values < 1e13
      value.toNumber(),
    );
  }
  return opts.withSymbol === false ? text : `${text} ${c.symbol}`;
}

/** "1,250 ฿ ≈ 125 ₪", or just "125 ₪" for home-currency amounts. */
export function formatDual(amountMinor: number, code: string, homeMinor: number, lang?: string) {
  if (code === HOME_CURRENCY) return formatMoney(homeMinor, HOME_CURRENCY, { lang });
  return `${formatMoney(amountMinor, code, { lang })} ≈ ${formatMoney(homeMinor, HOME_CURRENCY, { lang })}`;
}

export function sumMinor(values: number[]) {
  return values.reduce((t, v) => t + v, 0);
}

/** Percentage 0..100+ with one decimal, safe for zero budgets. */
export function percent(part: number, whole: number) {
  if (whole <= 0) return 0;
  return new Decimal(part).div(whole).mul(100).toDecimalPlaces(1).toNumber();
}
