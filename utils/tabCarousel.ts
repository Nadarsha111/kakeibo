/**
 * Where a tab sits in the bar when the selected tab is kept in the middle and the others rotate
 * around it, like a carousel. With five tabs A-E: selecting C leaves them as A B C D E, selecting A
 * gives D E A B C, and selecting E gives C D E A B. Kept free of React Native so it can be tested.
 */
export function carouselPosition(index: number, selected: number, count: number): number {
  const center = Math.floor(count / 2);
  return (((index - selected + center) % count) + count) % count;
}
