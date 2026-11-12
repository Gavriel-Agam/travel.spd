import { describe, expect, it } from 'vitest';
import { nextDayOrder, orderDay } from '../expenseOrder';

const day = [{ id: 'd' }, { id: 'c' }, { id: 'b' }, { id: 'a' }]; // newest first

describe('order of a day’s expenses', () => {
  it('stays newest first until arranged by hand', () => {
    expect(orderDay(day, undefined).map((e) => e.id)).toEqual(['d', 'c', 'b', 'a']);
    expect(orderDay(day, []).map((e) => e.id)).toEqual(['d', 'c', 'b', 'a']);
  });

  it('follows the order set by hand; expenses added since come first', () => {
    expect(orderDay(day, ['a', 'b', 'c', 'd']).map((e) => e.id)).toEqual(['a', 'b', 'c', 'd']);
    // "d" was added after the order was set, and "x" (in the order) was deleted since
    expect(orderDay(day, ['b', 'x', 'a', 'c']).map((e) => e.id)).toEqual(['d', 'b', 'a', 'c']);
  });

  it('dragging among the visible ones (a search hides some) keeps the hidden ones in place', () => {
    // Full day a b c d; search shows a and c; drag c above a
    expect(nextDayOrder(['a', 'b', 'c', 'd'], ['c', 'a'])).toEqual(['c', 'b', 'a', 'd']);
    expect(nextDayOrder(['a', 'b'], ['b', 'a'])).toEqual(['b', 'a']);
  });
});
