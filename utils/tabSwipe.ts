/**
 * Which tab a horizontal swipe leads to. Kept free of React Native so it can be tested on its own.
 */

// The visible tabs, left to right. Screens reached from elsewhere (Budget, Profiles) are not in the
// list, so swiping on them does nothing.
export const SWIPE_TABS = ['/', '/transactions', '/accounts', '/manage', '/settings'];

/** A drag counts as a swipe only when it is clearly sideways, so vertical scrolling is never taken over. */
export function isSidewaysDrag(dx: number, dy: number): boolean {
  return Math.abs(dx) > 20 && Math.abs(dx) > Math.abs(dy) * 2;
}

/**
 * The tab to switch to once a drag ends, or null when it should be ignored: too short and slow,
 * not sideways, on a screen outside the tab list, or already at the first/last tab.
 * Swiping left goes to the next tab, swiping right to the previous one.
 */
export function swipeTarget(pathname: string, dx: number, dy: number, vx: number): string | null {
  if (!isSidewaysDrag(dx, dy)) return null;
  const farEnough = Math.abs(dx) >= 70 || (Math.abs(dx) >= 30 && Math.abs(vx) >= 0.5);
  if (!farEnough) return null;

  const current = SWIPE_TABS.indexOf(pathname.replace(/\/+$/, '') || '/');
  if (current === -1) return null;

  return SWIPE_TABS[current + (dx < 0 ? 1 : -1)] ?? null;
}
