import { describe, expect, it } from 'vitest';
import {
  applyBudgetChanges,
  applyCategoryChanges,
  applyMemberChanges,
  applyTripChanges,
  isExpenseItem,
  mergeChange,
} from '../pendingChanges';
import { lastPaymentFor } from '../payments';
import type { CategoryItem, OutboxItem, OverrideItem, TripItem } from '@/store/outbox';
import type { Budget, Category, Member, Trip } from '@/types/db';

const base = { tripId: 't1', createdBy: 'u', queuedAt: '2026-11-15T10:00:00Z' };
const trip = { id: 't1', name: 'Thailand', category_order: null, payment_methods: [] } as unknown as Trip;
const builtin = (key: string, extra: Partial<Category> = {}): Category =>
  ({ id: `b-${key}`, trip_id: null, key, name: key, icon: '🏷️', color: '#000000', sort_order: 1, archived: false, ...extra }) as Category;

describe('settings changes queued on the device', () => {
  it('merges a second change to the same thing; the later values win', () => {
    const a: TripItem = { ...base, kind: 'trip', clientId: 'trip:t1', patch: { payment_methods: ['PayPal'] } };
    const b: TripItem = { ...base, kind: 'trip', clientId: 'trip:t1', queuedAt: 'later', patch: { category_order: ['x'] } };
    expect(mergeChange(a, b)).toMatchObject({ queuedAt: 'later', patch: { payment_methods: ['PayPal'], category_order: ['x'] } });
  });

  it('a category added offline and then edited is still created', () => {
    const add: CategoryItem = { ...base, kind: 'category', clientId: 'cat:n', categoryId: 'n', create: true, fields: { name: 'Spa', archived: false } };
    const edit: CategoryItem = { ...base, kind: 'category', clientId: 'cat:n', categoryId: 'n', create: false, fields: { color: '#FF0000' } };
    expect(mergeChange(add, edit)).toMatchObject({ create: true, fields: { name: 'Spa', color: '#FF0000', archived: false } });
  });

  it('a reset wipes earlier edits of a built-in; edits after it keep the reset', () => {
    const edit: OverrideItem = { ...base, kind: 'override', clientId: 'o', categoryId: 'b-health', reset: false, fields: { color: '#111111' } };
    const reset: OverrideItem = { ...edit, reset: true, fields: {} };
    expect(mergeChange(edit, reset)).toMatchObject({ reset: true, fields: {} });
    expect(mergeChange(reset, { ...edit, fields: { hidden: true } })).toMatchObject({ reset: true, fields: { hidden: true } });
  });

  it('shows trip changes at once', () => {
    const item: TripItem = { ...base, kind: 'trip', clientId: 'trip:t1', patch: { theme_color: 'green' } };
    expect(applyTripChanges([trip], [item])[0].theme_color).toBe('green');
    expect(applyTripChanges([trip], [{ ...item, tripId: 'other' }])[0].theme_color).toBeUndefined();
  });

  it('shows category edits, a new category, and a reset back to the built-in', () => {
    const list = [builtin('health', { name: 'Doctors', renamed: true, color: '#123456', edited: true }), builtin('shopping')];
    const items: OutboxItem[] = [
      { ...base, kind: 'override', clientId: 'o1', categoryId: 'b-health', reset: true, fields: {} },
      { ...base, kind: 'override', clientId: 'o2', categoryId: 'b-shopping', reset: false, fields: { color: '#00FF00', hidden: true } },
      { ...base, kind: 'category', clientId: 'cat:n', categoryId: 'n', create: true, fields: { name: 'Spa', icon: '💆', color: '#FF00FF', image: null, archived: false } },
    ];
    const out = applyCategoryChanges(list, items, 't1');
    const health = out.find((c) => c.id === 'b-health')!;
    expect(health).toMatchObject({ name: 'Health', color: '#EF4444', renamed: false, edited: false, hidden: false });
    expect(out.find((c) => c.id === 'b-shopping')).toMatchObject({ color: '#00FF00', hidden: true, edited: true });
    expect(out.find((c) => c.id === 'n')).toMatchObject({ trip_id: 't1', name: 'Spa', icon: '💆', archived: false });
    // Another trip's queue changes nothing here
    expect(applyCategoryChanges(list, items, 't2')).toBe(list);
  });

  it('a budget set or removed offline', () => {
    const budgets = [{ id: 'b1', trip_id: 't1', scope: 'total', category_id: null, member_id: null, amount_ils_minor: 500000 } as Budget];
    const set = applyBudgetChanges(budgets, [{ ...base, kind: 'budget', clientId: 'x', scope: 'total', categoryId: null, memberId: null, amount: 700000 }], 't1');
    expect(set).toEqual([{ ...budgets[0], amount_ils_minor: 700000 }]);
    expect(applyBudgetChanges(budgets, [{ ...base, kind: 'budget', clientId: 'x', scope: 'total', categoryId: null, memberId: null, amount: null }], 't1')).toEqual([]);
  });

  it('your own name changed offline', () => {
    const members = [{ id: 'm1', display_name: 'Noa' } as Member, { id: 'm2', display_name: 'Dan' } as Member];
    const out = applyMemberChanges(members, [{ ...base, kind: 'member', clientId: 'member:m1', memberId: 'm1', patch: { display_name: 'Noa B' } }]);
    expect(out.map((m) => m.display_name)).toEqual(['Noa B', 'Dan']);
  });

  it('expense changes and settings changes are told apart', () => {
    expect(isExpenseItem({ ...base, clientId: 'c', payload: {} } as OutboxItem)).toBe(true);
    expect(isExpenseItem({ ...base, kind: 'trip', clientId: 'trip:t1', patch: {} })).toBe(false);
  });
});

describe('payment method a new expense starts with', () => {
  it('the last one used in this trip, else the last one anywhere that this trip offers', () => {
    expect(lastPaymentFor({ t1: 'cash' }, 'card', 't1', [])).toBe('cash');
    expect(lastPaymentFor({}, 'bit', 't1', [])).toBe('bit');
    // Another trip's own method isn't offered here
    expect(lastPaymentFor({}, 'PayPal', 't1', [])).toBeNull();
    expect(lastPaymentFor({}, 'PayPal', 't1', ['PayPal'])).toBe('PayPal');
    // A method that was removed from the trip (or bank transfer, no longer offered) falls back
    expect(lastPaymentFor({ t1: 'Revolut' }, 'card', 't1', [])).toBe('card');
    expect(lastPaymentFor({ t1: 'transfer' }, null, 't1', [])).toBeNull();
  });
});
