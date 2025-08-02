import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DatabaseService from '../services/database';
import { useTheme } from '../context/ThemeContext';

interface DashboardData {
  totalBalance: number;
  weeklyExpenses: number;
  weeklyIncome: number;
  monthlyExpenses: number;
  categorySummary: Array<{
    category: string;
    amount: number;
    color: string;
  }>;
}

export default function OverviewScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
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

  // Reload data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadDashboardData();
    }, [])
  );

  const loadDashboardData = async () => {
    try {
      // Get current date ranges
      const now = new Date();
      
      // This week: Monday to Sunday (or Sunday to Saturday depending on preference)
      // Let's use Monday as start of week
      const today = new Date(now);
      const dayOfWeek = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // If Sunday, go back 6 days, otherwise go back (dayOfWeek - 1) days
      
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - daysFromMonday);
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      weekEnd.setHours(23, 59, 59, 999);
      
      // This month
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      console.log('Date ranges:', {
        weekStart: weekStart.toISOString().split('T')[0],
        weekEnd: weekEnd.toISOString().split('T')[0],
        monthStart: monthStart.toISOString().split('T')[0],
        monthEnd: monthEnd.toISOString().split('T')[0]
      });

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

      console.log('Loaded data:', {
        balance: balance?.totalBalance,
        weeklyExpenses,
        weeklyIncome,
        monthlyExpenses,
        categorySummary: categorySummary.length
      });

      setData({
        totalBalance: balance?.totalBalance || 0,
        weeklyExpenses: weeklyExpenses || 0,
        weeklyIncome: weeklyIncome || 0,
        monthlyExpenses: monthlyExpenses || 0,
        categorySummary: (categorySummary || []).slice(0, 5), // Top 5 categories
      });
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Set default data on error
      setData({
        totalBalance: 0,
        weeklyExpenses: 0,
        weeklyIncome: 0,
        monthlyExpenses: 0,
        categorySummary: [],
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const renderWeeklyChart = () => {
    const maxAmount = Math.max(data.weeklyIncome, data.weeklyExpenses);
    const incomeHeight = maxAmount > 0 ? (data.weeklyIncome / maxAmount) * 80 : 0;
    const expenseHeight = maxAmount > 0 ? (data.weeklyExpenses / maxAmount) * 80 : 0;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>This Week</Text>
        <View style={styles.barChart}>
          <View style={styles.barGroup}>
            <View style={styles.barContainer}>
              <View style={[styles.bar, styles.incomeBar, { height: incomeHeight }]} />
            </View>
            <Text style={styles.barLabel}>Income</Text>
            <Text style={styles.barAmount}>{formatCurrency(data.weeklyIncome)}</Text>
          </View>
          <View style={styles.barGroup}>
            <View style={styles.barContainer}>
              <View style={[styles.bar, styles.expenseBar, { height: expenseHeight }]} />
            </View>
            <Text style={styles.barLabel}>Expenses</Text>
            <Text style={styles.barAmount}>{formatCurrency(data.weeklyExpenses)}</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCategoriesPieChart = () => {
    const total = data.categorySummary.reduce((sum, cat) => sum + cat.amount, 0);
    
    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Top Categories</Text>
        <View style={styles.pieChartContainer}>
          <View style={styles.pieChart}>
            <Text style={styles.pieChartCenterText}>{formatCurrency(total)}</Text>
            <Text style={styles.pieChartCenterLabel}>Total</Text>
          </View>
          <View style={styles.categoriesLegend}>
            {data.categorySummary.map((category, index) => {
              const percentage = total > 0 ? (category.amount / total) * 100 : 0;
              return (
                <View key={index} style={styles.legendItem}>
                  <View style={[styles.legendDot, { backgroundColor: category.color }]} />
                  <Text style={styles.legendText}>{category.category}</Text>
                  <Text style={styles.legendAmount}>{formatCurrency(category.amount)}</Text>
                  <Text style={styles.legendPercentage}>{percentage.toFixed(1)}%</Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Account Balance Header */}
      <View style={styles.header}>
        <Text style={styles.headerSubtext}>Account balance</Text>
        <Text style={styles.headerAmount}>
          {formatCurrency(data.totalBalance)}
        </Text>
        <Text style={styles.headerPeriod}>
          📅 This Month • {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </Text>
      </View>

      {/* Quick Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Income</Text>
            <Text style={[styles.summaryAmount, { color: theme.colors.success }]}>
              {formatCurrency(data.weeklyIncome)}
            </Text>
            <Text style={styles.summaryPeriod}>This week</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Expenses</Text>
            <Text style={[styles.summaryAmount, { color: theme.colors.error }]}>
              {formatCurrency(data.weeklyExpenses)}
            </Text>
            <Text style={styles.summaryPeriod}>This week</Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Net</Text>
            <Text style={[
              styles.summaryAmount, 
              { color: (data.weeklyIncome - data.weeklyExpenses) >= 0 ? theme.colors.success : theme.colors.error }
            ]}>
              {formatCurrency(data.weeklyIncome - data.weeklyExpenses)}
            </Text>
            <Text style={styles.summaryPeriod}>This week</Text>
          </View>
        </View>
      </View>

      {/* Weekly Chart */}
      {renderWeeklyChart()}

      {/* Categories Pie Chart */}
      {renderCategoriesPieChart()}

      {/* Quick Actions */}
      <View style={styles.actionsContainer}>
        <Text style={styles.actionsTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <View style={styles.actionCard}>
            <Text style={styles.actionIcon}>📊</Text>
            <Text style={styles.actionText}>View Reports</Text>
          </View>
          <View style={styles.actionCard}>
            <Text style={styles.actionIcon}>🎯</Text>
            <Text style={styles.actionText}>Set Budget</Text>
          </View>
          <View style={styles.actionCard}>
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.actionText}>Categories</Text>
          </View>
          <View style={styles.actionCard}>
            <Text style={styles.actionIcon}>⚙️</Text>
            <Text style={styles.actionText}>Settings</Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  headerSubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginBottom: 5,
  },
  headerAmount: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 10,
  },
  headerPeriod: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  summaryContainer: {
    padding: 20,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  summaryCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  summaryAmount: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  summaryPeriod: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  chartContainer: {
    margin: 20,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 20,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  chartTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 20,
  },
  barChart: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'flex-end',
    height: 120,
  },
  barGroup: {
    alignItems: 'center',
    flex: 1,
  },
  barContainer: {
    height: 80,
    width: 40,
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  bar: {
    width: 40,
    borderRadius: 4,
    minHeight: 4,
  },
  incomeBar: {
    backgroundColor: theme.colors.success,
  },
  expenseBar: {
    backgroundColor: theme.colors.error,
  },
  barLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 5,
  },
  barAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginTop: 2,
  },
  pieChartContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pieChart: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 20,
  },
  pieChartCenterText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  pieChartCenterLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    opacity: 0.8,
  },
  categoriesLegend: {
    flex: 1,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  legendText: {
    flex: 1,
    fontSize: 14,
    color: theme.colors.text,
  },
  legendAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginRight: 8,
  },
  legendPercentage: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    width: 40,
    textAlign: 'right',
  },
  actionsContainer: {
    padding: 20,
  },
  actionsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: theme.colors.text,
    marginBottom: 15,
  },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  actionCard: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 20,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    color: theme.colors.text,
    textAlign: 'center',
  },
});
