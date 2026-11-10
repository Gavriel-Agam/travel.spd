import { describe, expect, it } from 'vitest';
import { clampOffset, containScale, coverScale, outputPlacement, placement, zoomAt, zoomLimits } from '../crop';

const frame = { w: 300, h: 300 };
const photo = { w: 1200, h: 600 }; // wide photo

describe('crop geometry', () => {
  it('cover fills the frame, contain shows the whole picture', () => {
    expect(coverScale(photo, frame)).toBe(0.5); // 600 px tall -> 300 pt
    expect(containScale(photo, frame)).toBe(0.25); // 1200 px wide -> 300 pt
    const { min, max } = zoomLimits(photo, frame);
    expect(min).toBe(0.25);
    expect(max).toBe(3);
  });

  it('a covering picture cannot be pulled past its edge; a smaller one stays inside', () => {
    // At cover (0.5) the photo is 600 x 300: 150 pt of slack each side horizontally, none vertically
    expect(clampOffset({ x: 400, y: 50 }, photo, 0.5, frame)).toEqual({ x: 150, y: 0 });
    // At contain (0.25) it is 300 x 150: it may move 75 pt up or down inside the frame
    expect(clampOffset({ x: 10, y: -200 }, photo, 0.25, frame)).toEqual({ x: 0, y: -75 });
  });

  it('zooming keeps the point under the fingers still', () => {
    const off = { x: 20, y: -10 };
    const focal = { x: 60, y: 40 };
    const next = zoomAt(0.5, off, 1, focal);
    // The picture point under `focal` before and after is the same
    const before = { x: (focal.x - off.x) / 0.5, y: (focal.y - off.y) / 0.5 };
    const after = { x: (focal.x - next.x) / 1, y: (focal.y - next.y) / 1 };
    expect(after).toEqual(before);
  });

  it('the output shows exactly what the frame shows', () => {
    // Cover, centred: the middle 600 x 600 px of the photo fills the 128 px output
    const p = placement(photo, 0.5, { x: 0, y: 0 }, frame);
    expect(p).toEqual({ x: -150, y: 0, w: 600, h: 300 });
    const o = outputPlacement(photo, 0.5, { x: 0, y: 0 }, frame, { w: 128, h: 128 });
    expect(o.x).toBeCloseTo(-64);
    expect(o.w).toBeCloseTo(256);
    expect(o.h).toBeCloseTo(128);
  });
});
