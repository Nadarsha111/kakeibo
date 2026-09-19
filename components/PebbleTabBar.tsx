import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../context/ThemeContext';
import type { TabScrub } from '../hooks/useTabScrub';
import { carouselPosition, isSlotVisible } from '../utils/tabCarousel';

const ROW_HEIGHT = 74; // as tall as the ring around the selected tab
const RING_SIZE = 74;
const RING_WIDTH = 2;
const SMALL_SIZE = 42; // an unselected tab
const LARGE_SIZE = 62; // the selected tab: 74 - two ring widths - a 4px gap on each side
const ICON_SIZE = 26;
const TOUCH_SIZE = 58; // tap area of a tab; the rest of the row lets touches through to the screen
const SIDE_PADDING = 16;
const TOP_PADDING = 6;
const EDGE_GAP = 8; // space below the bar when the system reports no bottom inset

/** How far up from the bottom of the screen the bar reaches; anything floating above it should sit higher. */
export const tabBarOffset = (bottomInset: number) => ROW_HEIGHT + TOP_PADDING + Math.max(bottomInset, EDGE_GAP);

/**
 * Bottom padding for a screen's scrolling content. The bar floats over the screens, so the end of a
 * list needs this much room to scroll clear of the bar and the add button above it.
 */
export function useTabBarInset(): number {
  const insets = useSafeAreaInsets();
  return tabBarOffset(insets.bottom) + 80;
}

interface TabItemProps {
  /** This tab's position among the tabs in the bar. */
  index: number;
  /** The index in the middle of the bar; fractional while a finger is dragging. */
  value: Animated.Value;
  focused: boolean;
  label: string;
  renderIcon: (color: string) => React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  onPress: () => void;
  onLongPress: () => void;
}

/**
 * One tab: only its icon, in a round tile. A tile far from the middle is a small solid disc. As it
 * nears the middle it grows into a bigger disc with its own ring around it and the icon colors
 * inverted, so while you drag you can see which tab letting go would select. There is no visible
 * label, so the label is only kept for screen readers.
 */
function TabItem({ index, value, focused, label, renderIcon, accessibilityLabel, testID, onPress, onLongPress }: TabItemProps) {
  const { theme } = useTheme();
  const { text, background, surface, border, textSecondary } = theme.colors;

  // 1 when this tab is the one in the middle, fading to 0 a full tab away on either side
  const progress = useMemo(
    () => Animated.subtract(index, value).interpolate({ inputRange: [-1, 0, 1], outputRange: [0, 1, 0], extrapolate: 'clamp' }),
    [index, value],
  );
  const look = useMemo(
    () => ({
      size: progress.interpolate({ inputRange: [0, 1], outputRange: [SMALL_SIZE, LARGE_SIZE] }),
      radius: progress.interpolate({ inputRange: [0, 1], outputRange: [SMALL_SIZE / 2, LARGE_SIZE / 2] }),
      ringScale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }),
      quiet: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
    }),
    [progress],
  );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel ?? label}
      testID={testID}
      onPress={onPress}
      onLongPress={onLongPress}
      style={styles.pressable}
    >
      <Animated.View
        pointerEvents="none"
        style={[styles.ring, { borderColor: text, opacity: progress, transform: [{ scale: look.ringScale }] }]}
      />
      {/* Solid, because there is no bar behind the tiles: screen content scrolls underneath them */}
      <Animated.View
        style={[
          styles.disc,
          {
            width: look.size,
            height: look.size,
            borderRadius: look.radius,
            backgroundColor: progress.interpolate({ inputRange: [0, 1], outputRange: [surface, text] }),
            borderColor: progress.interpolate({ inputRange: [0, 1], outputRange: [border, text] }),
          },
        ]}
      >
        {/* Two copies of the icon, one per color, cross-faded as the tile grows */}
        <View style={styles.iconStack}>
          <Animated.View style={{ opacity: look.quiet }}>{renderIcon(textSecondary)}</Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, styles.iconCenter, { opacity: progress }]}>
            {renderIcon(background)}
          </Animated.View>
        </View>
      </Animated.View>
    </Pressable>
  );
}

