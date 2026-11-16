// Tax free shopping (VAT refund) and the card's foreign-transaction fee.
//
// VAT refund rules per country: the standard VAT rate and the minimum spend
// to qualify. Sources, read 16-17 Nov 2026:
// - Global Blue's country pages (globalblue.com › How to shop Tax Free ›
//   destinations), every destination listed in its sitemap;
// - Thailand: its own VAT refund scheme (7%, 2,000 THB per store per day);
// - Australia: the ATO's Tourist Refund Scheme page (A$300 incl. GST from one
//   business, GST 10%); UAE: AED 250 per receipt, VAT 5%; Mexico: MXN 1,200
//   per shop incl. IVA (taxfree.com.mx), IVA 16%.
// The UK ended tax free shopping in stores on 31 Dec 2020 (Global Blue's UK
// page): listed with no refund. Countries whose figures we couldn't confirm
// (e.g. Vietnam, Georgia, Taiwan) are left out rather than guessed.
//
// The estimate is the VAT inside the price: amount × rate / (100 + rate). The
// refund actually paid is lower: refund companies keep a fee, and some goods or
// shops don't qualify. The app says "up to" and says so.

export type VatRule = {
  country: string;
  currency: string;
  /** Standard VAT rate, % */
  vat: number;
  /** Minimum spend in the country's currency (major units); 0 = any amount */
  min: number;
  /** The minimum counts per store per day, per receipt, or per business (all its receipts) */
  per: 'storeDay' | 'receipt' | 'business';
  /** Japan, Turkey: the minimum is counted before tax */
  minBeforeTax?: boolean;
  /** No tax free shopping in stores (UK since 2021) */
  noRefund?: boolean;
};

const r = (country: string, currency: string, vat: number, min: number, per: VatRule['per'] = 'receipt', extra: Partial<VatRule> = {}): VatRule => ({
  country,
  currency,
  vat,
  min,
  per,
  ...extra,
});

export const VAT_RULES: VatRule[] = [
  // Asia, Middle East, Oceania
  r('TH', 'THB', 7, 2000, 'storeDay'),
  r('JP', 'JPY', 10, 5000, 'storeDay', { minBeforeTax: true }),
  r('KR', 'KRW', 10, 15000),
  r('CN', 'CNY', 13, 200),
  r('SG', 'SGD', 9, 100),
  r('KZ', 'KZT', 16, 43250),
  r('SA', 'SAR', 15, 500),
  r('AE', 'AED', 5, 250),
  r('LB', 'USD', 11, 100),
  r('AU', 'AUD', 10, 300, 'business'),
  // Europe (euro)
  r('FR', 'EUR', 20, 100, 'storeDay'),
  r('IT', 'EUR', 22, 70.01),
  r('ES', 'EUR', 21, 0),
  r('DE', 'EUR', 19, 50.01),
  r('GR', 'EUR', 24, 50),
  r('NL', 'EUR', 21, 50),
  r('PT', 'EUR', 23, 61.5),
  r('AT', 'EUR', 20, 75.01),
  r('BE', 'EUR', 21, 125.01),
  r('IE', 'EUR', 23, 75),
  r('LU', 'EUR', 17, 74),
  r('FI', 'EUR', 25.5, 40),
  r('EE', 'EUR', 24, 38.01),
  r('LV', 'EUR', 21, 44),
  r('LT', 'EUR', 21, 40),
  r('SK', 'EUR', 23, 100.01),
  r('HR', 'EUR', 25, 100.01),
  r('CY', 'EUR', 19, 50),
  // Europe (other currencies)
  r('CH', 'CHF', 8.1, 300),
  r('NO', 'NOK', 25, 315),
  r('SE', 'SEK', 25, 200),
  r('DK', 'DKK', 25, 300.01),
  r('IS', 'ISK', 24, 12000),
  r('CZ', 'CZK', 21, 2001),
  r('HU', 'HUF', 27, 68001),
  r('PL', 'PLN', 23, 200),
  r('RS', 'RSD', 20, 6000),
  r('TR', 'TRY', 20, 1000, 'receipt', { minBeforeTax: true }),
  r('JE', 'GBP', 5, 100),
  r('GB', 'GBP', 20, 0, 'receipt', { noRefund: true }),
  // Africa, Americas
  r('MA', 'MAD', 20, 2000),
  r('MX', 'MXN', 16, 1200, 'business'),
  r('BS', 'USD', 10, 25),
  r('CO', 'COP', 19, 157122),
  r('PE', 'PEN', 18, 100),
  r('UY', 'UYU', 22, 600),
  r('AR', 'ARS', 21, 70),
];

const BY_COUNTRY = new Map(VAT_RULES.map((r) => [r.country, r]));
export const vatRule = (country: string | null | undefined) => (country ? BY_COUNTRY.get(country.toUpperCase()) : undefined);

/**
 * The country a purchase in `currency` was made in: one of the trip's
 * destinations that uses it, else the only country with rules that uses it
 * (THB → Thailand). Euro with no destination set: unknown (null).
 */
export function countryForCurrency(currency: string, tripCountries: readonly string[] = []): string | null {
  const own = tripCountries.find((c) => vatRule(c)?.currency === currency);
  if (own) return own;
  // Only when one listed country uses it (pounds: the UK or Jersey, so no guess)
  const all = VAT_RULES.filter((x) => x.currency === currency);
  return all.length === 1 ? all[0].country : null;
}

