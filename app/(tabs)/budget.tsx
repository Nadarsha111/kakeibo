import React, { useState, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, RefreshControl, ActivityIndicator, SafeAreaView, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { getBudgetService, getAccountService, BudgetSummary } from '../../database';
import AddEditBudgetModal from '../../components/AddEditBudgetModal';
import { useTabBarInset } from '../../components/PebbleTabBar';

export default function BudgetScreen() {
  const tabInset = useTabBarInset();
  const { theme } = useTheme();
  const { formatCurrency, selectedProfileId } = useSettings();
  const styles = createStyles(theme);

  const [budgetData, setBudgetData] = useState<BudgetSummary | null>(null);
  const [accountBalance, setAccountBalance] = useState(0);
  const [loading, setLoading] = useState(true);
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [budgetToEdit, setBudgetToEdit] = useState<any | null>(null); // Using 'any' to match category data structure

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

  const handleAddBudget = () => {
    setBudgetToEdit(null);
    setShowAddEditModal(true);
  };

  const handleEditBudget = (category: any) => {
    // The modal expects a BudgetWithCategory, but our summary has a different structure.
    // We need to find the full budget object to pass to the modal.
    const budgetService = getBudgetService();
    const allBudgets = budgetService.getBudgets();
    const fullBudget = allBudgets.find(b => b.categoryName === category.name);
    setBudgetToEdit(fullBudget);
    setShowAddEditModal(true);
  };

  const handleDeleteBudget = (category: any) => {
    Alert.alert('Delete Budget', `Are you sure you want to delete the budget for "${category.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          const budgetService = getBudgetService();
          const allBudgets = budgetService.getBudgets();
          const fullBudget = allBudgets.find(b => b.categoryName === category.name);
          if (fullBudget) {
            budgetService.deleteBudget(fullBudget.id);
            loadBudgetData();
          }
        },
      },
    ]);
  };

  const now = new Date();
  const periodLabel = now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const periodRangeLabel = `${monthStart} - ${monthEnd}`;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: tabInset }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={loadBudgetData} tintColor={theme.colors.primary} />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.headerSubtext}>Account balance</Text>
            <Text style={styles.headerAmount}>{formatCurrency(accountBalance)}</Text>
            <Text style={styles.headerPeriod}>📅 {periodLabel} • {periodRangeLabel}</Text>
          </View>
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
              <View style={styles.sectionHeader}>
                <Text style={styles.categoriesTitle}>Budgeted categories</Text>
                <TouchableOpacity style={styles.addButton} onPress={handleAddBudget}>
                  <MaterialCommunityIcons name="plus" size={24} color={theme.colors.primary} />
                </TouchableOpacity>
              </View>
              {budgetData.categories.map((category, index) => (
                <View key={index} style={styles.budgetItemCard}>
                  <View style={styles.budgetItemHeader}>
                    <View style={styles.budgetItemInfo}>
                      <View style={[styles.iconContainer, { backgroundColor: `${category.color}20` }]}>
                        <Text style={styles.iconEmoji}>{category.icon}</Text>
                      </View>
                      <Text style={styles.categoryName}>{category.name}</Text>
                    </View>
                    <View style={styles.actions}>
                      <TouchableOpacity style={styles.actionButton} onPress={() => handleEditBudget(category)}>
                        <MaterialCommunityIcons name="pencil" size={22} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.actionButton} onPress={() => handleDeleteBudget(category)}>
                        <MaterialCommunityIcons name="delete" size={22} color={theme.colors.error} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  <View style={styles.budgetProgress}>
                    <Text style={styles.budgetAmount}>{formatCurrency(category.spent)}</Text>
                    <Text style={styles.budgetLimit}> / {formatCurrency(category.limit)}</Text>
                  </View>
                  <View style={styles.categoryProgressBarContainer}>
                    <View style={[styles.categoryProgressFill, { width: `${getProgressPercentage(category.spent, category.limit)}%`, backgroundColor: category.color }]} />
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
      <AddEditBudgetModal
        visible={showAddEditModal}
        onClose={() => {
          setShowAddEditModal(false);
          setBudgetToEdit(null);
        }}
        onSave={() => {
          setShowAddEditModal(false);
          loadBudgetData();
        }}
        budgetToEdit={budgetToEdit}
      />
    </SafeAreaView>
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  categoriesTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  addButton: {
    padding: 4,
  },
    budgetItemCard: {
      backgroundColor: theme.colors.card,
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
    },
    budgetItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    budgetItemInfo: {
      flexDirection: 'row',
      alignItems: 'center',
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  iconEmoji: { fontSize: 20 },
    categoryName: { 
      fontSize: 16, 
      fontWeight: "600", 
      color: theme.colors.text,
      flexShrink: 1, // Prevent long names from pushing actions off-screen
      marginRight: 8,
    },
  budgetProgress: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: 2,
  },
  budgetAmount: {
    fontSize: 14,
    color: theme.colors.text,
    fontWeight: '500',
  },
  budgetLimit: {
    fontSize: 12,
    color: theme.colors.textSecondary,
  },
  categoryProgressBarContainer: {
    height: 6,
    backgroundColor: theme.colors.border,
    borderRadius: 3,
      marginTop: 4,
  },
  categoryProgressFill: {
    height: '100%',
    borderRadius: 3,
  },
    actions: { flexDirection: "row", alignItems: 'center' },
  actionButton: { padding: 8 },
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
