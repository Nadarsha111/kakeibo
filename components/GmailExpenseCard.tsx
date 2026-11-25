import React, { useMemo, useRef } from 'react';
import { Animated, PanResponder, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../context/ThemeContext';
import { tint } from '../utils/categoryIcon';

interface Props {
  payee: string;
  details: string;
  amount: string;
  category?: { label: string; color: string };
  localCategory?: { label: string; color: string };
  ready: boolean;
  disabled: boolean;
  onReview: () => void;
  onSwipe: () => void;
}

const SWIPE_DISTANCE = 64;
const ACTION_WIDTH = 90;

export default function GmailExpenseCard({ payee, details, amount, category, localCategory, ready, disabled, onReview, onSwipe }: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const badge = category ?? localCategory;
  const translateX = useRef(new Animated.Value(0)).current;
  const latest = useRef({ disabled, onSwipe });
  latest.current = { disabled, onSwipe };

  const panHandlers = useMemo(() => {
    const reset = () => Animated.spring(translateX, { toValue: 0, useNativeDriver: true }).start();
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, { dx, dy, numberActiveTouches }) =>
        !latest.current.disabled && numberActiveTouches === 1 && dx < -12 && -dx > Math.abs(dy) * 1.4,
      onPanResponderGrant: () => translateX.stopAnimation(),
      onPanResponderMove: (_, { dx }) => translateX.setValue(Math.max(-ACTION_WIDTH, Math.min(0, dx))),
      onPanResponderRelease: (_, { dx, dy }) => {
        reset();
        if (!latest.current.disabled && dx <= -SWIPE_DISTANCE && -dx > Math.abs(dy)) {
          latest.current.onSwipe();
        }
      },
      onPanResponderTerminate: reset,
    }).panHandlers;
  }, [translateX]);

  return (
    <View style={styles.shell} {...panHandlers}>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden style={styles.action}>
        <MaterialCommunityIcons name={ready ? 'check' : 'pencil-outline'} color={theme.colors.background} size={20} />
        <Text style={styles.actionText}>{ready ? 'Import' : 'Review'}</Text>
      </View>
      <Animated.View style={{ transform: [{ translateX }] }}>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityHint="Opens expense review"
          accessibilityActions={ready && !disabled ? [{ name: 'import', label: 'Import expense' }] : undefined}
          onAccessibilityAction={({ nativeEvent }) => {
            if (ready && !disabled && nativeEvent.actionName === 'import') onSwipe();
          }}
          onPress={onReview}
          disabled={disabled}
          style={styles.row}
        >
          <View style={styles.details}>
            <Text style={styles.label}>{payee}</Text>
            <Text style={styles.muted}>{details}</Text>
            {badge && (
              <View style={[styles.category, { backgroundColor: tint(badge.color) ?? theme.colors.background }]}>
                <MaterialCommunityIcons name="tag-outline" size={13} color={theme.isDark ? badge.color : theme.colors.textSecondary} />
                <Text style={styles.categoryLabel}>{category ? badge.label : `Possible match · ${badge.label}`}</Text>
              </View>
            )}
          </View>
          <Text style={styles.label}>{amount}</Text>
          <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) => StyleSheet.create({
  shell: { overflow: 'hidden', borderRadius: 10, backgroundColor: theme.colors.primary },
  action: { position: 'absolute', width: ACTION_WIDTH, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', gap: 4 },
  actionText: { color: theme.colors.background, fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, backgroundColor: theme.colors.surface },
  details: { flex: 1, gap: 4 },
  label: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  muted: { color: theme.colors.textSecondary, fontSize: 14 },
  category: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  categoryLabel: { color: theme.colors.text, fontSize: 12, fontWeight: '600', flexShrink: 1 },
});
