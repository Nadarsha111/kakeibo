import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import DatabaseService from '../../database/database';
import { useTheme } from '../../context/ThemeContext';

const screenWidth = Dimensions.get('window').width;

function createStyles(theme:any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 24,
      paddingVertical: 24,
    },
    headerSubtext: {
      color: '#fff',
      fontSize: 14,
      opacity: 0.9,
    },
    headerAmount: {
      color: '#fff',
      fontSize: 28,
      fontWeight: 'bold',
      marginVertical: 8,
    },
    headerPeriod: {
      color: '#fff',
      fontSize: 12,
      opacity: 0.8,
    },
    periodSelector: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.colors.surface,
    },
    periodButton: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginHorizontal: 4,
      borderRadius: 20,
      backgroundColor: theme.colors.card,
      alignItems: 'center',
    },
    periodButtonActive: {
      backgroundColor: theme.colors.primary,
    },
    periodButtonText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    periodButtonTextActive: {
      color: '#fff',
    },
    summaryContainer: {
      backgroundColor: theme.colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 16,
    },
    summaryRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    summaryCard: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 12,
    },
    summaryLabel: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      marginBottom: 4,
    },
    summaryAmount: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    pieChartContainer: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 20,
      borderRadius: 12,
      elevation: 2,
      shadowColor: theme.colors.border,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 3.84,
    },
    emptyChart: {
      height: 200,
      alignItems: 'center',
      justifyContent: 'center',
    },
    emptyChartText: {
      color: theme.colors.textSecondary,
      fontSize: 16,
    },
    pieChart: {
      alignItems: 'center',
      marginBottom: 20,
    },
    donutChart: {
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: theme.colors.card,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 20,
      borderColor: theme.colors.primary,
    },
    donutCenterText: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    donutCenterLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    legendContainer: {
      gap: 8,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 4,
    },
    legendColor: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: 12,
    },
    legendLabel: {
      flex: 1,
      fontSize: 14,
      color: theme.colors.text,
    },
    legendAmount: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginRight: 12,
    },
    legendPercentage: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      minWidth: 40,
      textAlign: 'right',
    },
    categorySection: {
      backgroundColor: theme.colors.surface,
      marginHorizontal: 16,
      marginVertical: 8,
      padding: 20,
      borderRadius: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 16,
    },
    categoryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    categoryCard: {
      width: (screenWidth - 64) / 2,
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
    },
    categoryIconContainer: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
    },
    categoryIcon: {
      fontSize: 24,
      color: '#fff',
    },
    categoryContent: {
      alignItems: 'center',
    },
    categoryName: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 4,
    },
    categoryAmount: {
      fontSize: 16,
      fontWeight: 'bold',
      color: theme.colors.error,
      marginBottom: 4,
    },
    categoryPercentage: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
  });
}

export default function CategoriesScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [selectedPeriod, setSelectedPeriod] = useState('This Month');
  const [categorySummary, setCategorySummary] = useState<{category: string, amount: number, color: string, percentage: number}[]>([]);
  const [totals, setTotals] = useState({ expenses: 0, balance: 0, income: 0 });

  useEffect(() => {
    loadCategoryData();
  }, [selectedPeriod]);

  useFocusEffect(
    React.useCallback(() => {
      loadCategoryData();
    }, [selectedPeriod])
  );

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

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const renderPieChart = () => {
    if (categorySummary.length === 0) {
      return (
        <View style={styles.pieChartContainer}>
          <View style={styles.emptyChart}>
            <Text style={styles.emptyChartText}>No data available</Text>
          </View>
        </View>
      );
    }

    return (
      <View style={styles.pieChartContainer}>
        <View style={styles.pieChart}>
          <View style={styles.donutChart}>
            <Text style={styles.donutCenterText}>
              {formatCurrency(totals.expenses)}
            </Text>
            <Text style={styles.donutCenterLabel}>Total Expenses</Text>
          </View>
        </View>
        <View style={styles.legendContainer}>
          {categorySummary.slice(0, 6).map((category, index) => (
            <View key={index} style={styles.legendItem}>
              <View style={[styles.legendColor, { backgroundColor: category.color }]} />
              <Text style={styles.legendLabel}>{category.category}</Text>
              <Text style={styles.legendAmount}>{formatCurrency(category.amount)}</Text>
              <Text style={styles.legendPercentage}>{category.percentage.toFixed(1)}%</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <Text style={styles.headerSubtext}>Account balance</Text>
        <Text style={styles.headerAmount}>{formatCurrency(totals.balance)}</Text>
        <Text style={styles.headerPeriod}>📅 {selectedPeriod}</Text>
      </View>

      <View style={styles.periodSelector}>
        {['This Week', 'This Month', 'Last 3 Months'].map((period) => (
          <TouchableOpacity
            key={period}
            style={[
              styles.periodButton,
              selectedPeriod === period && styles.periodButtonActive
            ]}
            onPress={() => setSelectedPeriod(period)}
          >
            <Text style={[
              styles.periodButtonText,
              selectedPeriod === period && styles.periodButtonTextActive
            ]}>
              {period}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.summaryContainer}>
        <View style={styles.summaryRow}>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Expenses</Text>
            <Text style={[styles.summaryAmount, { color: theme.colors.error }]}>
              {formatCurrency(totals.expenses)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Income</Text>
            <Text style={[styles.summaryAmount, { color: theme.colors.success }]}>
              {formatCurrency(totals.income)}
            </Text>
          </View>
          <View style={styles.summaryCard}>
            <Text style={styles.summaryLabel}>Net</Text>
            <Text style={[styles.summaryAmount, { color: (totals.income - totals.expenses) >= 0 ? theme.colors.success : theme.colors.error }]}>
              {formatCurrency(totals.income - totals.expenses)}
            </Text>
          </View>
        </View>
      </View>

      {renderPieChart()}

      <View style={styles.categorySection}>
        <Text style={styles.sectionTitle}>Category Breakdown</Text>
        <View style={styles.categoryGrid}>
          {categorySummary.map((category, index) => (
            <TouchableOpacity key={index} style={styles.categoryCard}>
              <View style={[styles.categoryIconContainer, { backgroundColor: category.color }]}>
                <Text style={styles.categoryIcon}>
                  {category.category === 'Transport' ? '🚗' : 
                   category.category === 'Restaurant' ? '🍽️' :
                   category.category === 'Shopping' ? '🛍️' :
                   category.category === 'Food' ? '🍎' :
                   category.category === 'Gift' ? '🎁' :
                   category.category === 'Free time' ? '🎮' :
                   category.category === 'Family' ? '👨‍👩‍👧‍👦' :
                   category.category === 'Health' ? '🏥' : '💰'}
                </Text>
              </View>
              <View style={styles.categoryContent}>
                <Text style={styles.categoryName}>{category.category}</Text>
                <Text style={styles.categoryAmount}>{formatCurrency(category.amount)}</Text>
                <Text style={styles.categoryPercentage}>{category.percentage.toFixed(1)}%</Text>
              </View>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </ScrollView>
  );
}
