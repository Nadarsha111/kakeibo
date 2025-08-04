import React, { useState, useEffect } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DatabaseService from '../../database/database';
import { Transaction } from '../types';

export default function TransactionsScreen() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFilter, setSelectedFilter] = useState('All');
  const [weeklyData, setWeeklyData] = useState<{income: number, expense: number}>({income: 0, expense: 0});
  const [categorySummary, setCategorySummary] = useState<{category: string, amount: number, color: string}[]>([]);

  useEffect(() => {
    loadTransactions();
    loadChartData();
  }, []);

  // Reload data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadTransactions();
      loadChartData();
    }, [])
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

  const loadChartData = () => {
    try {
      // Get current week's data
      const today = new Date();
      const startOfWeek = new Date(today.setDate(today.getDate() - today.getDay()));
      const endOfWeek = new Date(today.setDate(today.getDate() - today.getDay() + 6));
      
      const startDate = startOfWeek.toISOString().split('T')[0];
      const endDate = endOfWeek.toISOString().split('T')[0];
      
      const weekIncome = DatabaseService.getTotalIncome(startDate, endDate);
      const weekExpenses = DatabaseService.getTotalExpenses(startDate, endDate);
      const categoryData = DatabaseService.getCategorySummary(startDate, endDate);
      
      setWeeklyData({ income: weekIncome, expense: weekExpenses });
      setCategorySummary(categoryData.slice(0, 5)); // Top 5 categories
    } catch (error) {
      console.error('Error loading chart data:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    });
  };

  const getFilteredTransactions = () => {
    if (selectedFilter === 'All') return transactions;
    return transactions.filter(t => t.type === selectedFilter.toLowerCase());
  };

  const renderWeeklyChart = () => {
    const maxAmount = Math.max(weeklyData.income, weeklyData.expense);
    const incomeHeight = maxAmount > 0 ? (weeklyData.income / maxAmount) * 100 : 0;
    const expenseHeight = maxAmount > 0 ? (weeklyData.expense / maxAmount) * 100 : 0;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>This Week Overview</Text>
        <View style={styles.barChart}>
          <View style={styles.barGroup}>
            <View style={styles.barContainer}>
              <View style={[styles.bar, styles.incomeBar, { height: `${incomeHeight}%` }]} />
            </View>
            <Text style={styles.barLabel}>Income</Text>
            <Text style={styles.barAmount}>{formatCurrency(weeklyData.income)}</Text>
          </View>
          <View style={styles.barGroup}>
            <View style={styles.barContainer}>
              <View style={[styles.bar, styles.expenseBar, { height: `${expenseHeight}%` }]} />
            </View>
            <Text style={styles.barLabel}>Expenses</Text>
            <Text style={styles.barAmount}>{formatCurrency(weeklyData.expense)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCategoryChart = () => {
    const maxAmount = Math.max(...categorySummary.map(cat => cat.amount));
    
    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Top Categories</Text>
        <View style={styles.categoryChart}>
          {categorySummary.map((category, index) => {
            const percentage = maxAmount > 0 ? (category.amount / maxAmount) * 100 : 0;
            return (
              <View key={index} style={styles.categoryRow}>
                <View style={styles.categoryInfo}>
                  <View style={[styles.categoryColorDot, { backgroundColor: category.color }]} />
                  <Text style={styles.categoryLabel}>{category.category}</Text>
                </View>
                <View style={styles.categoryBarContainer}>
                  <View style={[styles.categoryBar, { width: `${percentage}%`, backgroundColor: category.color }]} />
                </View>
                <Text style={styles.categoryAmount}>{formatCurrency(category.amount)}</Text>
              </View>
            );
          })}
        </View>
      </View>
    );
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
          { color: item.type === 'income' ? '#10b981' : '#ef4444' }
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
      <View style={styles.centerContainer}>
        <Text>Loading transactions...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Charts Section */}
        {renderWeeklyChart()}
        {renderCategoryChart()}

        {/* Filter Section */}
        <View style={styles.filterContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {['All', 'Income', 'Expense'].map((filter) => (
              <TouchableOpacity
                key={filter}
                style={[
                  styles.filterButton,
                  selectedFilter === filter && styles.filterButtonActive
                ]}
                onPress={() => setSelectedFilter(filter)}
              >
                <Text style={[
                  styles.filterButtonText,
                  selectedFilter === filter && styles.filterButtonTextActive
                ]}>
                  {filter}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Transactions List */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scrollView: {
    flex: 1,
  },
  chartContainer: {
    backgroundColor: 'white',
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 20,
    borderRadius: 12,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 16,
  },
  barChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 150,
  },
  barGroup: {
    alignItems: 'center',
    flex: 1,
  },
  barContainer: {
    height: 100,
    width: 40,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  bar: {
    width: '100%',
    borderRadius: 4,
    minHeight: 4,
  },
  incomeBar: {
    backgroundColor: '#10b981',
  },
  expenseBar: {
    backgroundColor: '#ef4444',
  },
  barLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  barAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
  categoryChart: {
    gap: 12,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryColorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  categoryLabel: {
    fontSize: 14,
    color: '#111827',
    minWidth: 80,
  },
  categoryBarContainer: {
    flex: 2,
    height: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    marginHorizontal: 12,
  },
  categoryBar: {
    height: '100%',
    borderRadius: 4,
    minWidth: 8,
  },
  categoryAmount: {
    fontSize: 12,
    color: '#6b7280',
    minWidth: 60,
    textAlign: 'right',
  },
  filterContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  filterButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'white',
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  filterButtonActive: {
    backgroundColor: '#14b8a6',
    borderColor: '#14b8a6',
  },
  filterButtonText: {
    fontSize: 14,
    color: '#6b7280',
  },
  filterButtonTextActive: {
    color: 'white',
  },
  transactionsContainer: {
    paddingHorizontal: 16,
    paddingBottom: 100, // Space for floating action button
  },
  transactionsTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 12,
  },
  transactionCard: {
    backgroundColor: 'white',
    marginVertical: 4,
    padding: 16,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#14b8a6',
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
    backgroundColor: '#f3f4f6',
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
    color: '#111827',
  },
  transactionPayment: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 2,
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  transactionDescription: {
    color: '#6b7280',
    fontSize: 14,
    marginBottom: 4,
  },
  transactionDate: {
    color: '#9ca3af',
    fontSize: 12,
  },
});
