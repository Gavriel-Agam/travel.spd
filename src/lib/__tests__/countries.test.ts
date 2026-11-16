import { describe, expect, it } from 'vitest';
import { COUNTRY_CODES, countryFlag, searchCountries } from '../countries';
import { VAT_RULES } from '../taxFree';

describe('countries', () => {
  it('every country with VAT rules is in the list, codes are unique', () => {
    for (const r of VAT_RULES) expect(COUNTRY_CODES).toContain(r.country);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
  });
  it('search by English or Hebrew name, or by code', () => {
    expect(searchCountries('thai', 'en')[0]).toBe('TH');
    expect(searchCountries('יפ', 'he')).toContain('JP');
    expect(searchCountries('it', 'en')[0]).toBe('IT');
    expect(searchCountries('', 'en').length).toBe(COUNTRY_CODES.length);
  });
  it('flags', () => {
    expect(countryFlag('th')).toBe('🇹🇭');
  });
});
