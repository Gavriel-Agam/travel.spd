// Tax free shopping (VAT refund) and the card's foreign-transaction fee.
//
// VAT refund rules per country: the standard VAT rate and the minimum spend
// to qualify. Figures as published by Global Blue's country pages
// (globalblue.com, "How to shop Tax Free", checked 16 Nov 2026); Thailand from
// its own VAT refund scheme (7%, 2,000 THB per store per day). Countries whose
// figures we couldn't confirm are left out (no estimate) rather than guessed.
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
  /** The minimum is per store per day (receipts of one shop on one day add up) or per receipt */
  per: 'storeDay' | 'receipt';
  /** Japan: the minimum is counted before tax */
  minBeforeTax?: boolean;
};

export const VAT_RULES: VatRule[] = [
  { country: 'TH', currency: 'THB', vat: 7, min: 2000, per: 'storeDay' },
  { country: 'JP', currency: 'JPY', vat: 10, min: 5000, per: 'storeDay', minBeforeTax: true },
  { country: 'KR', currency: 'KRW', vat: 10, min: 15000, per: 'receipt' },
  { country: 'SG', currency: 'SGD', vat: 9, min: 100, per: 'receipt' },
  { country: 'TR', currency: 'TRY', vat: 20, min: 1000, per: 'receipt' },
  { country: 'CH', currency: 'CHF', vat: 8.1, min: 300, per: 'receipt' },
  { country: 'CZ', currency: 'CZK', vat: 21, min: 2001, per: 'receipt' },
  { country: 'FR', currency: 'EUR', vat: 20, min: 100, per: 'storeDay' },
  { country: 'IT', currency: 'EUR', vat: 22, min: 70.01, per: 'receipt' },
  { country: 'ES', currency: 'EUR', vat: 21, min: 0, per: 'receipt' },
  { country: 'DE', currency: 'EUR', vat: 19, min: 50.01, per: 'receipt' },
  { country: 'GR', currency: 'EUR', vat: 24, min: 50, per: 'receipt' },
  { country: 'NL', currency: 'EUR', vat: 21, min: 50, per: 'receipt' },
  { country: 'PT', currency: 'EUR', vat: 23, min: 61.5, per: 'receipt' },
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
  const all = VAT_RULES.filter((r) => r.currency === currency);
  return all.length === 1 ? all[0].country : null;
}

/** Countries a purchase in `currency` may belong to (for a picker when there's more than one). */
export function countriesForCurrency(currency: string, tripCountries: readonly string[] = []): string[] {
  const own = tripCountries.filter((c) => vatRule(c)?.currency === currency);
  return own.length ? own : VAT_RULES.filter((r) => r.currency === currency).map((r) => r.country);
}

export type TaxFreeEstimate =
  | { status: 'eligible'; refundHomeMinor: number; rule: VatRule }
  | { status: 'belowMin'; rule: VatRule }
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
    else noRule++;
  }
  return { total, count, belowMin, noRule };
}

// ---------------------------------------------------------------- card fee

/** The card's foreign-transaction fee (%) that applies to an expense: paid by card, in a foreign currency. */
export function cardFeeFor(paymentMethod: string | null | undefined, currency: string, homeCurrency: string, tripFeePct: number | string | null | undefined): number {
  const pct = Number(tripFeePct ?? 0);
  return paymentMethod === 'card' && currency !== homeCurrency && pct > 0 ? pct : 0;
}

/** A home amount with the fee added (rounded like the server). */
export function withFee(homeMinor: number, feePct: number): number {
  return feePct > 0 ? Math.round((homeMinor * (100 + feePct)) / 100) : homeMinor;
}
