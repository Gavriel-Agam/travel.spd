import { describe, expect, it } from 'vitest';
import { closeDuration, closesSheet } from '../sheetGesture';

const H = 690; // an 85% sheet on an 812 pt phone

describe('drag a sheet down to close it', () => {
  it('a quick flick closes it even when it moved only a little', () => {
    expect(closesSheet(60, 1.2, H)).toBe(true);
    expect(closesSheet(20, 0.8, H)).toBe(true);
  });

  it('a slow pull past about a third of its height closes it', () => {
    expect(closesSheet(240, 0.1, H)).toBe(true);
    expect(closesSheet(200, 0.1, H)).toBe(false);
  });

  it('a slow, short drag (reading, scrolling) springs back', () => {
    expect(closesSheet(90, 0.1, H)).toBe(false);
    expect(closesSheet(120, 0.4, H)).toBe(false);
  });

  it('a twitch or an upward drag never closes it', () => {
    expect(closesSheet(10, 2, H)).toBe(false);
    expect(closesSheet(-40, 1.5, H)).toBe(false);
    expect(closesSheet(0, 3, H)).toBe(false);
  });

  it('the closing slide is quick at any speed', () => {
    expect(closeDuration(60, 0.2, 730)).toBe(260);
    expect(closeDuration(600, 3, 730)).toBe(120);
  });
});
