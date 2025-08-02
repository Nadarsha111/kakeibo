import React, { useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';

export default function BudgetScreen() {
  const [selectedPeriod, setSelectedPeriod] = useState('JUNE 2023');

  const budgetData = {
    available: 1600,
    expenseLimit: 2900,
    spent: 2200.37,
    categories: [
      { name: 'Transport', spent: 636.84, limit: 600, color: '#10b981' },
      { name: 'Shopping', spent: 573.12, limit: 600, color: '#f97316' },
      { name: 'Restaurant', spent: 516.38, limit: 700, color: '#ef4444' },
      { name: 'Food', spent: 474.03, limit: 1000, color: '#3b82f6' },
    ],
    unbudgeted: [
      { name: 'Fast budget', amount: 149.07, icon: '⚡' },
      { name: 'Gift', amount: 434.72, icon: '🎁' },
      { name: 'Family', amount: 589.07, icon: '👨‍👩‍👧‍👦' },
      { name: 'Free time', amount: 373.12, icon: '🎮' },
    ]
  };

  const formatCurrency = (amount: number) => {
    return `$${amount.toFixed(2)}`;
  };

  const getProgressPercentage = (spent: number, limit: number) => {
    return Math.min((spent / limit) * 100, 100);
  };

  return (
    <ScrollView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerSubtext}>Account balance</Text>
        <Text style={styles.headerAmount}>$8,025.85</Text>
        <Text style={styles.headerPeriod}>📅 {selectedPeriod} • Jun 1, 2023 - Jun 30, 2023</Text>
      </View>

      {/* Budget Overview */}
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
          </View>
        </View>

        {/* Expense Budget Bar */}
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

        {/* Budgeted Categories */}
        <View style={styles.categoriesContainer}>
          <Text style={styles.categoriesTitle}>Budgeted categories</Text>
          {budgetData.categories.map((category, index) => (
            <View key={index} style={styles.categoryItem}>
              <View style={styles.categoryHeader}>
                <View style={styles.categoryLeft}>
                  <View style={[styles.categoryIcon, { backgroundColor: category.color }]}>
                    <Text style={styles.categoryEmoji}>
                      {category.name === 'Transport' ? '🚗' : 
                       category.name === 'Shopping' ? '🛍️' :
                       category.name === 'Restaurant' ? '🍽️' : '🍎'}
                    </Text>
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

        {/* Unbudgeted */}
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
    paddingVertical: 24,
  },
  headerSubtext: {
    color: 'white',
    fontSize: 14,
    opacity: 0.9,
  },
  headerAmount: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
    marginVertical: 8,
  },
  headerPeriod: {
    color: 'white',
    fontSize: 12,
    opacity: 0.8,
  },
  budgetOverview: {
    backgroundColor: 'white',
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
    color: '#6b7280',
    fontSize: 12,
    marginBottom: 4,
  },
  budgetTitle: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  budgetSubtext: {
    color: '#6b7280',
    fontSize: 12,
  },
  availableAmount: {
    color: '#111827',
    fontSize: 20,
    fontWeight: 'bold',
  },
  budgetBar: {
    marginBottom: 24,
  },
  budgetBarLabel: {
    color: '#111827',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  budgetBarAmount: {
    color: '#ef4444',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  progressContainer: {
    marginBottom: 4,
  },
  progressBar: {
    height: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 4,
    overflow: 'hidden',
    marginBottom: 4,
  },
  progressFill: {
    height: '100%',
    borderRadius: 4,
  },
  progressLimit: {
    color: '#6b7280',
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
    color: '#111827',
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
    color: 'white',
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  categoryAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#ef4444',
  },
  categoryProgress: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryLimit: {
    color: '#6b7280',
    fontSize: 12,
    textAlign: 'right',
  },
  categorySpent: {
    color: '#111827',
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
    color: '#111827',
  },
  unbudgetedGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  unbudgetedItem: {
    width: '48%',
    backgroundColor: '#f9fafb',
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
    color: '#6b7280',
    textAlign: 'center',
    marginBottom: 4,
  },
  unbudgetedAmount: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
  },
});
