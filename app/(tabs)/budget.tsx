import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { getBudgetService, getAccountService, BudgetSummary } from '../../database';

export default function BudgetScreen() {
  const { theme } = useTheme();
  const { formatCurrency, selectedProfileId } = useSettings();
  const styles = createStyles(theme);

  const [budgetData, setBudgetData] = useState<BudgetSummary | null>(null);
  const [accountBalance, setAccountBalance] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadBudgetData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1;
      const profileId = selectedProfileId === 'all' ? undefined : selectedProfileId;

      const budgetService = getBudgetService();
      const summary = budgetService.getMonthlyBudgetSummary(year, month, profileId);
      setBudgetData(summary);

      const accountService = getAccountService();
      const balance = accountService.getTotalAccountsBalance(profileId);
      setAccountBalance(balance);
    } catch (error) {
      console.error("Error loading budget data:", error);
    } finally {
      setLoading(false);
    }
  }, [selectedProfileId]);

  useFocusEffect(
    useCallback(() => {
      loadBudgetData();
    }, [loadBudgetData])
  );

  const getProgressPercentage = (spent: number, limit: number) => {
    if (limit === 0) return 0;
    return Math.min((spent / limit) * 100, 100);
  };

  const now = new Date();
  const periodLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const periodRangeLabel = `${monthStart} - ${monthEnd}`;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={loadBudgetData} tintColor={theme.colors.primary} />
      }
    >
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerSubtext}>Account balance</Text>
        <Text style={styles.headerAmount}>{formatCurrency(accountBalance)}</Text>
        <Text style={styles.headerPeriod}>📅 {periodLabel} • {periodRangeLabel}</Text>
      </View>

      {loading && !budgetData ? (
        <ActivityIndicator size="large" color={theme.colors.primary} style={{ marginTop: 40 }} />
      ) : budgetData && (
        <View style={styles.budgetOverview}>
          <View style={styles.budgetRow}>
            <View style={styles.budgetCard}>
              <Text style={styles.budgetLabel}>Budget</Text>
              <Text style={styles.budgetTitle}>EXPENSES</Text>
              <Text style={styles.budgetSubtext}>Available</Text>
              <Text style={styles.availableAmount}>{formatCurrency(budgetData.available)}</Text>
            </View>
            <View style={styles.budgetCard}>
              <Text style={styles.budgetLabel}>Budget</Text>
              <Text style={styles.budgetTitle}>INCOME</Text>
              {/* Income budget can be implemented later */}
            </View>
          </View>

          <View style={styles.budgetBar}>
            <Text style={styles.budgetBarLabel}>Expense budget</Text>
            <Text style={styles.budgetBarAmount}>{formatCurrency(budgetData.spent)}</Text>
            <View style={styles.progressContainer}>
              <View style={styles.progressBar}>
                <View 
                  style={[
                    styles.progressFill, 
                    { 
                      width: `${getProgressPercentage(budgetData.spent, budgetData.expenseLimit)}%`,
                      backgroundColor: budgetData.spent > budgetData.expenseLimit ? '#ef4444' : '#14b8a6'
                    }
                  ]} 
                />
              </View>
              <Text style={styles.progressLimit}>Limit: {formatCurrency(budgetData.expenseLimit)}</Text>
            </View>
          </View>

          <View style={styles.categoriesContainer}>
            <Text style={styles.categoriesTitle}>Budgeted categories</Text>
            {budgetData.categories.map((category, index) => (
              <View key={index} style={styles.categoryItem}>
                <View style={styles.categoryHeader}>
                  <View style={styles.categoryLeft}>
                    <View style={[styles.categoryIcon, { backgroundColor: category.color }]}>
                      <Text style={styles.categoryEmoji}>{category.icon}</Text>
                    </View>
                    <Text style={styles.categoryName}>{category.name}</Text>
                  </View>
                  <Text style={styles.categoryAmount}>{formatCurrency(category.spent)}</Text>
                </View>
                <View style={styles.categoryProgress}>
                  <View style={styles.progressContainer}>
                    <View style={styles.progressBar}>
                      <View 
                        style={[
                          styles.progressFill, 
                          { 
                            width: `${getProgressPercentage(category.spent, category.limit)}%`,
                            backgroundColor: category.color
                          }
                        ]} 
                      />
                    </View>
                    <Text style={styles.categoryLimit}>{formatCurrency(category.limit)}</Text>
                  </View>
                  <Text style={styles.categorySpent}>{formatCurrency(category.spent)}</Text>
                </View>
              </View>
            ))}
          </View>

          <View style={styles.unbudgetedContainer}>
            <Text style={styles.unbudgetedTitle}>Unbudgeted</Text>
            <View style={styles.unbudgetedGrid}>
              {budgetData.unbudgeted.map((item, index) => (
                <TouchableOpacity key={index} style={styles.unbudgetedItem}>
                  <Text style={styles.unbudgetedIcon}>{item.icon}</Text>
                  <Text style={styles.unbudgetedName}>{item.name}</Text>
                  <Text style={styles.unbudgetedAmount}>{formatCurrency(item.amount)}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
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
  budgetOverview: {
    backgroundColor: theme.colors.surface,
    margin: 16,
    borderRadius: 12,
    padding: 20,
  },
  budgetRow: {
    flexDirection: 'row',
    marginBottom: 20,
  },
  budgetCard: {
    flex: 1,
    marginRight: 16,
  },
  budgetLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginBottom: 4,
  },
  budgetTitle: {
    color: theme.colors.error,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  budgetSubtext: {
    color: theme.colors.textSecondary,
    fontSize: 12,
  },
  availableAmount: {
    color: theme.colors.text,
    fontSize: 20,
    fontWeight: 'bold',
  },
  budgetBar: {
    marginBottom: 24,
  },
  budgetBarLabel: {
    color: theme.colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  budgetBarAmount: {
    color: theme.colors.error,
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressContainer: {
    marginBottom: 4,
  },
  progressBar: {
    height: 8,
    backgroundColor: theme.colors.card,
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLimit: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    textAlign: 'right',
  },
  categoriesContainer: {
    marginBottom: 24,
  },
  categoriesTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    color: theme.colors.text,
  },
  categoryItem: {
    marginBottom: 20,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoryIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  categoryEmoji: {
    fontSize: 16,
    color: '#fff',
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '500',
    color: theme.colors.text,
  },
  categoryAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: theme.colors.error,
  },
  categoryProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryLimit: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    textAlign: 'right',
  },
  categorySpent: {
    color: theme.colors.text,
    fontSize: 12,
    fontWeight: '500',
    marginLeft: 8,
  },
  unbudgetedContainer: {
    marginTop: 8,
  },
  unbudgetedTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 16,
    color: theme.colors.text,
  },
  unbudgetedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  unbudgetedItem: {
    width: '48%',
    backgroundColor: theme.colors.card,
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 8,
  },
  unbudgetedIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  unbudgetedName: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },
  unbudgetedAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
  },
});
