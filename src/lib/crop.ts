// Geometry for the picture cropper (ImageCropper): a picture shown at some
// zoom behind a fixed frame, moved with a finger and zoomed with two.
//
// `scale` is screen points per picture pixel. `off` is where the picture's
// centre sits relative to the frame's centre, in screen points.

export type Size = { w: number; h: number };
export type Point = { x: number; y: number };

/** The zoom at which the picture just covers the frame (no empty edges). */
export function coverScale(img: Size, frame: Size) {
  return Math.max(frame.w / img.w, frame.h / img.h);
}

/** The zoom at which the whole picture just fits inside the frame. */
export function containScale(img: Size, frame: Size) {
  return Math.min(frame.w / img.w, frame.h / img.h);
}

/** Allowed zoom: from the whole picture in view up to 6x closer than covering the frame. */
export function zoomLimits(img: Size, frame: Size) {
  const min = containScale(img, frame);
  return { min, max: Math.max(min * 2, coverScale(img, frame) * 6) };
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Keeps the picture where it makes sense: larger than the frame, it can't be
 * pulled so far that an empty edge shows; smaller than the frame, it stays
 * inside it. Each direction on its own.
 */
export function clampOffset(off: Point, img: Size, scale: number, frame: Size): Point {
  const limit = (imgLen: number, frameLen: number) => Math.abs(imgLen * scale - frameLen) / 2;
  const lx = limit(img.w, frame.w);
  const ly = limit(img.h, frame.h);
  return { x: clamp(off.x, -lx, lx), y: clamp(off.y, -ly, ly) };
}

/**
 * The offset after zooming from `scale` to `next` around `focal` (a point
 * relative to the frame centre, e.g. between two fingers or under the
 * mouse): the spot under it stays under it.
 */
export function zoomAt(scale: number, off: Point, next: number, focal: Point): Point {
  const k = next / scale;
  return { x: focal.x - (focal.x - off.x) * k, y: focal.y - (focal.y - off.y) * k };
}

/** Where the picture goes on screen: its box relative to the frame's top-left corner. */
export function placement(img: Size, scale: number, off: Point, frame: Size) {
  const w = img.w * scale;
  const h = img.h * scale;
  return { x: frame.w / 2 + off.x - w / 2, y: frame.h / 2 + off.y - h / 2, w, h };
}

/**
 * Where to draw the whole picture on an output canvas of `out` pixels so the
 * result is exactly what the frame shows (the canvas clips the rest).
 */
export function outputPlacement(img: Size, scale: number, off: Point, frame: Size, out: Size) {
  const p = placement(img, scale, off, frame);
  const kx = out.w / frame.w;
  const ky = out.h / frame.h;
  return { x: p.x * kx, y: p.y * ky, w: p.w * kx, h: p.h * ky };
}
