import { useMemo, useRef } from 'react';
import { PanResponder } from 'react-native';
import { usePathname, useRouter } from 'expo-router';
import { isSidewaysDrag, swipeTarget } from '../utils/tabSwipe';

// Touches inside a Modal still travel up the React tree to the view that owns this handler, so a
// sideways drag in a popup would switch the tab behind it. Skip any gesture that started inside one.
// This peeks at React internals; if they are ever unavailable it simply reports "not in a modal".
const startedInModal = (event: any): boolean => {
  for (let fiber = event?._targetInst; fiber; fiber = fiber.return) {
    if (fiber.type === 'RCTModalHostView') return true;
  }
  return false;
};

/**
 * Handlers that switch between the bottom tabs when you swipe sideways on a screen. Spread the
 * result onto the view that wraps the tabs. Built on PanResponder, which is plain JavaScript, so
 * it needs no native module and can ship in an over-the-air update.
 */
export function useTabSwipe() {
  const router = useRouter();
  const pathname = usePathname();

  // The responder is created once, so it reads the current screen through a ref
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  return useMemo(
    () =>
      PanResponder.create({
        // Bubble phase (not capture) so scrollers deeper in the tree, like the filter chips, win first
        onMoveShouldSetPanResponder: (event, gesture) =>
          gesture.numberActiveTouches === 1 && isSidewaysDrag(gesture.dx, gesture.dy) && !startedInModal(event),
        onPanResponderRelease: (_event, gesture) => {
          const target = swipeTarget(pathnameRef.current, gesture.dx, gesture.dy, gesture.vx);
          if (target) router.navigate(target as never);
        },
      }).panHandlers,
    [router],
  );
}
