import { describe, expect, it } from 'vitest';
import {
  autoScrollArmed,
  autoScrollSpeed,
  columnCount,
  dropPlacement,
  dropTarget,
  HOME_SECTIONS,
  layoutSyncAction,
  mergeVisibleOrder,
  moveItem,
  nextScroll,
  resolveHomeOrder,
  splitColumns,
} from '../homeLayout';

describe('moveItem', () => {
  it('moves down and up', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 1)).toEqual(['a', 'd', 'b', 'c']);
    expect(moveItem(['a', 'b'], 1, 1)).toEqual(['a', 'b']);
  });
  it('does not mutate the input', () => {
    const list = ['a', 'b'];
    moveItem(list, 0, 1);
    expect(list).toEqual(['a', 'b']);
  });
});

describe('resolveHomeOrder', () => {
  it('uses the default when nothing is saved', () => {
    expect(resolveHomeOrder(undefined)).toEqual([...HOME_SECTIONS]);
  });
  it('keeps the saved order', () => {
    const saved = ['recent', 'hero', 'trend', 'today', 'couple', 'categories'];
    expect(resolveHomeOrder(saved)).toEqual(saved);
  });
  it('drops unknown or repeated keys and appends cards added later', () => {
    expect(resolveHomeOrder(['recent', 'old-card', 'recent', 'hero'])).toEqual(['recent', 'hero', 'today', 'categories', 'trend', 'couple']);
  });
});

describe('grid layout', () => {
  it('uses two columns from tablet width', () => {
    expect(columnCount(390)).toBe(1);
    expect(columnCount(820)).toBe(2);
  });
  it('fills columns row by row', () => {
    expect(splitColumns(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'c', 'e'], ['b', 'd']]);
    expect(splitColumns(['a', 'b'], 1)).toEqual([['a', 'b']]);
  });
});

describe('dropTarget', () => {
  // Two columns: a | b over c | d
  const rects = [
    { x: 0, y: 0, width: 100, height: 100 },
    { x: 110, y: 0, width: 100, height: 60 },
    { x: 0, y: 110, width: 100, height: 100 },
    { x: 110, y: 70, width: 100, height: 100 },
  ];
  it('picks the card under the point, across columns', () => {
    expect(dropTarget(rects, 50, 50)).toBe(0);
    expect(dropTarget(rects, 150, 100)).toBe(3);
    expect(dropTarget(rects, 20, 200)).toBe(2);
  });
  it('falls back to the nearest card in a gap or past the end', () => {
    expect(dropTarget(rects, 102, 80)).toBe(0);
    expect(dropTarget(rects, 50, 900)).toBe(2);
  });
  it('ignores cards that were not measured yet', () => {
    expect(dropTarget([undefined, rects[1]], 0, 0)).toBe(1);
    expect(dropTarget([], 0, 0)).toBe(-1);
  });
});

describe('autoScrollSpeed', () => {
  it('scrolls up near the top, down near the bottom, and not in the middle', () => {
    expect(autoScrollSpeed(10, 0, 800)).toBeLessThan(0);
    expect(autoScrollSpeed(790, 0, 800)).toBeGreaterThan(0);
    expect(autoScrollSpeed(400, 0, 800)).toBe(0);
  });
});

describe('mergeVisibleOrder', () => {
  it('keeps hidden cards in their slots', () => {
    // b is hidden; the user swapped a and c
    expect(mergeVisibleOrder(['a', 'b', 'c', 'd'], ['c', 'a', 'd'])).toEqual(['c', 'b', 'a', 'd']);
    expect(mergeVisibleOrder(['a', 'b'], ['b', 'a'])).toEqual(['b', 'a']);
  });
});

describe('auto-scroll limits', () => {
  it('never scrolls past the top or the end of the page', () => {
    expect(nextScroll(990, 14, 1000)).toBe(1000);
    expect(nextScroll(1000, 14, 1000)).toBe(1000);
    expect(nextScroll(5, -14, 1000)).toBe(0);
    expect(nextScroll(0, 14, -50)).toBe(0); // page shorter than the screen
  });
  it('waits for real movement before scrolling', () => {
    expect(autoScrollArmed(0, 0)).toBe(false);
    expect(autoScrollArmed(3, 10)).toBe(false);
    expect(autoScrollArmed(0, 40)).toBe(true);
  });
});

describe('layoutSyncAction', () => {
  const row = (home_layout: string[] | null) => ({ home_layout });
  it('re-sends a change that never reached the server instead of reverting it', () => {
    expect(layoutSyncAction(['b', 'a'], true, row(['a', 'b']))).toEqual({ action: 'upload', layout: ['b', 'a'] });
  });
  it('applies the account order, including a reset to the default', () => {
    expect(layoutSyncAction(['a', 'b'], false, row(['b', 'a']))).toEqual({ action: 'apply', layout: ['b', 'a'] });
    expect(layoutSyncAction(['a', 'b'], false, row(null))).toEqual({ action: 'apply', layout: null });
  });
  it("uploads this device's order when the account has none yet", () => {
    expect(layoutSyncAction(['b', 'a'], false, null)).toEqual({ action: 'upload', layout: ['b', 'a'] });
    expect(layoutSyncAction(null, false, null)).toEqual({ action: 'none' });
  });
  it('does nothing when both already match', () => {
    expect(layoutSyncAction(['a'], false, row(['a']))).toEqual({ action: 'none' });
    expect(layoutSyncAction(null, false, row(null))).toEqual({ action: 'none' });
  });
});


describe('dropPlacement', () => {
  // order a b c d, lifting b (index 1)
  it('upper half of a card drops before it, lower half after it', () => {
    expect(dropPlacement(1, 3, true)).toEqual({ to: 2, side: 'before' }); // a c b d
    expect(dropPlacement(1, 3, false)).toEqual({ to: 3, side: 'after' }); // a c d b
    expect(dropPlacement(1, 0, true)).toEqual({ to: 0, side: 'before' }); // b a c d
  });
  it('no change (and no line) next to its own spot or over itself', () => {
    expect(dropPlacement(1, 0, false)).toBeNull(); // after a = where b already is
    expect(dropPlacement(1, 2, true)).toBeNull(); // before c = where b already is
    expect(dropPlacement(1, 1, true)).toBeNull();
    expect(dropPlacement(1, -1, true)).toBeNull();
  });
});

describe('default Home order', () => {
  it('totals, today, recent, categories, 7 days, who paid', () => {
    expect(resolveHomeOrder(null)).toEqual(['hero', 'today', 'recent', 'categories', 'trend', 'couple']);
  });
});