interface CarouselSlotProps {
  index: number;
  value: Animated.Value;
  count: number;
  slotWidth: number;
  /** Not shown while the bar is at rest; only used to stop it taking touches. */
  hidden: boolean;
  children: React.ReactNode;
}

/** Places a tab in the bar from the shared position, so it moves with the finger and glides when released. */
function CarouselSlot({ index, value, count, slotWidth, hidden, children }: CarouselSlotProps) {
  // Which slot this tab is in right now, as a fraction while the bar is moving
  const position = useMemo(() => Animated.subtract(index + Math.floor(count / 2), value), [index, count, value]);
  const left = useMemo(() => Animated.multiply(position, slotWidth), [position, slotWidth]);
  // Fully visible inside the bar, fading out as a tab slides past either end
  const opacity = useMemo(
    () => position.interpolate({ inputRange: [-1, 0, count - 1, count], outputRange: [0, 1, 1, 0], extrapolate: 'clamp' }),
    [position, count],
  );

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      style={[styles.slot, { width: slotWidth, opacity, left }]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A row of round tiles floating over the bottom of the screen, with nothing behind them so the
 * screen shows through. The selected tab sits in the middle with the others beside it in order; a
 * side with nothing further along is left empty. The whole row is drawn from `scrub.value`, which a
 * swipe moves smoothly with the finger; whenever the selected tab changes the bar glides there. The
 * bar is positioned over the screens instead of taking space from them, so screens should pad the
 * end of their content with useTabBarInset(). Tabs that are hidden from the bar are skipped.
 */
export default function PebbleTabBar({ state, descriptors, navigation, scrub }: BottomTabBarProps & { scrub: TabScrub }) {
  const insets = useSafeAreaInsets();
  const [rowWidth, setRowWidth] = useState(Dimensions.get('window').width - 2 * SIDE_PADDING);

  const tabs = state.routes
    .map((route, index) => ({ route, index, options: descriptors[route.key].options }))
    // Expo Router hides a tab (href: null) by giving it display: 'none'
    .filter(({ options }) => StyleSheet.flatten(options.tabBarItemStyle)?.display !== 'none');
  const count = tabs.length;

  // While a screen that is not in the bar is open (Budget, Profiles) the arrangement stays as it was
  const selected = tabs.findIndex((tab) => tab.index === state.index);
  const anchor = useRef(Math.max(selected, 0));
  if (selected >= 0) anchor.current = selected;

  // Glide to the selected tab whenever it changes, whether by a tap, a swipe or a link
  useEffect(() => {
    if (selected < 0) return;
    Animated.timing(scrub.value, {
      toValue: selected,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // the tiles are placed with layout, which the native driver cannot do
    }).start();
  }, [selected, scrub]);

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, EDGE_GAP) }]}>
      <View pointerEvents="box-none" style={styles.row} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
        {tabs.map(({ route, index, options }, tabIndex) => {
          const focused = state.index === index;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);

          return (
            <CarouselSlot
              key={route.key}
              index={tabIndex}
              value={scrub.value}
              count={count}
              slotWidth={rowWidth / count}
              hidden={!isSlotVisible(carouselPosition(tabIndex, anchor.current, count), count)}
            >
              <TabItem
                index={tabIndex}
                value={scrub.value}
                focused={focused}
                label={label}
                renderIcon={(color) => options.tabBarIcon?.({ focused, color, size: ICON_SIZE })}
                accessibilityLabel={options.tabBarAccessibilityLabel}
                testID={options.tabBarButtonTestID}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name, route.params);
                }}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
              />
            </CarouselSlot>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Laid over the screens (absolute), with no background of its own
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: SIDE_PADDING,
    paddingTop: TOP_PADDING,
  },
  row: {
    height: ROW_HEIGHT,
  },
  // Tabs are placed by an animated `left`, one equal slot each, so a tile growing never pushes its
  // neighbors around
  slot: {
    position: 'absolute',
    top: 0,
    height: ROW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressable: {
    width: TOUCH_SIZE,
    height: TOUCH_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: RING_WIDTH,
  },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  iconStack: {
    width: ICON_SIZE,
    height: ICON_SIZE,
  },
  iconCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
