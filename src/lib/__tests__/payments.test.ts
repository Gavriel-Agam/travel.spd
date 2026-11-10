import { describe, expect, it } from 'vitest';
import type { TFunction } from 'i18next';
import { cleanPaymentName, isBuiltinPayment, paymentColor, paymentLabel } from '../payments';

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

  it('gives every method a steady chart colour', () => {
    expect(paymentColor('PayPal', '#000')).toBe(paymentColor('PayPal', '#000'));
    expect(paymentColor('unknown', '#123456')).toBe('#123456');
    expect(paymentColor('bit', '#000')).toMatch(/^#/);
  });
});
