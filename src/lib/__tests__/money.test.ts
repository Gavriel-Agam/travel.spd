import { describe, expect, it } from 'vitest';
import { convertToHomeMinor, formatDual, formatMoney, formatRate, invertRate, minorToInput, parseAmount, percent, rateFromInput, trimRate } from '../money';
import { orderForPicker, searchCurrencies, BUNDLED_CURRENCIES } from '../currencies';

describe('parseAmount', () => {
  it('parses into minor units per currency', () => {
    expect(parseAmount('1250', 'THB')).toBe(125000);
    expect(parseAmount('1,250.5', 'THB')).toBe(125050);
    expect(parseAmount('0.1', 'USD')).toBe(10);
    expect(parseAmount('250000', 'VND')).toBe(250000);
    expect(parseAmount('1.234', 'JOD')).toBe(1234);
  });
  it('rejects invalid input', () => {
    expect(parseAmount('', 'THB')).toBeNull();
    expect(parseAmount('0', 'THB')).toBeNull();
    expect(parseAmount('1.234', 'THB')).toBeNull();
    expect(parseAmount('12.5', 'JPY')).toBeNull();
    expect(parseAmount('-3', 'THB')).toBeNull();
    expect(parseAmount('abc', 'THB')).toBeNull();
  });
  it('avoids floating point drift', () => {
    expect(parseAmount('0.29', 'USD')).toBe(29); // 0.29 * 100 = 28.999999999999996 in floats
    expect(parseAmount('1.15', 'EUR')).toBe(115);
  });
  it('round-trips through the edit field', () => {
    expect(minorToInput(125050, 'THB')).toBe('1250.5');
    expect(minorToInput(250000, 'VND')).toBe('250000');
  });
});

describe('convertToHomeMinor', () => {
  it('matches the database cases', () => {
    expect(convertToHomeMinor(125000, 'THB', '0.1')).toBe(12500);
    expect(convertToHomeMinor(250000, 'VND', '0.000146')).toBe(3650);
    expect(convertToHomeMinor(100000, 'THB', '0.1033')).toBe(10330);
  });
  it('rounds half away from zero', () => {
    expect(convertToHomeMinor(5, 'THB', '0.1')).toBe(1); // 0.005 ILS -> 0.01
    expect(convertToHomeMinor(4, 'THB', '0.1')).toBe(0);
  });
  it('keeps home currency at par', () => {
    expect(convertToHomeMinor(12345, 'ILS', '3.7')).toBe(12345);
  });
  it('is exact for long rates', () => {
    // 3.495 / 37.683 = 0.0927473927...; 1,250 THB -> 115.93 ILS
    expect(convertToHomeMinor(125000, 'THB', '0.0927473927')).toBe(11593);
  });
});

describe('formatting', () => {
  it('formats with symbol and hides zero decimals', () => {
    expect(formatMoney(125000, 'THB')).toBe('1,250 ฿');
    expect(formatMoney(125050, 'THB')).toBe('1,250.50 ฿');
    expect(formatMoney(12500, 'ILS')).toBe('125 ₪');
  });
  it('shows both currencies', () => {
    expect(formatDual(125000, 'THB', 12500)).toBe('1,250 ฿ ≈ 125 ₪');
    expect(formatDual(12500, 'ILS', 12500)).toBe('125 ₪');
  });
  it('inverts rates for display', () => {
    expect(invertRate('0.1')).toBe('10');
  });
  it('computes percent safely', () => {
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(5, 0)).toBe(0);
  });
});

describe('currency picker', () => {
  it('searches by code, name, Hebrew name and symbol', () => {
    expect(searchCurrencies(BUNDLED_CURRENCIES, 'thb')[0].code).toBe('THB');
    expect(searchCurrencies(BUNDLED_CURRENCIES, 'baht')[0].code).toBe('THB');
    expect(searchCurrencies(BUNDLED_CURRENCIES, 'שקל')[0].code).toBe('ILS');
    expect(searchCurrencies(BUNDLED_CURRENCIES, '€')[0].code).toBe('EUR');
    expect(searchCurrencies(BUNDLED_CURRENCIES, 'zzz')).toHaveLength(0);
  });
  it('orders recent, then frequent, then the rest without duplicates', () => {
    const { recent, frequent, all } = orderForPicker(BUNDLED_CURRENCIES, ['THB', 'USD'], { THB: 10, EUR: 3, USD: 1 });
    expect(recent.map((c) => c.code)).toEqual(['THB', 'USD']);
    expect(frequent.map((c) => c.code)).toEqual(['EUR']);
    expect(all.some((c) => ['THB', 'USD', 'EUR'].includes(c.code))).toBe(false);
    expect(recent.length + frequent.length + all.length).toBe(BUNDLED_CURRENCIES.length);
  });
});

describe('manual rates', () => {
  it('accepts either direction and stores home per unit', () => {
    expect(rateFromInput('0.0927', 'homePerUnit')).toBe('0.0927');
    expect(rateFromInput('10.78', 'unitsPerHome')).toBe('0.0927643785');
    expect(rateFromInput('28000', 'unitsPerHome')).toBe('0.0000357143');
    expect(rateFromInput('0', 'unitsPerHome')).toBeNull();
    expect(rateFromInput('abc', 'homePerUnit')).toBeNull();
  });
  it('formats the readable direction', () => {
    expect(formatRate('0.0927473927', 'THB')).toBe('1 ₪ = 10.782 ฿');
    expect(formatRate('3.65', 'EUR')).toBe('1 € = 3.65 ₪');
    expect(trimRate('0.092747392700')).toBe('0.0927473927');
  });
});
