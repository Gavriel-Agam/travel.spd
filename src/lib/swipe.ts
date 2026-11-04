// Swipe-to-reveal maths for list rows, shared by the row component and tests.
// The actions sit at the row's end side: on the right in English (revealed by
// swiping left) and on the left in Hebrew (revealed by swiping right).

export const ACTION_WIDTH = 72;

/** +1 when the row slides right to open (RTL), -1 when it slides left (LTR). */
export function openSign(rtl: boolean) {
  return rtl ? 1 : -1;
}

/** Where the row sits while the finger moves: never past the actions or the closed position. */
export function dragOffset(base: number, dx: number, width: number, rtl: boolean) {
  const s = openSign(rtl);
  const travel = Math.max(0, Math.min(width, s * (base + dx)));
  return travel === 0 ? 0 : s * travel;
}

/** On release: open when dragged (or flicked) past half of the actions. */
export function settleOpen(base: number, dx: number, vx: number, width: number, rtl: boolean) {
  const s = openSign(rtl);
  const projected = s * (base + dx + vx * 120);
  return projected > width / 2;
}

/** A move counts as a swipe only when it is clearly sideways (vertical keeps scrolling the list). */
export function isHorizontalSwipe(dx: number, dy: number) {
  return Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5;
}
