import React, { useEffect, useRef, useState } from 'react';
import { Animated, Dimensions, Easing, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../context/ThemeContext';
import { carouselPosition, isSlotVisible } from '../utils/tabCarousel';

const ROW_HEIGHT = 74; // as tall as the ring around the selected tab
const RING_SIZE = 74;
const RING_WIDTH = 2;
const SMALL_SIZE = 42; // an unselected tab
const LARGE_SIZE = 62; // the selected tab: 74 - two ring widths - a 4px gap on each side
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
  focused: boolean;
  label: string;
  renderIcon: (color: string) => React.ReactNode;
  accessibilityLabel?: string;
  testID?: string;
  onPress: () => void;
  onLongPress: () => void;
}

/**
 * One tab: only its icon, in a round tile. An unselected tab is a small solid disc. The selected
 * tab grows into a bigger disc with its own ring around it and the icon colors inverted. There is
 * no visible label, so the label is only kept for screen readers.
 */
function TabItem({ focused, label, renderIcon, accessibilityLabel, testID, onPress, onLongPress }: TabItemProps) {
  const { theme } = useTheme();
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animates size and color, which the native driver cannot do
    }).start();
  }, [focused, progress]);

  const { text, background, surface, border, textSecondary } = theme.colors;
  const size = progress.interpolate({ inputRange: [0, 1], outputRange: [SMALL_SIZE, LARGE_SIZE] });

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
        style={[
          styles.ring,
          {
            borderColor: text,
            opacity: progress,
            transform: [{ scale: progress.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }],
          },
        ]}
      />
      {/* Solid, because there is no bar behind the tiles: screen content scrolls underneath them */}
      <Animated.View
        style={[
          styles.disc,
          {
            width: size,
            height: size,
            borderRadius: progress.interpolate({ inputRange: [0, 1], outputRange: [SMALL_SIZE / 2, LARGE_SIZE / 2] }),
            backgroundColor: progress.interpolate({ inputRange: [0, 1], outputRange: [surface, text] }),
            borderColor: progress.interpolate({ inputRange: [0, 1], outputRange: [border, text] }),
          },
        ]}
      >
        {renderIcon(focused ? background : textSecondary)}
      </Animated.View>
    </Pressable>
  );
}

interface CarouselSlotProps {
  /** Which slot, counted from the left, this tab belongs in. Outside 0..count-1 means not shown. */
  target: number;
  count: number;
  slotWidth: number;
  children: React.ReactNode;
}

/** Holds a tab in its slot and slides it to a new one when the target changes. */
function CarouselSlot({ target, count, slotWidth, children }: CarouselSlotProps) {
  const position = useRef(new Animated.Value(target)).current;

  useEffect(() => {
    Animated.timing(position, {
      toValue: target,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animates layout (left), which the native driver cannot do
    }).start();
  }, [target, position]);

  // Fully visible inside the bar, fading out as a tab slides past either end
  const opacity = position.interpolate({
    inputRange: [-1, 0, count - 1, count],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
  const hidden = !isSlotVisible(target, count);

  return (
    <Animated.View
      pointerEvents={hidden ? 'none' : 'box-none'}
      accessibilityElementsHidden={hidden}
      importantForAccessibility={hidden ? 'no-hide-descendants' : 'auto'}
      style={[styles.slot, { width: slotWidth, opacity, left: Animated.multiply(position, slotWidth) }]}
    >
      {children}
    </Animated.View>
  );
}

/**
 * A row of round tiles floating over the bottom of the screen, with nothing behind them so the
 * screen shows through. The selected tab sits in the middle with the others beside it in order; a
 * side with nothing further along is left empty. The bar is positioned over the screens instead of
 * taking space from them, so screens should pad the end of their content with useTabBarInset().
 * Tabs that are hidden from the bar are skipped.
 */
export default function PebbleTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
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

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, EDGE_GAP) }]}>
      <View pointerEvents="box-none" style={styles.row} onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}>
        {tabs.map(({ route, index, options }, tabIndex) => {
          const focused = state.index === index;
          const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel : (options.title ?? route.name);

          return (
            <CarouselSlot
              key={route.key}
              target={carouselPosition(tabIndex, anchor.current, count)}
              count={count}
              slotWidth={rowWidth / count}
            >
              <TabItem
                focused={focused}
                label={label}
                renderIcon={(color) => options.tabBarIcon?.({ focused, color, size: 24 })}
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
  // Tabs are placed by an animated `left`, one equal slot each, so the selected one growing never
  // pushes its neighbors around
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
});
