import { describe, expect, it } from 'vitest';
import { dragOffset, isHorizontalSwipe, settleOpen } from '../swipe';

const W = 144;

describe('swipe to reveal', () => {
  it('opens by swiping left in English and right in Hebrew', () => {
    expect(settleOpen(0, -100, 0, W, false)).toBe(true);
    expect(settleOpen(0, 100, 0, W, false)).toBe(false);
    expect(settleOpen(0, 100, 0, W, true)).toBe(true);
    expect(settleOpen(0, -100, 0, W, true)).toBe(false);
  });

  it('a short drag snaps back, a quick flick opens', () => {
    expect(settleOpen(0, -40, 0, W, false)).toBe(false);
    expect(settleOpen(0, -40, -1, W, false)).toBe(true);
  });

  it('an open row closes when swiped back', () => {
    expect(settleOpen(-W, 100, 0, W, false)).toBe(false);
    expect(settleOpen(W, -100, 0, W, true)).toBe(false);
  });

  it('never slides past the actions or the wrong way', () => {
    expect(dragOffset(0, -500, W, false)).toBe(-W);
    expect(dragOffset(0, 80, W, false)).toBe(0);
    expect(dragOffset(0, 500, W, true)).toBe(W);
    expect(dragOffset(0, -80, W, true)).toBe(0);
  });

  it('vertical scrolling is not a swipe', () => {
    expect(isHorizontalSwipe(5, 0)).toBe(false);
    expect(isHorizontalSwipe(30, 40)).toBe(false);
    expect(isHorizontalSwipe(-30, 5)).toBe(true);
  });
});
