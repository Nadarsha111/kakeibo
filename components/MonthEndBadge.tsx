import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

/** Marks a bill that falls due next month but is paid from the month-end salary, so it counts this month. */
export default function MonthEndBadge() {
  const { theme } = useTheme();
  return <Text style={[styles.badge, { color: theme.colors.primary, borderColor: theme.colors.primary }]}>Month-end</Text>;
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 1,
    overflow: 'hidden',
  },
});
