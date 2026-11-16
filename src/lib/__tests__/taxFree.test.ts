import { describe, expect, it } from 'vitest';
import { cardFeeFor, countriesForCurrency, countryForCurrency, estimateRefund, tripRefundTotal, withFee } from '../taxFree';

describe('card foreign-transaction fee', () => {
  it('only on card payments in a foreign currency', () => {
    expect(cardFeeFor('card', 'THB', 'ILS', 2.5)).toBe(2.5);
    expect(cardFeeFor('card', 'ILS', 'ILS', 2.5)).toBe(0);
    expect(cardFeeFor('cash', 'THB', 'ILS', 2.5)).toBe(0);
    expect(cardFeeFor('card', 'THB', 'ILS', null)).toBe(0);
    expect(cardFeeFor('card', 'THB', 'ILS', '1.5')).toBe(1.5);
  });
  it('adds to the home amount like the server', () => {
    expect(withFee(10000, 2.5)).toBe(10250);
    expect(withFee(10000, 0)).toBe(10000);
  });
});

describe('tax free refund estimate', () => {
  it('finds the country from the currency, or the trip destinations', () => {
    expect(countryForCurrency('THB')).toBe('TH');
    expect(countryForCurrency('EUR')).toBeNull();
    expect(countryForCurrency('EUR', ['TH', 'IT'])).toBe('IT');
    expect(countriesForCurrency('EUR', ['TH', 'IT', 'FR'])).toEqual(['IT', 'FR']);
    expect(countriesForCurrency('EUR')).toContain('GR');
  });
  it('VAT inside the price, above the minimum', () => {
    // 3,000 THB = ₪300 → 7/107 of it
    expect(estimateRefund({ amountMinor: 300000, currency: 'THB', minorUnits: 2, homeMinor: 30000, country: 'TH' })).toMatchObject({ status: 'eligible', refundHomeMinor: 1963 });
    expect(estimateRefund({ amountMinor: 150000, currency: 'THB', minorUnits: 2, homeMinor: 15000, country: 'TH' }).status).toBe('belowMin');
    expect(estimateRefund({ amountMinor: 100, currency: 'EUR', minorUnits: 2, homeMinor: 400, country: 'ES' }).status).toBe('eligible');
    expect(estimateRefund({ amountMinor: 100, currency: 'EUR', minorUnits: 2, homeMinor: 400, country: 'VN' }).status).toBe('noRule');
    // Austria: 75.01 EUR per receipt; the UK: no tax free in stores since 2021
    expect(estimateRefund({ amountMinor: 7500, currency: 'EUR', minorUnits: 2, homeMinor: 30000, country: 'AT' }).status).toBe('belowMin');
    expect(estimateRefund({ amountMinor: 50000, currency: 'GBP', minorUnits: 2, homeMinor: 230000, country: 'GB' }).status).toBe('noRefund');
    expect(countryForCurrency('GBP')).toBeNull();
    expect(countryForCurrency('GBP', ['GB'])).toBe('GB');
  });
  it('Japan counts the minimum before tax; the card fee is not VAT', () => {
    expect(estimateRefund({ amountMinor: 5400, currency: 'JPY', minorUnits: 0, homeMinor: 13000, country: 'JP' }).status).toBe('belowMin');
    expect(estimateRefund({ amountMinor: 5500, currency: 'JPY', minorUnits: 0, homeMinor: 13000, country: 'JP' }).status).toBe('eligible');
    const plain = estimateRefund({ amountMinor: 300000, currency: 'THB', minorUnits: 2, homeMinor: 30000, country: 'TH' });
    const card = estimateRefund({ amountMinor: 300000, currency: 'THB', minorUnits: 2, homeMinor: 30750, feePct: 2.5, country: 'TH' });
    expect(card).toEqual(plain);
  });
  it('adds up the trip', () => {
    const e = (x: object) => ({ tax_free: true, vat_country: 'TH', amount_minor: 300000, currency: 'THB', amount_ils_minor: 30000, ...x });
    const out = tripRefundTotal([e({}), e({}), e({ amount_minor: 1000 }), e({ tax_free: false }), e({ deleted_at: 'x' }), e({ vat_country: null })], () => 2);
    expect(out).toEqual({ total: 3926, count: 2, belowMin: 1, noRule: 1 });
  });
});
