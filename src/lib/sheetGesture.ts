// When a bottom sheet (ui/Sheet.tsx) dragged down closes on release.

/** A flick: released while moving down faster than this (points per millisecond). */
export const FLICK_SPEED = 0.5;
/** Or pulled down past this share of the sheet's height, at any speed. */
export const FAR_SHARE = 0.3;
/** A flick must still travel a little, so a tap with a twitch never closes. */
const MIN_FLICK = 16;

/**
 * After dragging the sheet down by `dy` points and letting go at `vy` points
 * per millisecond: true closes it, false springs it back. Slow drags that
 * stay in the top third (someone reading or scrolling) keep it open.
 */
export function closesSheet(dy: number, vy: number, sheetHeight: number) {
  if (dy <= 0) return false;
  return (vy > FLICK_SPEED && dy > MIN_FLICK) || dy > sheetHeight * FAR_SHARE;
}

/** How long the closing slide takes: about the finger's speed, never slow. */
export function closeDuration(dy: number, vy: number, distance: number) {
  return Math.max(120, Math.min(260, (distance - dy) / Math.max(vy, 1.4)));
}
