import { describe, expect, it } from 'vitest';
import { isPrivateExpense, personalTotal } from '../settlement';
import { feeFromInput, feeToInput, meetsVatMinimum } from '../taxFree';

const me = 'me';
const you = 'you';
const ex = (o: { split_type: string; amount: number; payer?: string | null; splits: string[]; kind?: string; deleted?: boolean }) => ({
  kind: o.kind ?? 'expense',
  split_type: o.split_type,
  amount_ils_minor: o.amount,
  paid_by_member_id: o.payer === undefined ? me : o.payer,
  deleted_at: o.deleted ? '2026-11-16T00:00:00Z' : null,
  splits: o.splits.map((member_id) => ({ member_id })),
});

describe('your share: personal expenses only', () => {
  const list = [
    ex({ split_type: 'equal', amount: 10000, splits: [me, you] }), // shared: left out
    ex({ split_type: 'treat', amount: 5000, splits: [me] }), // a treat is shared spending: left out
    ex({ split_type: 'percent', amount: 3000, splits: [me, you] }),
    ex({ split_type: 'personal', amount: 1200, splits: [me] }), // mine, I paid
    ex({ split_type: 'personal', amount: 800, payer: you, splits: [me] }), // mine, you paid
    ex({ split_type: 'personal', amount: 999, splits: [you] }), // yours
    ex({ split_type: 'personal', amount: 700, splits: [me], deleted: true }),
    ex({ split_type: 'personal', amount: 400, splits: [me], kind: 'settlement' }),
  ];
  it('counts only expenses marked Personal for me', () => {
    expect(personalTotal(list, me)).toBe(2000);
    expect(personalTotal(list, you)).toBe(999);
  });
  it('is 0 (so Home hides it) for a couple on one joint budget', () => {
    expect(personalTotal(list.slice(0, 3), me)).toBe(0);
  });
});

describe('private expenses', () => {
  it('a personal expense its owner paid is private; paid by someone else (a debt) is not', () => {
    expect(isPrivateExpense(ex({ split_type: 'personal', amount: 1, splits: [me] }))).toBe(true);
    expect(isPrivateExpense(ex({ split_type: 'personal', amount: 1, payer: you, splits: [me] }))).toBe(false);
    expect(isPrivateExpense(ex({ split_type: 'personal', amount: 1, payer: null, splits: [me] }))).toBe(false);
    expect(isPrivateExpense(ex({ split_type: 'equal', amount: 1, splits: [me] }))).toBe(false);
  });
});

describe('card fee field', () => {
  it('0% stays 0, not empty and not the 2.5 placeholder', () => {
    expect(feeToInput(0)).toBe('0');
    expect(feeToInput('0.000')).toBe('0');
    expect(feeToInput('2.500')).toBe('2.5');
    expect(feeToInput(null)).toBe('');
    expect(feeFromInput('0')).toBe(0);
    expect(feeFromInput('')).toBeNull();
    expect(feeFromInput('1.5')).toBe(1.5);
    expect(feeFromInput('11')).toBeNaN();
  });
});

describe('VAT refund minimum', () => {
  it('reaches the minimum in the country currency', () => {
    expect(meetsVatMinimum({ amountMinor: 200000, currency: 'THB', minorUnits: 2, country: 'TH' })).toBe(true); // 2,000 THB
    expect(meetsVatMinimum({ amountMinor: 199999, currency: 'THB', minorUnits: 2, country: 'TH' })).toBe(false);
    expect(meetsVatMinimum({ amountMinor: 500000, currency: 'USD', minorUnits: 2, country: 'TH' })).toBe(false); // can't check
    expect(meetsVatMinimum({ amountMinor: 5500, currency: 'JPY', minorUnits: 0, country: 'JP' })).toBe(true); // 5,000 before tax
    expect(meetsVatMinimum({ amountMinor: 5400, currency: 'JPY', minorUnits: 0, country: 'JP' })).toBe(false);
    expect(meetsVatMinimum({ amountMinor: 100, currency: 'EUR', minorUnits: 2, country: 'ES' })).toBe(true); // any amount
    expect(meetsVatMinimum({ amountMinor: 999999, currency: 'GBP', minorUnits: 2, country: 'GB' })).toBe(false); // no refund
    expect(meetsVatMinimum({ amountMinor: null, currency: 'THB', minorUnits: 2, country: 'TH' })).toBe(false);
  });
});