/** Countries a purchase in `currency` may belong to (for a picker when there's more than one). */
export function countriesForCurrency(currency: string, tripCountries: readonly string[] = []): string[] {
  const own = tripCountries.filter((c) => vatRule(c)?.currency === currency);
  return own.length ? own : VAT_RULES.filter((x) => x.currency === currency && !x.noRefund).map((x) => x.country);
}

export type TaxFreeEstimate =
  | { status: 'eligible'; refundHomeMinor: number; rule: VatRule }
  | { status: 'belowMin'; rule: VatRule }
  | { status: 'noRefund'; rule: VatRule }
  | { status: 'noRule' };

/**
 * The most a purchase can get back, in home-currency minor units.
 * `homeMinor` is the expense's home amount (may include a card fee, `feePct`,
 * which is not VAT and is taken out first).
 */
export function estimateRefund(p: {
  amountMinor: number;
  currency: string;
  minorUnits: number;
  homeMinor: number;
  feePct?: number;
  country: string | null | undefined;
}): TaxFreeEstimate {
  const rule = vatRule(p.country);
  if (!rule) return { status: 'noRule' };
  if (rule.noRefund) return { status: 'noRefund', rule };
  // The minimum can only be checked in the country's own currency
  if (p.currency === rule.currency && rule.min > 0) {
    let spent = p.amountMinor / 10 ** p.minorUnits;
    if (rule.minBeforeTax) spent = spent / (1 + rule.vat / 100);
    if (spent + 1e-9 < rule.min) return { status: 'belowMin', rule };
  }
  const price = p.homeMinor / (1 + (p.feePct ?? 0) / 100);
  return { status: 'eligible', refundHomeMinor: Math.round((price * rule.vat) / (100 + rule.vat)), rule };
}

/** The trip's total: every tax free purchase that qualifies. */
export function tripRefundTotal(
  expenses: readonly { tax_free?: boolean; vat_country?: string | null; amount_minor: number; currency: string; amount_ils_minor: number; fx_fee_pct?: number | string | null; deleted_at?: string | null; kind?: string }[],
  minorUnitsOf: (code: string) => number,
): { total: number; count: number; belowMin: number; noRule: number } {
  let total = 0;
  let count = 0;
  let belowMin = 0;
  let noRule = 0;
  for (const e of expenses) {
    if (!e.tax_free || e.deleted_at || (e.kind && e.kind !== 'expense')) continue;
    const est = estimateRefund({
      amountMinor: e.amount_minor,
      currency: e.currency,
      minorUnits: minorUnitsOf(e.currency),
      homeMinor: e.amount_ils_minor,
      feePct: Number(e.fx_fee_pct ?? 0),
      country: e.vat_country,
    });
    if (est.status === 'eligible') {
      total += est.refundHomeMinor;
      count++;
    } else if (est.status === 'belowMin') belowMin++;
    else noRule++; // no rules, or no refund there
  }
  return { total, count, belowMin, noRule };
}

// ---------------------------------------------------------------- card fee

/** The card's foreign-transaction fee (%) that applies to an expense: paid by card, in a foreign currency. */
export function cardFeeFor(paymentMethod: string | null | undefined, currency: string, homeCurrency: string, tripFeePct: number | string | null | undefined): number {
  const pct = Number(tripFeePct ?? 0);
  return paymentMethod === 'card' && currency !== homeCurrency && pct > 0 ? pct : 0;
}

/**
 * A member's card fee (%): each person sets their own (0021). Data cached by an
 * app version from before that has no member value yet: the trip's old setting.
 */
export function memberFeePct(
  member: { card_fx_fee_pct?: number | string | null } | null | undefined,
  trip: { card_fx_fee_pct?: number | string | null } | null | undefined,
): number | string | null {
  if (member && member.card_fx_fee_pct !== undefined) return member.card_fx_fee_pct;
  return trip?.card_fx_fee_pct ?? null;
}

/** A home amount with the fee added (rounded like the server). */
export function withFee(homeMinor: number, feePct: number): number {
  return feePct > 0 ? Math.round((homeMinor * (100 + feePct)) / 100) : homeMinor;
}

/**
 * Does this amount reach the country's VAT refund minimum? Only checkable in
 * the country's own currency (or when any amount qualifies). Countries with no
 * refund, or no rules, never qualify.
 */
export function meetsVatMinimum(p: { amountMinor: number | null | undefined; currency: string; minorUnits: number; country: string | null | undefined }): boolean {
  const rule = vatRule(p.country);
  if (!rule || rule.noRefund || p.amountMinor == null || p.amountMinor <= 0) return false;
  if (rule.min === 0) return true;
  if (p.currency !== rule.currency) return false;
  let spent = p.amountMinor / 10 ** p.minorUnits;
  if (rule.minBeforeTax) spent = spent / (1 + rule.vat / 100);
  return spent + 1e-9 >= rule.min;
}

/** The trip's card fee as the settings field shows it: 0 stays "0", unset is empty. */
export function feeToInput(pct: number | string | null | undefined): string {
  return pct == null || pct === '' || !Number.isFinite(Number(pct)) ? '' : String(Number(pct));
}

/** The settings field back to a fee: empty is unset (null), "0" is 0%. NaN when invalid. */
export function feeFromInput(text: string): number | null {
  const s = text.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 && n <= 10 ? n : NaN;
}
