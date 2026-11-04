import { describe, expect, it } from 'vitest';
import { autoScrollSpeed, columnCount, dropTarget, HOME_SECTIONS, mergeVisibleOrder, moveItem, resolveHomeOrder, splitColumns } from '../homeLayout';

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
    expect(resolveHomeOrder(['recent', 'old-card', 'recent', 'hero'])).toEqual(['recent', 'hero', 'today', 'couple', 'trend', 'categories']);
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

