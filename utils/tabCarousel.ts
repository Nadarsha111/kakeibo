/**
 * Which slot of the bar a tab sits in when the selected tab is kept in the middle and the others
 * line up beside it in their normal order. With five tabs A-E (slots 0-4): selecting C leaves them
 * as A B C D E, selecting A gives _ _ A B C, and selecting E gives C D E _ _. The result can fall
 * outside 0..count-1 for tabs too far from the selected one; those are not shown, so the bar never
 * displays a tab that a swipe could not reach. Kept free of React Native so it can be tested.
 */
export function carouselPosition(index: number, selected: number, count: number): number {
  return index - selected + Math.floor(count / 2);
}

/** Whether a slot is inside the bar. */
export function isSlotVisible(position: number, count: number): boolean {
  return position >= 0 && position <= count - 1;
}
