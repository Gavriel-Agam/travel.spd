import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { BUILTIN_PAYMENTS, cleanPaymentName, fitInRow, isBuiltinPayment, paymentColor, paymentIcon, paymentLabel } from '../payments';

const names: Record<string, string> = { 'payment.card': 'כרטיס', 'payment.cash': 'מזומן', 'payment.bit': 'ביט', 'payment.transfer': 'העברה' };
const t = ((k: string) => names[k] ?? k) as unknown as TFunction;

describe('payment methods', () => {
  it('translates built-ins (Bit included) and shows custom names as typed', () => {
    expect(paymentLabel('bit', t)).toBe('ביט');
    expect(paymentLabel('PayPal', t)).toBe('PayPal');
    expect(isBuiltinPayment('other')).toBe(true);
    expect(isBuiltinPayment('Revolut')).toBe(false);
  });

  it('cleans a new name and refuses empty, too long, built-in or duplicate names', () => {
    expect(cleanPaymentName('  Pay   Pal ', [], t)).toBe('Pay Pal');
    expect(cleanPaymentName('', [], t)).toBeNull();
    expect(cleanPaymentName('x'.repeat(31), [], t)).toBeNull();
    expect(cleanPaymentName('ביט', [], t)).toBeNull();
    expect(cleanPaymentName('BIT', [], t)).toBeNull();
    expect(cleanPaymentName('paypal', ['PayPal'], t)).toBeNull();
  });

  it('no longer offers bank transfer, but older expenses still show it', () => {
    expect(BUILTIN_PAYMENTS.map((p) => p.key)).toEqual(['card', 'cash', 'bit']);
    expect(paymentLabel('transfer', t)).toBe('העברה');
    expect(paymentIcon('transfer')).toBe('🏦');
    expect(cleanPaymentName('העברה', [], t)).toBeNull();
  });

  it('fits the chips on one line and keeps the chosen one in view', () => {
    const w = { card: 80, cash: 80, bit: 60, PayPal: 90, Revolut: 100 };
    const keys = ['card', 'cash', 'bit', 'PayPal', 'Revolut'];
    // 80 + 8 + 80 + 8 + 60 = 236 fits in 250; PayPal would need 334
    expect(fitInRow(keys, w, 250, 8, null)).toEqual(['card', 'cash', 'bit']);
    expect(fitInRow(keys, w, 1000, 8, null)).toEqual(keys);
    // Revolut chosen: it replaces the last chips until it fits
    expect(fitInRow(keys, w, 250, 8, 'Revolut')).toEqual(['card', 'Revolut']);
    expect(fitInRow(keys, w, 300, 8, 'Revolut')).toEqual(['card', 'cash', 'Revolut']);
    expect(fitInRow(keys, w, 120, 8, 'Revolut')).toEqual(['Revolut']);
    expect(fitInRow(keys, w, 50, 8, null)).toEqual([]);
  });

  it('gives every method a steady chart colour', () => {
    expect(paymentColor('PayPal', '#000')).toBe(paymentColor('PayPal', '#000'));
    expect(paymentColor('unknown', '#123456')).toBe('#123456');
    expect(paymentColor('bit', '#000')).toMatch(/^#/);
  });
});
