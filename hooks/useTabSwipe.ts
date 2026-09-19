import { useMemo, useRef } from 'react';
import { Animated, Easing, PanResponder, useWindowDimensions } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { SWIPE_TABS, isSidewaysDrag, scrubIndex, settleIndex, tabIndexOf } from '../utils/tabSwipe';
import type { TabScrub } from './useTabScrub';

// Touches inside a Modal still travel up the React tree to the view that owns this handler, so a
// sideways drag in a popup would move the tabs behind it. Skip any gesture that started inside one.
// This peeks at React internals; if they are ever unavailable it simply reports "not in a modal".
const startedInModal = (event: any): boolean => {
  for (let fiber = event?._targetInst; fiber; fiber = fiber.return) {
    if (fiber.type === 'RCTModalHostView') return true;
  }
  return false;
};

// The bar's row is the window minus 16px of padding each side, split between the tabs
const BAR_SIDE_PADDING = 16;

/**
 * Handlers that let you scroll through the bottom tabs like a wheel: drag sideways anywhere and the
 * tab bar's tiles follow your finger; let go and the tab nearest the middle is selected, with a
 * quick flick carrying on past several. Spread the result onto the view that wraps the tabs.
 * Built on PanResponder, which is plain JavaScript, so it needs no native module and can ship in an
 * over-the-air update.
 */
export function useTabSwipe(scrub: TabScrub) {
  const router = useRouter();
  const pathname = usePathname();
  const { width } = useWindowDimensions();

  // The responder is created once, so it reads what changes through refs
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const pxPerTab = useRef(1);
  pxPerTab.current = (width - 2 * BAR_SIDE_PADDING) / SWIPE_TABS.length;

  return useMemo(() => {
    let startIndex = 0;
    let startDx = 0;

    const settleTo = (index: number) => {
      Animated.timing(scrub.value, {
        toValue: index,
        duration: 240,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // the bar animates layout, which the native driver cannot do
      }).start();
    };

    return PanResponder.create({
      // Bubble phase (not capture) so scrollers deeper in the tree, like the filter chips, win first
      onMoveShouldSetPanResponder: (event, gesture) =>
        gesture.numberActiveTouches === 1 &&
        isSidewaysDrag(gesture.dx, gesture.dy) &&
        tabIndexOf(pathnameRef.current) !== -1 &&
        !startedInModal(event),

      onPanResponderGrant: (_event, gesture) => {
        // Pick up from wherever the bar is right now, even if it is still settling from a last swipe
        scrub.value.stopAnimation();
        startIndex = scrub.current;
        startDx = gesture.dx; // the distance covered before this took over does not count
      },

      onPanResponderMove: (_event, gesture) => {
        scrub.value.setValue(scrubIndex(startIndex, gesture.dx - startDx, SWIPE_TABS.length, pxPerTab.current));
      },

      onPanResponderRelease: (_event, gesture) => {
        const target = settleIndex(scrub.current, gesture.vx, SWIPE_TABS.length, pxPerTab.current);
        settleTo(target);
        if (target !== tabIndexOf(pathnameRef.current)) router.navigate(SWIPE_TABS[target] as never);
      },

      // Something else took the gesture: go back to the tab that is still selected
      onPanResponderTerminate: () => settleTo(Math.max(tabIndexOf(pathnameRef.current), 0)),
    }).panHandlers;
  }, [router, scrub]);
}
