import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, StatusBar } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DatabaseService from '../../database/database';
import { Transaction } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import CategoryBreakdown from '../../components/CategoryBreakdown';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TransactionsScreen() {
  const { theme } = useTheme();
  const { formatCurrency } = useSettings();
  const styles = createStyles(theme);
  
  // Shared state
  const [activeTab, setActiveTab] = useState<'transactions' | 'categories'>('transactions');
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('This Month');
  
  // Transactions state
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [selectedFilter, setSelectedFilter] = useState('All');
  
  // Categories state
  const [categorySummary, setCategorySummary] = useState<{category: string, amount: number, color: string, percentage: number}[]>([]);
  const [totals, setTotals] = useState({ expenses: 0, balance: 0, income: 0 });

  useEffect(() => {
    loadTransactions();
    loadCategoryData();
  }, [selectedPeriod]);

  useFocusEffect(
    React.useCallback(() => {
      loadTransactions();
      loadCategoryData();
    }, [selectedPeriod])
  );

  const loadTransactions = async () => {
    try {
      const data = DatabaseService.getTransactions();
      setTransactions(data);
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryData = async () => {
    try {
      let startDate: string, endDate: string;
      const now = new Date();

      if (selectedPeriod === 'This Month') {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        startDate = monthStart.toISOString().split('T')[0];
        endDate = monthEnd.toISOString().split('T')[0];
      } else if (selectedPeriod === 'This Week') {
        const weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        const weekEnd = new Date(now.setDate(now.getDate() - now.getDay() + 6));
        startDate = weekStart.toISOString().split('T')[0];
        endDate = weekEnd.toISOString().split('T')[0];
      } else {
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 1);
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        startDate = threeMonthsAgo.toISOString().split('T')[0];
        endDate = monthEnd.toISOString().split('T')[0];
      }

      const expenses = DatabaseService.getTotalExpenses(startDate, endDate);
      const income = DatabaseService.getTotalIncome(startDate, endDate);
      const balance = DatabaseService.getAccountBalance();
      const summary = DatabaseService.getCategorySummary(startDate, endDate);

      const totalExpenses = expenses;
      const summaryWithPercentage = summary.map(item => ({
        ...item,
        percentage: totalExpenses > 0 ? (item.amount / totalExpenses) * 100 : 0
      }));

      setTotals({
        expenses,
        income,
        balance: balance?.totalBalance || 0
      });
      setCategorySummary(summaryWithPercentage);
    } catch (error) {
      console.error('Error loading category data:', error);
    }
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };
  const getFilteredTransactions = () => {
    if (selectedFilter === 'All') return transactions;
    return transactions.filter(t => t.type === selectedFilter.toLowerCase());
  };
  const renderTransaction = ({ item }: { item: Transaction }) => (
    <View style={styles.transactionCard}>
      <View style={styles.transactionHeader}>
        <View style={styles.transactionLeft}>
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
          <View>
            <Text style={styles.transactionCategory}>{item.category}</Text>
            <Text style={styles.transactionPayment}>
              {item.paymentMethod === 'credit_card' ? '💳 Credit card' : 
               item.paymentMethod === 'debit_card' ? '💳 Debit card' : '💵 Cash'}
            </Text>
          </View>
        </View>
        <Text style={[
          styles.transactionAmount,
          { color: item.type === 'income' ? theme.colors.success : theme.colors.error }
        ]}>
          {item.type === 'expense' ? '-' : '+'}{formatCurrency(item.amount)}
        </Text>
      </View>
      {item.description && (
        <Text style={styles.transactionDescription}>{item.description}</Text>
      )}
      <Text style={styles.transactionDate}>{formatDate(item.date)}</Text>
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.centerContainer, { backgroundColor: theme.colors.background }]}>
        <Text style={{ color: theme.colors.text }}>Loading transactions...</Text>
      </View>
    );
  }

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
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
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
          </View>
          <View style={styles.transactionsContainer}>
            <Text style={styles.transactionsTitle}>
              Recent Transactions ({getFilteredTransactions().length})
            </Text>
            {getFilteredTransactions().map((item) => (
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
      paddingVertical: 16,
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
    transactionCard: {
      backgroundColor: theme.colors.surface,
      marginVertical: 4,
      padding: 16,
      borderRadius: 8,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
    },
    transactionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    transactionLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    categoryIcon: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: theme.colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    categoryEmoji: {
      fontSize: 20,
    },
    transactionCategory: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
    },
    transactionPayment: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    transactionAmount: {
      fontSize: 18,
      fontWeight: 'bold',
    },
    transactionDescription: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      marginBottom: 4,
    },
    transactionDate: {
      color: theme.colors.textSecondary,
      fontSize: 12,
    },
  });
}
