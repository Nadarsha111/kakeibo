import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar, RefreshControl, Alert, Platform, Modal, Pressable } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { getTransactionService, getAccountService, getCategoryService } from '../../database';
import { Transaction } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { formatShortDate } from '../../utils/format';
import { categoryIcon, tint } from '../../utils/categoryIcon';
import CategoryBreakdown from '../../components/CategoryBreakdown';
import { useTransactionModal } from '../../context/TransactionModalContext';
import { useTabBarInset } from '../../components/PebbleTabBar';

type DateFilter = 'All time' | 'Today' | 'This week' | 'This month' | 'Last month' | 'Custom';
const DATE_FILTERS: DateFilter[] = ['This month', 'Last month', 'This week', 'Today', 'All time', 'Custom'];

type TypeFilter = 'all' | 'expense' | 'income';

const TRANSFER_CATEGORIES = new Set(['Transfer In', 'Transfer Out']);
const isTransfer = (t: Transaction) => TRANSFER_CATEGORIES.has(t.category);

// Transaction dates are stored as local "YYYY-MM-DD", so ranges are built the same way (not via
// toISOString, which shifts to UTC and can land on the neighbouring day).
function toLocalDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseLocalDate(date: string): Date {
  return new Date(`${date}T00:00:00`);
}

/** Inclusive [start, end] date strings for a preset, or null for no date limit. */
function presetRange(filter: DateFilter): [string, string] | null {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  switch (filter) {
    case 'Today':
      return [toLocalDateString(now), toLocalDateString(now)];
    case 'This week': {
      // Sunday-first, matching the Categories tab's "This Week".
      const start = new Date(y, m, now.getDate() - now.getDay());
      const end = new Date(y, m, now.getDate() - now.getDay() + 6);
      return [toLocalDateString(start), toLocalDateString(end)];
    }
    case 'This month':
      return [toLocalDateString(new Date(y, m, 1)), toLocalDateString(new Date(y, m + 1, 0))];
    case 'Last month':
      return [toLocalDateString(new Date(y, m - 1, 1)), toLocalDateString(new Date(y, m, 0))];
    default:
      return null;
  }
}

/** "Today", "Yesterday", or a short weekday and date (with the year when it isn't this one). */
function dayLabel(day: string): string {
  const today = toLocalDateString(new Date());
  const yesterday = toLocalDateString(new Date(Date.now() - 86400000));
  if (day === today) return 'Today';
  if (day === yesterday) return 'Yesterday';
  const date = parseLocalDate(day);
  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() !== new Date().getFullYear() ? { year: 'numeric' } : {}),
  });
}

