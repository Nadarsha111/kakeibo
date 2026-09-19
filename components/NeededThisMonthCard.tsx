import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { getRecurringService, type NeededLine, type NeededSummary } from '../database';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { formatDay } from '../utils/recurring';
import MonthEndBadge from './MonthEndBadge';

const MAX_LINES = 4;

/** When a line falls due, and what kind it is; month-end ones say so, since their due date is next month. */
export const describeLine = (line: NeededLine) => {
  let due: string;
  if (line.overdue) due = `Overdue since ${formatDay(line.dueDate)}`;
  else if (!line.payAtMonthEnd) due = `Due ${formatDay(line.dueDate)}`;
  // A card's real due date depends on its grace period, so only the loans show one
  else due = line.kind === 'card' ? 'Bill paid at month end' : `Due ${formatDay(line.dueDate)}, paid at month end`;
  return `${due}${line.kind === 'savings' ? ' · savings' : line.kind === 'card' ? ' · credit card' : ''}`;
};

interface NeededThisMonthCardProps {
  /** Changes whenever the screen reloads its numbers, so this card refreshes with it. */
  refreshKey?: unknown;
}

/**
 * How much money is needed from today to the end of the month for what is already known: recurring
 * bills, loan installments, regular savings and loans due back. Set against what you have in cash,
 * bank and savings, it says how much would be left over or how short you would be.
 */
export default function NeededThisMonthCard({ refreshKey }: NeededThisMonthCardProps) {
  const { theme } = useTheme();
  const { formatCurrency, selectedProfileId } = useSettings();
  const styles = createStyles(theme);

  const [summary, setSummary] = useState<NeededSummary | null>(null);
  const profileId = selectedProfileId === 'all' ? undefined : selectedProfileId;

  const load = useCallback(() => {
    try {
      const recurring = getRecurringService();
      recurring.postDue(); // so anything set to record itself is already in the balances used below
      setSummary(recurring.getNeededThisMonth(profileId));
    } catch (error) {
      console.error('Error loading what is needed this month:', error);
    }
  }, [profileId]);

  useFocusEffect(useCallback(() => load(), [load]));
  useEffect(() => load(), [load, refreshKey]);

  const open = () => router.push('/worth');

  if (!summary) return null;

  // Nothing set up yet: invite the user to add their bills instead of showing a card of zeros
  if (summary.lines.length === 0 && summary.monthlyCommitments === 0) {
    return (
      <TouchableOpacity style={styles.card} onPress={open} activeOpacity={0.85}>
        <Text style={styles.title}>Money needed this month</Text>
        <Text style={styles.hint}>
          Add your rent, loan installments and regular bills to see how much you need to have ready, and whether you will have enough.
        </Text>
        <Text style={styles.link}>Set up recurring bills ›</Text>
      </TouchableOpacity>
    );
  }

  const short = summary.leftOver < 0;
  const shown = summary.lines.slice(0, MAX_LINES);
  const hidden = summary.lines.slice(MAX_LINES);
  const more = hidden.length;
  const hiddenMonthEnd = hidden.filter((line) => line.payAtMonthEnd).length;
  const monthEndTotal = summary.lines.reduce((sum, line) => sum + (line.payAtMonthEnd ? line.amount : 0), 0);

  return (
    <TouchableOpacity style={styles.card} onPress={open} activeOpacity={0.85}>
      <View style={styles.titleRow}>
        <Text style={styles.title}>Money needed this month</Text>
        <Text style={styles.until}>by {formatDay(summary.monthEnd)}</Text>
      </View>

      <Text style={[styles.total, { color: summary.total > 0 ? theme.colors.error : theme.colors.success }]}>
        {formatCurrency(summary.total)}
      </Text>
      <Text style={styles.caption}>
        {summary.total > 0
          ? `still to pay, of ${formatCurrency(summary.monthlyCommitments)} in monthly commitments`
          : `Nothing left to pay this month, out of ${formatCurrency(summary.monthlyCommitments)} in monthly commitments`}
      </Text>
      {monthEndTotal > 0 && (
        <Text style={styles.caption}>including {formatCurrency(monthEndTotal)} that falls due next month, paid at month end</Text>
      )}

      {shown.length > 0 && (
        <View style={styles.lines}>
          {shown.map((line) => (
            <View key={line.key} style={styles.line}>
              <View style={styles.lineText}>
                <View style={styles.labelRow}>
                  <Text style={[styles.lineLabel, styles.labelText]} numberOfLines={1}>{line.label}</Text>
                  {line.payAtMonthEnd && <MonthEndBadge />}
                </View>
                <Text style={[styles.lineDate, line.overdue && { color: theme.colors.error, fontWeight: '600' }]}>
                  {describeLine(line)}
                </Text>
              </View>
              <Text style={styles.lineAmount}>{formatCurrency(line.amount)}</Text>
            </View>
          ))}
          {more > 0 && (
            <Text style={styles.more}>
              + {more} more{hiddenMonthEnd > 0 ? ` (${hiddenMonthEnd} paid at month end)` : ''} · tap to see all
            </Text>
          )}
        </View>
      )}

      <View style={styles.divider} />
      <View style={styles.summaryRow}>
        <Text style={styles.summaryLabel}>You have (cash, bank, savings)</Text>
        <Text style={styles.summaryValue}>{formatCurrency(summary.available)}</Text>
      </View>
      <View style={styles.summaryRow}>
        <Text style={[styles.summaryLabel, styles.bold]}>{short ? 'Short by' : 'Left over'}</Text>
        <Text style={[styles.summaryValue, styles.bold, { color: short ? theme.colors.error : theme.colors.success }]}>
          {formatCurrency(Math.abs(summary.leftOver))}
        </Text>
      </View>
      {summary.expectedIncome > 0 && (
        <Text style={styles.footnote}>
          + {formatCurrency(summary.expectedIncome)} income expected by then, not counted above
        </Text>
      )}
    </TouchableOpacity>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    card: {
      backgroundColor: theme.colors.surface,
      borderColor: theme.colors.border,
      borderWidth: 1,
      borderRadius: 16,
      padding: 20,
      marginHorizontal: 20,
      marginBottom: 4,
    },
    titleRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    until: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    total: {
      fontSize: 32,
      fontWeight: 'bold',
      marginTop: 8,
    },
    caption: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    hint: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 8,
      lineHeight: 19,
    },
    link: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.primary,
      marginTop: 12,
    },
    lines: {
      marginTop: 16,
    },
    line: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 7,
      gap: 12,
    },
    lineText: {
      flex: 1,
    },
    lineLabel: {
      fontSize: 15,
      color: theme.colors.text,
    },
    labelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    labelText: {
      flexShrink: 1,
    },
    lineDate: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 1,
    },
    lineAmount: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text,
    },
    more: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginTop: 12,
      marginBottom: 8,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    summaryLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    summaryValue: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    bold: {
      fontSize: 16,
      fontWeight: '700',
    },
    footnote: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 8,
    },
  });
