import { useRef } from 'react';
import { Animated } from 'react-native';
import { usePathname } from 'expo-router';
import { tabIndexOf } from '../utils/tabSwipe';

export interface TabScrub {
  /** The index in the middle of the bar. Whole numbers rest on a tab, fractions are mid-drag. */
  value: Animated.Value;
  /** The same number as a plain value, kept up to date, for code that needs to read it. */
  current: number;
}

/**
 * The one number shared by the swipe gesture (which writes it while a finger drags) and the tab bar
 * (which draws its tiles from it and animates it to the selected tab whenever that changes).
 */
export function useTabScrub(): TabScrub {
  const pathname = usePathname();
  const scrub = useRef<TabScrub | null>(null);

  if (!scrub.current) {
    const start = Math.max(tabIndexOf(pathname), 0);
    const created: TabScrub = { value: new Animated.Value(start), current: start };
    created.value.addListener(({ value }) => {
      created.current = value;
    });
    scrub.current = created;
  }

  return scrub.current;
}
