import { afterEach, describe, expect, it, vi } from 'vitest';
import { DISSOLVE_MS, dissolveThen, registerDissolvable, useDissolve } from '@/store/dissolve';

describe('dissolveThen', () => {
  afterEach(() => vi.useRealTimers());

  it('no row on screen: removes at once', () => {
    const remove = vi.fn();
    dissolveThen('gone', remove);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(useDissolve.getState().ids).toEqual({});
  });

  it('row on screen: dust first, then removed, then cleared', () => {
    vi.useFakeTimers();
    const off = registerDissolvable('a');
    const remove = vi.fn();
    dissolveThen('a', remove, 300);
    expect('a' in useDissolve.getState().ids).toBe(false);
    vi.advanceTimersByTime(300);
    expect('a' in useDissolve.getState().ids).toBe(true);
    expect(remove).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DISSOLVE_MS);
    expect(remove).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(400);
    expect('a' in useDissolve.getState().ids).toBe(false);
    off();
  });
});