export default function TransactionsScreen() {
  const tabInset = useTabBarInset();
  const { theme } = useTheme();
  const { formatCurrency, selectedProfileId } = useSettings();
  const styles = createStyles(theme);

  // Shared state
  const [activeTab, setActiveTab] = useState<'transactions' | 'categories'>('transactions');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('This Month');

  // Transactions state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categoryLook, setCategoryLook] = useState<Record<string, { icon: string; color: string }>>({});
  const [accountNames, setAccountNames] = useState<Record<number, string>>({});
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [dateFilter, setDateFilter] = useState<DateFilter>('This month');
  const [customStart, setCustomStart] = useState(() => presetRange('This month')![0]);
  const [customEnd, setCustomEnd] = useState(() => toLocalDateString(new Date()));
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);
  const [showPeriods, setShowPeriods] = useState(false);

  // Categories state
  const [categorySummary, setCategorySummary] = useState<{ category: string; amount: number; color: string; icon?: string | null; percentage: number }[]>([]);
  const [totals, setTotals] = useState({ expenses: 0, balance: 0, income: 0 });

  const { openModal, version } = useTransactionModal();

  useFocusEffect(
    React.useCallback(() => {
      loadTransactions();
      loadCategoryData();
    }, [selectedPeriod, selectedProfileId])
  );

  // Reload after a transaction is added or edited while this screen stays open
  useEffect(() => {
    if (version === 0) return;
    loadTransactions();
    loadCategoryData();
  }, [version]);

  const loadTransactions = async () => {
    try {
      const profileId = selectedProfileId === 'all' ? undefined : selectedProfileId;
      setTransactions(getTransactionService().getTransactions(profileId));
      setCategoryLook(
        Object.fromEntries(getCategoryService().getCategories().map((c) => [c.name, { icon: c.icon, color: c.color }])),
      );
      setAccountNames(Object.fromEntries(getAccountService().getAccounts(profileId).map((a) => [a.id, a.name])));
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryData = async () => {
    try {
      const profileId = selectedProfileId === 'all' ? undefined : selectedProfileId;
      let startDate: string, endDate: string;
      const now = new Date();

      if (selectedPeriod === 'This Month') {
        [startDate, endDate] = presetRange('This month')!;
      } else if (selectedPeriod === 'This Week') {
        [startDate, endDate] = presetRange('This week')!;
      } else {
        startDate = toLocalDateString(new Date(now.getFullYear(), now.getMonth() - 2, 1));
        endDate = toLocalDateString(new Date(now.getFullYear(), now.getMonth() + 1, 0));
      }

      const transactionService = getTransactionService();
      const accountService = getAccountService();

      const expenses = transactionService.getTotalExpenses(startDate, endDate, profileId);
      const income = transactionService.getTotalIncome(startDate, endDate, profileId);
      const balance = accountService.getTotalAccountsBalance(profileId);
      const summary = transactionService.getCategorySummary(startDate, endDate, profileId);

      const totalExpenses = expenses;
      const summaryWithPercentage = summary.map((item) => ({
        ...item,
        percentage: totalExpenses > 0 ? (item.amount / totalExpenses) * 100 : 0
      }));

      setTotals({
        expenses,
        income,
        balance: balance || 0
      });
      setCategorySummary(summaryWithPercentage);
    } catch (error) {
      console.error('Error loading category data:', error);
    }
  };

  // Everything in the chosen period, before the spent/received filter, so the totals stay put
  const inPeriod = useMemo(() => {
    const range = dateFilter === 'Custom' ? [customStart, customEnd] : presetRange(dateFilter);
    if (!range) return transactions;
    return transactions.filter((t) => {
      const day = t.date.slice(0, 10);
      return day >= range[0] && day <= range[1];
    });
  }, [transactions, dateFilter, customStart, customEnd]);

  // Money moved between your own accounts is neither spending nor income
  const spent = inPeriod.filter((t) => t.type === 'expense' && !isTransfer(t)).reduce((sum, t) => sum + t.amount, 0);
  const received = inPeriod.filter((t) => t.type === 'income' && !isTransfer(t)).reduce((sum, t) => sum + t.amount, 0);

  const shown = typeFilter === 'all' ? inPeriod : inPeriod.filter((t) => t.type === typeFilter && !isTransfer(t));

  // Newest day first, as the service already returns them
  const days = useMemo(() => {
    const groups: { day: string; items: Transaction[] }[] = [];
    shown.forEach((t) => {
      const day = t.date.slice(0, 10);
      const last = groups[groups.length - 1];
      if (last && last.day === day) last.items.push(t);
      else groups.push({ day, items: [t] });
    });
    return groups;
  }, [shown]);

  // Android shows the picker as a one-shot dialog; on iOS it's inline, so close it once a day is picked.
  const handleDatePicked = (event: DateTimePickerEvent, picked?: Date) => {
    const target = pickerTarget;
    setPickerTarget(null);
    if (event.type !== 'set' || !picked || !target) return;
    const day = toLocalDateString(picked);
    // Keep the range valid: moving one end past the other drags the other end along.
    if (target === 'start') {
      setCustomStart(day);
      if (day > customEnd) setCustomEnd(day);
    } else {
      setCustomEnd(day);
      if (day < customStart) setCustomStart(day);
    }
  };

  const toggleType = (type: Exclude<TypeFilter, 'all'>) => setTypeFilter((current) => (current === type ? 'all' : type));

  const handleEditTransaction = (transaction: Transaction) => {
    openModal({ transactionToEdit: transaction });
  };

  const handleDeleteTransaction = (transaction: Transaction) => {
    Alert.alert(
      'Delete Transaction',
      'Are you sure you want to delete this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              const transactionService = getTransactionService();
              transactionService.deleteTransaction(transaction.id);
              onRefresh(); // Reload data
            } catch (error) {
              console.error('Error deleting transaction:', error);
              Alert.alert('Error', 'Failed to delete transaction.');
            }
          },
        },
      ]
    );
  };

  const renderTransaction = (item: Transaction, last: boolean) => {
    const transfer = isTransfer(item);
    const look = categoryLook[item.category];
    const account = item.accountId != null ? accountNames[item.accountId] : undefined;
    const detail = [item.description?.trim(), account].filter(Boolean).join(' · ') || item.paymentMethod.replace('_', ' ');
    const amountColor = transfer ? theme.colors.textSecondary : item.type === 'income' ? theme.colors.success : theme.colors.text;

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.transactionRow, !last && styles.rowDivider]}
        onPress={() => handleEditTransaction(item)}
        onLongPress={() => handleDeleteTransaction(item)}
        activeOpacity={0.6}
      >
        <View style={[styles.categoryIcon, { backgroundColor: (transfer ? undefined : tint(look?.color)) ?? theme.colors.background }]}>
          <Text style={styles.categoryEmoji}>{categoryIcon(item.category, transfer ? null : look?.icon, item.type)}</Text>
        </View>
        <View style={styles.transactionDetails}>
          <Text style={styles.transactionCategory} numberOfLines={1}>{transfer ? 'Transfer' : item.category}</Text>
          <Text style={styles.transactionDescription} numberOfLines={1}>{detail}</Text>
        </View>
        <Text style={[styles.transactionAmount, { color: amountColor }]}>
          {transfer ? '' : item.type === 'expense' ? '−' : '+'}{formatCurrency(item.amount)}
        </Text>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.text }}>Loading transactions...</Text>
      </View>
    );
  }

  // Keeps the screen up while pulling to refresh, instead of swapping it for the loading text
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadTransactions();
      await loadCategoryData();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setRefreshing(false);
    }
  };

  // Reads after a count or "Nothing": "this month", "today", "from Sep 1 to Sep 9", or nothing for all time
  const periodText = dateFilter === 'All time'
    ? ''
    : dateFilter === 'Custom'
      ? ` from ${formatShortDate(parseLocalDate(customStart))} to ${formatShortDate(parseLocalDate(customEnd))}`
      : ` ${dateFilter.toLowerCase()}`;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transactions</Text>
      </View>

      {/* Tab Switcher, with the period button beside it on the list */}
      <View style={styles.toolbar}>
        <View style={styles.tabContainer}>
          {(['transactions', 'categories'] as const).map((tab) => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.activeTab]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.activeTabText]}>
                {tab === 'transactions' ? 'List' : 'Categories'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {activeTab === 'transactions' && (
          <TouchableOpacity style={styles.periodButton} onPress={() => setShowPeriods(true)} activeOpacity={0.7}>
            <MaterialCommunityIcons name="calendar-month-outline" size={18} color={theme.colors.primary} />
            <Text style={styles.periodButtonText} numberOfLines={1}>{dateFilter}</Text>
            <MaterialCommunityIcons name="chevron-down" size={16} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Content */}
      {activeTab === "transactions" ? (
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        >
          {/* Spent / received in the period; tapping one shows only those */}
          <View style={styles.summaryRow}>
            <TouchableOpacity
              style={[styles.summaryTile, typeFilter === 'expense' && styles.summaryTileActive]}
              onPress={() => toggleType('expense')}
              activeOpacity={0.7}
            >
              <Text style={styles.summaryLabel}>Spent</Text>
              <Text style={styles.summaryValue} numberOfLines={1} adjustsFontSizeToFit>{formatCurrency(spent)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.summaryTile, typeFilter === 'income' && styles.summaryTileActive]}
              onPress={() => toggleType('income')}
              activeOpacity={0.7}
            >
              <Text style={styles.summaryLabel}>Received</Text>
              <Text style={[styles.summaryValue, { color: theme.colors.success }]} numberOfLines={1} adjustsFontSizeToFit>
                {formatCurrency(received)}
              </Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.filterHint}>
            {typeFilter === 'all'
              ? `${shown.length} ${shown.length === 1 ? 'transaction' : 'transactions'}${periodText} · tap a total to filter`
              : `Showing only ${typeFilter === 'expense' ? 'spending' : 'income'} · `}
            {typeFilter !== 'all' && (
              <Text style={styles.filterClear} onPress={() => setTypeFilter('all')}>Show all</Text>
            )}
          </Text>

          <View style={[styles.transactionsContainer, { paddingBottom: tabInset }]}>
            {days.length === 0 && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>
                  {transactions.length === 0 ? 'No transactions yet.' : `Nothing${periodText || ' here'}.`}
                </Text>
                {transactions.length === 0 ? (
                  <Text style={styles.emptyAction} onPress={() => openModal()}>Add your first transaction</Text>
                ) : dateFilter !== 'All time' ? (
                  <Text style={styles.emptyAction} onPress={() => setDateFilter('All time')}>Show all time</Text>
                ) : null}
              </View>
            )}
            {days.map(({ day, items }) => {
              const daySpent = items.filter((t) => t.type === 'expense' && !isTransfer(t)).reduce((sum, t) => sum + t.amount, 0);
              return (
                <View key={day} style={styles.dayGroup}>
                  <View style={styles.dayHeader}>
                    <Text style={styles.dayLabel}>{dayLabel(day)}</Text>
                    {daySpent > 0 && <Text style={styles.dayTotal}>−{formatCurrency(daySpent)}</Text>}
                  </View>
                  <View style={styles.dayCard}>
                    {items.map((item, index) => renderTransaction(item, index === items.length - 1))}
                  </View>
                </View>
              );
            })}
            {days.length > 0 && <Text style={styles.footnote}>Tap to edit · long-press to delete</Text>}
          </View>
        </ScrollView>
      ) : (
        <CategoryBreakdown
          categorySummary={categorySummary}
          totals={totals}
          selectedPeriod={selectedPeriod}
          onPeriodChange={setSelectedPeriod}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}

      {/* Period picker */}
      <Modal visible={showPeriods} transparent animationType="fade" onRequestClose={() => setShowPeriods(false)}>
        <Pressable style={styles.backdrop} onPress={() => setShowPeriods(false)}>
          <Pressable style={[styles.sheet, { paddingBottom: 24 + (Platform.OS === 'ios' ? 12 : 0) }]} onPress={() => {}}>
            <Text style={styles.sheetTitle}>Show transactions from</Text>
            {DATE_FILTERS.map((filter) => {
              const active = dateFilter === filter;
              return (
                <TouchableOpacity
                  key={filter}
                  style={styles.sheetOption}
                  onPress={() => {
                    setDateFilter(filter);
                    if (filter !== 'Custom') setShowPeriods(false);
                  }}
                >
                  <Text style={[styles.sheetOptionText, active && styles.sheetOptionTextActive]}>{filter}</Text>
                  {active && <MaterialCommunityIcons name="check" size={20} color={theme.colors.primary} />}
                </TouchableOpacity>
              );
            })}

            {dateFilter === 'Custom' && (
              <>
                <View style={styles.customRange}>
                  <TouchableOpacity style={styles.dateField} onPress={() => setPickerTarget('start')}>
                    <Text style={styles.dateFieldLabel}>From</Text>
                    <Text style={styles.dateFieldValue}>{formatShortDate(parseLocalDate(customStart))}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.dateField} onPress={() => setPickerTarget('end')}>
                    <Text style={styles.dateFieldLabel}>To</Text>
                    <Text style={styles.dateFieldValue}>{formatShortDate(parseLocalDate(customEnd))}</Text>
                  </TouchableOpacity>
                </View>
                {pickerTarget && (
                  <DateTimePicker
                    value={parseLocalDate(pickerTarget === 'start' ? customStart : customEnd)}
                    mode="date"
                    display={Platform.OS === 'ios' ? 'inline' : 'default'}
                    onChange={handleDatePicked}
                    themeVariant={theme.isDark ? 'dark' : 'light'}
                    accentColor={theme.colors.primary}
                  />
                )}
                <TouchableOpacity style={styles.sheetDone} onPress={() => setShowPeriods(false)}>
                  <Text style={styles.sheetDoneText}>Done</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}
function createStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    centerContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 40,
      paddingBottom: 12,
    },
    headerTitle: {
      fontSize: 26,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 16,
      gap: 8,
    },
    tabContainer: {
      flex: 1,
      flexDirection: 'row',
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      padding: 3,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    tab: {
      flex: 1,
      paddingVertical: 7,
      borderRadius: 8,
      alignItems: 'center',
    },
    activeTab: {
      backgroundColor: theme.colors.background,
    },
    tabText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    activeTabText: {
      color: theme.colors.text,
    },
    scrollView: {
      flex: 1,
    },
    periodButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      maxWidth: 150,
      backgroundColor: theme.colors.surface,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 10,
      paddingVertical: 8,
    },
    periodButtonText: {
      flexShrink: 1,
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: theme.colors.surface,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 20,
      paddingTop: 20,
    },
    sheetTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
      marginBottom: 8,
    },
    sheetOption: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 12,
    },
    sheetOptionText: {
      fontSize: 16,
      color: theme.colors.text,
    },
    sheetOptionTextActive: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
    sheetDone: {
      marginTop: 16,
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 12,
      alignItems: 'center',
    },
    sheetDoneText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    customRange: {
      flexDirection: 'row',
      marginTop: 8,
      gap: 8,
    },
    dateField: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    dateFieldLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    dateFieldValue: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text,
      marginTop: 2,
    },
    summaryRow: {
      flexDirection: 'row',
      gap: 10,
      marginHorizontal: 16,
      marginTop: 14,
    },
    summaryTile: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    summaryTileActive: {
      borderColor: theme.colors.primary,
    },
    summaryLabel: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    summaryValue: {
      fontSize: 20,
      fontWeight: '700',
      color: theme.colors.text,
      marginTop: 2,
    },
    filterHint: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginHorizontal: 16,
      marginTop: 8,
    },
    filterClear: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
    transactionsContainer: {
      paddingHorizontal: 16,
      paddingTop: 4,
    },
    empty: {
      alignItems: 'center',
      marginTop: 40,
    },
    emptyText: {
      fontSize: 15,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
    emptyAction: {
      fontSize: 15,
      color: theme.colors.primary,
      fontWeight: '600',
      marginTop: 10,
    },
    dayGroup: {
      marginTop: 16,
    },
    dayHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      paddingHorizontal: 4,
      marginBottom: 6,
    },
    dayLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    dayTotal: {
      fontSize: 13,
      color: theme.colors.textSecondary,
    },
    dayCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      paddingHorizontal: 12,
    },
    transactionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
    },
    rowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.border,
    },
    categoryIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    categoryEmoji: {
      fontSize: 18,
    },
    transactionDetails: {
      flex: 1,
      marginRight: 8,
    },
    transactionCategory: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text,
    },
    transactionDescription: {
      color: theme.colors.textSecondary,
      fontSize: 13,
      marginTop: 2,
    },
    transactionAmount: {
      fontSize: 15,
      fontWeight: '600',
    },
    footnote: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: 16,
    },
  });
}
