/**
 * The maths behind swiping through the tabs like a scrolling wheel. Kept free of React Native so it
 * can be tested on its own.
 *
 * The bar is described by one number, the "index" sitting in its middle. It equals a tab's position
 * in SWIPE_TABS when that tab is selected, and is fractional while a finger is dragging (2.5 is
 * half way between the third and fourth tab).
 */

// The visible tabs, left to right. Screens reached from elsewhere (Budget, Profiles) are not in the
// list, so swiping on them does nothing.
export const SWIPE_TABS = ['/', '/transactions', '/accounts', '/manage', '/settings'];

// How far past the first or last tab a drag may stretch before it stops following the finger
const OVERSCROLL = 0.35;

// How far ahead, in milliseconds, a flick carries on after the finger lifts
const MOMENTUM_MS = 180;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** Position of a screen in the bar, or -1 when it is not one of the tabs. */
export function tabIndexOf(pathname: string): number {
  return SWIPE_TABS.indexOf(pathname.replace(/\/+$/, '') || '/');
}

/** A drag counts as a swipe only when it is clearly sideways, so vertical scrolling is never taken over. */
export function isSidewaysDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 2;
}

/**
 * The index in the middle of the bar while a finger has dragged `dx` from where it started.
 * Dragging left moves toward later tabs, one tab for every `pxPerTab` of travel, so the tiles move
 * exactly as far as the finger does.
 */
export function scrubIndex(startIndex: number, dx: number, count: number, pxPerTab: number): number {
  return clamp(startIndex - dx / pxPerTab, -OVERSCROLL, count - 1 + OVERSCROLL);
}

/**
 * The tab chosen when the finger lifts: the one nearest to where the bar would drift to, given how
 * fast it was moving (`vx`, in px per ms). A slow drag picks whatever is closest to the middle, a
 * flick can carry on past several tabs.
 */
export function settleIndex(index: number, vx: number, count: number, pxPerTab: number): number {
  return clamp(Math.round(index - (vx * MOMENTUM_MS) / pxPerTab), 0, count - 1);
}
