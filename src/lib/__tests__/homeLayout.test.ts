import { describe, expect, it } from 'vitest';
import { HOME_SECTIONS, moveItem, resolveHomeOrder } from '../homeLayout';

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
