import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar, RefreshControl, Alert, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { getTransactionService, getAccountService } from '../../database';
import { Transaction } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { formatShortDate } from '../../utils/format';
import CategoryBreakdown from '../../components/CategoryBreakdown';
import { useTransactionModal } from '../../context/TransactionModalContext';
import { useTabBarInset } from '../../components/PebbleTabBar';

type DateFilter = 'All time' | 'Today' | 'This week' | 'This month' | 'Last month' | 'Custom';
const DATE_FILTERS: DateFilter[] = ['All time', 'Today', 'This week', 'This month', 'Last month', 'Custom'];

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

export default function TransactionsScreen() {
  const tabInset = useTabBarInset();
  const { theme } = useTheme();
  const { formatCurrency, selectedProfileId } = useSettings();
  const styles = createStyles(theme);
  
  // Shared state
  const [activeTab, setActiveTab] = useState<'transactions' | 'categories'>('transactions');
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('This Month');
  
  // Transactions state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState<DateFilter>('All time');
  const [customStart, setCustomStart] = useState(() => presetRange('This month')![0]);
  const [customEnd, setCustomEnd] = useState(() => toLocalDateString(new Date()));
  const [pickerTarget, setPickerTarget] = useState<'start' | 'end' | null>(null);
  
  // Categories state
  const [categorySummary, setCategorySummary] = useState<{category: string, amount: number, color: string, percentage: number}[]>([]);
  const [totals, setTotals] = useState({ expenses: 0, balance: 0, income: 0 });

  const { openModal } = useTransactionModal();

  useFocusEffect(
    React.useCallback(() => {
      loadTransactions();
      loadCategoryData();
    }, [selectedPeriod, selectedProfileId])
  );

  const loadTransactions = async () => {
    try {
      const profileId = selectedProfileId === 'all' ? undefined : selectedProfileId;
      const transactionService = getTransactionService();
      const data = transactionService.getTransactions(profileId);
      setTransactions(data);
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
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        startDate = monthStart.toISOString().split('T')[0];
        endDate = monthEnd.toISOString().split('T')[0];
      } else if (selectedPeriod === 'This Week') {
        const firstDayOfWeek = new Date(now);
        firstDayOfWeek.setDate(now.getDate() - now.getDay()); // Assuming Sunday is the first day (0)
        const lastDayOfWeek = new Date(firstDayOfWeek);
        lastDayOfWeek.setDate(firstDayOfWeek.getDate() + 6);
        startDate = firstDayOfWeek.toISOString().split('T')[0];
        endDate = lastDayOfWeek.toISOString().split('T')[0];
      } else {
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        startDate = threeMonthsAgo.toISOString().split('T')[0];
        endDate = monthEnd.toISOString().split('T')[0];
      }

      const transactionService = getTransactionService();
      const accountService = getAccountService();
      
      const expenses = transactionService.getTotalExpenses(startDate, endDate, profileId);
      const income = transactionService.getTotalIncome(startDate, endDate, profileId);
      const balance = accountService.getTotalAccountsBalance(profileId);
      const summary = transactionService.getCategorySummary(startDate, endDate, profileId);

      const totalExpenses = expenses;
      const summaryWithPercentage = summary.map((item: any) => ({
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

  const getFilteredTransactions = () => {
    const range = dateFilter === 'Custom' ? [customStart, customEnd] : presetRange(dateFilter);
    return transactions.filter((t) => {
      if (selectedFilter !== 'All' && t.type !== selectedFilter.toLowerCase()) return false;
      if (range) {
        const day = t.date.slice(0, 10);
        if (day < range[0] || day > range[1]) return false;
      }
      return true;
    });
  };

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

  const renderTransaction = ({ item }: { item: Transaction }) => (
    <TouchableOpacity 
      style={styles.transactionCard} 
      onPress={() => handleEditTransaction(item)}
      onLongPress={() => handleDeleteTransaction(item)}
    >
      <View style={styles.transactionContent}>
        <View style={styles.categoryIcon}>
          <Text style={styles.categoryEmoji}>
            {item.category === 'Transport' ? '🚗' : 
              item.category === 'Restaurant' ? '🍽️' :
              item.category === 'Shopping' ? '🛍️' :
              item.category === 'Food' ? '🍎' :
              item.category === 'Gift' ? '🎁' :
              item.category === 'Free time' ? '🎮' :
              item.category === 'Family' ? '👨‍👩‍👧‍👦' :
              item.category === 'Health' ? '🏥' :
              item.category === 'Salary' ? '💰' : '📈'}
          </Text>
        </View>
        <View style={styles.transactionDetails}>
          <View style={styles.transactionRow}>
            <Text style={styles.transactionCategory}>{item.category}</Text>
            <Text style={[
              styles.transactionAmount,
              { color: item.type === 'income' ? theme.colors.success : theme.colors.error }
            ]}>
              {item.type === 'expense' ? '-' : '+'}{formatCurrency(item.amount)}
            </Text>
          </View>
          <View style={styles.transactionRow}>
            <Text style={styles.transactionDescription}>
              {item.description || item.paymentMethod.replace('_', ' ')}
            </Text>
            <Text style={styles.transactionDate}>{formatShortDate(item.date)}</Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.text }}>Loading transactions...</Text>
      </View>
    );
  }

  const onRefresh = async () => {
    setLoading(true);
    try {
      await loadTransactions();
      await loadCategoryData();
    } catch (error) {
      console.error('Error refreshing data:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTransactions = getFilteredTransactions();
  const filteredIncome = filteredTransactions.filter((t) => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
  const filteredExpenses = filteredTransactions.filter((t) => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Transactions & Analytics</Text>
      </View>

      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "transactions" && styles.activeTab]}
          onPress={() => setActiveTab("transactions")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "transactions" && styles.activeTabText,
            ]}
          >
            Transactions
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "categories" && styles.activeTab]}
          onPress={() => setActiveTab("categories")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "categories" && styles.activeTabText,
            ]}
          >
            Categories
          </Text>
        </TouchableOpacity>
      </View>

      

      {/* Content */}
      {activeTab === "transactions" ? (
        <ScrollView 
          style={styles.scrollView} 
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        >
          <View style={styles.filterContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {['All', 'Income', 'Expense'].map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterButton, selectedFilter === filter && styles.filterButtonActive]}
                  onPress={() => setSelectedFilter(filter)}
                >
                  <Text style={[styles.filterButtonText, selectedFilter === filter && styles.filterButtonTextActive]}>
                    {filter}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {DATE_FILTERS.map((filter) => (
                <TouchableOpacity
                  key={filter}
                  style={[styles.filterButton, dateFilter === filter && styles.filterButtonActive]}
                  onPress={() => setDateFilter(filter)}
                >
                  <Text style={[styles.filterButtonText, dateFilter === filter && styles.filterButtonTextActive]}>
                    {filter}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            {dateFilter === 'Custom' && (
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
            )}
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
          </View>
          <View style={[styles.transactionsContainer, { paddingBottom: tabInset }]}>
            <Text style={styles.transactionsTitle}>
              {dateFilter === 'All time' ? 'Recent Transactions' : 'Transactions'} ({filteredTransactions.length})
            </Text>
            {dateFilter !== 'All time' && filteredTransactions.length > 0 && (
              <Text style={styles.rangeTotals}>
                In {formatCurrency(filteredIncome)} · Out {formatCurrency(filteredExpenses)}
              </Text>
            )}
            {filteredTransactions.length === 0 && (
              <Text style={styles.emptyText}>No transactions in this period.</Text>
            )}
            {filteredTransactions.map((item) => (
              <View key={item.id}>
                {renderTransaction({ item })}
              </View>
            ))}
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
              refreshing={loading}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
        />
      )}
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
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 40,
      paddingBottom: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: theme.colors.text,
    },
    tabContainer: {
      flexDirection: "row",
      backgroundColor: theme.colors.surface,
      marginHorizontal: 20,
      marginTop: 16,
      borderRadius: 8,
      padding: 4,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 6,
      alignItems: "center",
    },
    activeTab: {
      backgroundColor: theme.colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.colors.textSecondary,
    },
    activeTabText: {
      color: "#fff",
    },
    summaryCard: {
      backgroundColor: theme.colors.surface,
      margin: 20,
      padding: 20,
      borderRadius: 16,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    summaryLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 8,
    },
    summaryAmount: {
      fontSize: 32,
      fontWeight: "bold",
      color: theme.colors.text,
      marginBottom: 4,
    },
    accountCount: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    scrollView: {
      flex: 1,
    },
    filterContainer: {
      paddingHorizontal: 16,
      paddingVertical: 12,
    },
    filterButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      marginRight: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    filterButtonActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    filterButtonText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    filterButtonTextActive: {
      color: '#fff',
    },
    transactionsContainer: {
      paddingHorizontal: 16,
      paddingBottom: 100, // Space for floating action button
    },
    transactionsTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 12,
    },
    customRange: {
      flexDirection: 'row',
      marginTop: 12,
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
    rangeTotals: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: -8,
      marginBottom: 12,
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      marginTop: 24,
    },
    transactionCard: {
      backgroundColor: theme.colors.surface,
      marginVertical: 4,
      padding: 16,
      borderRadius: 8,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
    },
    transactionContent: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    categoryIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    categoryEmoji: {
      fontSize: 20,
    },
    transactionDetails: {
      flex: 1,
    },
    transactionRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 2,
    },
    transactionCategory: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
    },
    transactionAmount: {
      fontSize: 16,
      fontWeight: 'bold',
    },
    transactionDescription: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      textTransform: 'capitalize',
    },
    transactionDate: {
      color: theme.colors.textSecondary,
      fontSize: 12,
    },
  });
}
