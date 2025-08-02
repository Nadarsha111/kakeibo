import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import DatabaseService from '../services/database';

interface DashboardData {
  totalBalance: number;
  weeklyExpenses: number;
  weeklyIncome: number;
  monthlyExpenses: number;
  categorySummary: { category: string; amount: number; color: string }[];
}

export default function OverviewScreen() {
  const [data, setData] = useState<DashboardData>({
    totalBalance: 0,
    weeklyExpenses: 0,
    weeklyIncome: 0,
    monthlyExpenses: 0,
    categorySummary: [],
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      // Get current date ranges
      const now = new Date();
      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
      const weekEnd = new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const balance = DatabaseService.getAccountBalance();
      const weeklyExpenses = DatabaseService.getTotalExpenses(
        weekStart.toISOString().split('T')[0],
        weekEnd.toISOString().split('T')[0]
      );
      const weeklyIncome = DatabaseService.getTotalIncome(
        weekStart.toISOString().split('T')[0],
        weekEnd.toISOString().split('T')[0]
      );
      const monthlyExpenses = DatabaseService.getTotalExpenses(
        monthStart.toISOString().split('T')[0],
        monthEnd.toISOString().split('T')[0]
      );
      const categorySummary = DatabaseService.getCategorySummary(
        monthStart.toISOString().split('T')[0],
        monthEnd.toISOString().split('T')[0]
      );

      setData({
        totalBalance: balance?.totalBalance || 0,
        weeklyExpenses,
        weeklyIncome,
        monthlyExpenses,
        categorySummary: categorySummary.slice(0, 5), // Top 5 categories
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  return (
    <ScrollView style={styles.container}>
      {/* Account Balance Header */}
      <View style={styles.header}>
        <Text style={styles.headerSubtext}>Account balance</Text>
        <Text style={styles.headerAmount}>
          {formatCurrency(data.totalBalance)}
        </Text>
      </View>

      {/* Period Selector */}
      <View style={styles.periodSelector}>
        <Text style={styles.periodText}>
          📅 WEEK • Jun 25, 2023 - Jul 1, 2023
        </Text>
      </View>

      {/* Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.expenseLabel}>Expenses</Text>
            <Text style={styles.expenseAmount}>
              {formatCurrency(data.weeklyExpenses)}
            </Text>
          </View>
          <View style={styles.summaryCardCenter}>
            <Text style={styles.balanceLabel}>Balance</Text>
            <Text style={styles.balanceAmount}>
              {formatCurrency(data.totalBalance - data.monthlyExpenses)}
            </Text>
          </View>
          <View style={styles.summaryCardRight}>
            <Text style={styles.incomeLabel}>Income</Text>
            <Text style={styles.incomeAmount}>
              {formatCurrency(data.weeklyIncome)}
            </Text>
          </View>
        </View>

        {/* Chart Placeholder */}
        <View style={styles.chartContainer}>
          <Text style={styles.chartText}>📊 Weekly Chart</Text>
        </View>

        {/* Daily Summary */}
        <View style={styles.dailySummary}>
          <View>
            <Text style={styles.dailyLabel}>Day (average)</Text>
            <Text style={styles.dailyAmount}>
              {formatCurrency(data.weeklyExpenses / 7)}
            </Text>
          </View>
          <View>
            <Text style={styles.dailyLabel}>Week</Text>
            <Text style={styles.dailyAmount}>
              {formatCurrency(data.weeklyExpenses)}
            </Text>
          </View>
        </View>
      </View>

      {/* Category Breakdown */}
      <View style={styles.categoryContainer}>
        <Text style={styles.categoryTitle}>Top Categories</Text>
        {data.categorySummary.map((item, index) => (
          <View key={index} style={styles.categoryRow}>
            <View style={styles.categoryLeft}>
              <View 
                style={[styles.categoryDot, { backgroundColor: item.color }]}
              />
              <Text style={styles.categoryName}>{item.category}</Text>
            </View>
            <Text style={styles.categoryAmount}>
              {formatCurrency(item.amount)}
            </Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    backgroundColor: '#14b8a6',
    paddingHorizontal: 24,
    paddingVertical: 32,
  },
  headerSubtext: {
    color: 'white',
    fontSize: 14,
    opacity: 0.9,
  },
  headerAmount: {
    color: 'white',
    fontSize: 30,
    fontWeight: 'bold',
    marginTop: 4,
  },
  periodSelector: {
    backgroundColor: 'white',
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  periodText: {
    textAlign: 'center',
    color: '#6b7280',
    fontWeight: '500',
  },
  summaryContainer: {
    backgroundColor: 'white',
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  summaryCard: {
    flex: 1,
  },
  summaryCardCenter: {
    flex: 1,
    alignItems: 'center',
  },
  summaryCardRight: {
    flex: 1,
    alignItems: 'flex-end',
  },
  expenseLabel: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '500',
  },
  expenseAmount: {
    color: '#ef4444',
    fontSize: 24,
    fontWeight: 'bold',
  },
  balanceLabel: {
    color: '#6b7280',
    fontSize: 14,
    fontWeight: '500',
  },
  balanceAmount: {
    color: '#111827',
    fontSize: 24,
    fontWeight: 'bold',
  },
  incomeLabel: {
    color: '#10b981',
    fontSize: 14,
    fontWeight: '500',
  },
  incomeAmount: {
    color: '#10b981',
    fontSize: 24,
    fontWeight: 'bold',
  },
  chartContainer: {
    height: 128,
    backgroundColor: '#f3f4f6',
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  chartText: {
    color: '#6b7280',
  },
  dailySummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 24,
  },
  dailyLabel: {
    color: '#6b7280',
    fontSize: 14,
  },
  dailyAmount: {
    color: '#ef4444',
    fontSize: 18,
    fontWeight: '600',
  },
  categoryContainer: {
    backgroundColor: 'white',
    marginTop: 8,
    paddingHorizontal: 24,
    paddingVertical: 24,
  },
  categoryTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
  },
  categoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    marginRight: 12,
  },
  categoryName: {
    color: '#111827',
    fontWeight: '500',
  },
  categoryAmount: {
    color: '#ef4444',
    fontWeight: '600',
  },
});
