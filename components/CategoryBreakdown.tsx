import React, { useState, useEffect, } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, RefreshControl } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useSettings } from "../context/SettingsContext";
import DonutChart from "./DonutChart";
import { useTabBarInset } from './PebbleTabBar';

interface CategorySummary {
  category: string;
  amount: number;
  color: string;
  percentage: number;
}

interface CategoryBreakdownProps {
  categorySummary: CategorySummary[];
  totals: { expenses: number; balance: number; income: number };
  selectedPeriod: string;
  onPeriodChange: (period: string) => void;
  refreshControl?: React.ReactElement<any>;
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      marginBottom: 16,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    headerSubtext: {
      color: theme.colors.textSecondary,
      fontSize: 14,
      opacity: 0.9,
    },
    headerAmount: {
      color: theme.colors.text,
      fontSize: 28,
      fontWeight: "bold",
      marginVertical: 8,
    },
    headerPeriod: {
      color: theme.colors.textSecondary,
      fontSize: 12,
      opacity: 0.8,
    },
    periodSelector: {
      flexDirection: "row",
      paddingVertical: 12,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    periodButton: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginHorizontal: 4,
      borderRadius: 20,
      backgroundColor: theme.colors.card,
      alignItems: "center",
    },
    periodButtonActive: {
      backgroundColor: theme.colors.primary,
    },
    periodButtonText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    periodButtonTextActive: {
      color: "#fff",
    },
    pieChartContainer: {
      alignItems: "center",
      marginBottom: 20,
    },
    legendContainer: {
      gap: 8,
      marginBottom: 16,
      paddingHorizontal: 16,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
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
      textAlign: "right",
    },
    categoryGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
      paddingHorizontal: 16,
    },
    categoryCard: {
      width: "48%",
      backgroundColor: theme.colors.card,
      borderRadius: 12,
      padding: 16,
      alignItems: "center",
      marginBottom: 16,
    },
    categoryIconContainer: {
      width: 50,
      height: 50,
      borderRadius: 25,
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 12,
    },
    categoryIcon: {
      fontSize: 24,
      color: "#fff",
    },
    categoryContent: {
      alignItems: "center",
    },
    categoryName: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.colors.text,
      marginBottom: 4,
    },
    categoryAmount: {
      fontSize: 16,
      fontWeight: "bold",
      color: theme.colors.error,
      marginBottom: 4,
    },
    categoryPercentage: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
  });
}


const CategoryBreakdown: React.FC<CategoryBreakdownProps> = ({
  categorySummary,
  totals,
  selectedPeriod,
  onPeriodChange,
  refreshControl
}) => {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const {formatCurrency} =useSettings();
  const tabInset = useTabBarInset();
  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={{ paddingBottom: tabInset }}
      showsVerticalScrollIndicator={false}
      refreshControl={refreshControl}>
      <View style={styles.header}>
        <Text style={styles.headerSubtext}>Account balance</Text>
        <Text style={styles.headerAmount}>
          {formatCurrency(totals.balance)}
        </Text>
        <Text style={styles.headerPeriod}>📅 {selectedPeriod}</Text>
      </View>
        <View style={styles.periodSelector}>
          {["This Week", "This Month", "Last 3 Months"].map((period) => (
            <TouchableOpacity
              key={period}
              style={[
                styles.periodButton,
                selectedPeriod === period && styles.periodButtonActive,
              ]}
              onPress={() => onPeriodChange(period)}
            >
              <Text
                style={[
                  styles.periodButtonText,
                  selectedPeriod === period && styles.periodButtonTextActive,
                ]}
              >
                {period}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.pieChartContainer}>
          <DonutChart
            slices={categorySummary.map((c) => ({ amount: c.amount, color: c.color }))}
            size={150}
            strokeWidth={20}
            centerValue={formatCurrency(totals.expenses)}
            centerLabel="Total Expenses"
            centerValueColor={theme.colors.text}
            centerLabelColor={theme.colors.textSecondary}
            trackColor={theme.colors.card}
          />
        </View>
        <View style={styles.legendContainer}>
          {categorySummary.slice(0, 6).map((category, index) => (
            <View key={index} style={styles.legendItem}>
              <View
                style={[
                  styles.legendColor,
                  { backgroundColor: category.color },
                ]}
              />
              <Text style={styles.legendLabel}>{category.category}</Text>
              <Text style={styles.legendAmount}>
                {formatCurrency(category.amount)}
              </Text>
              <Text style={styles.legendPercentage}>
                {category.percentage.toFixed(1)}%
              </Text>
            </View>
          ))}
        </View>
        <View style={{ paddingHorizontal: 16 }}>
          <Text
            style={{
              fontSize: 18,
              fontWeight: "600",
              color: theme.colors.text,
              marginBottom: 16,
            }}
          >
            Category Breakdown
          </Text>
          <View style={styles.categoryGrid}>
            {categorySummary.map((category, index) => (
              <View key={index} style={styles.categoryCard}>
                <View
                  style={[
                    styles.categoryIconContainer,
                    { backgroundColor: category.color },
                  ]}
                >
                  <Text style={styles.categoryIcon}>
                    {category.category === "Transport"
                      ? "🚗"
                      : category.category === "Restaurant"
                      ? "🍽️"
                      : category.category === "Shopping"
                      ? "🛍️"
                      : category.category === "Food"
                      ? "🍎"
                      : category.category === "Gift"
                      ? "🎁"
                      : category.category === "Free time"
                      ? "🎮"
                      : category.category === "Family"
                      ? "👨‍👩‍👧‍👦"
                      : category.category === "Health"
                      ? "🏥"
                      : "💰"}
                  </Text>
                </View>
                <View style={styles.categoryContent}>
                  <Text style={styles.categoryName}>{category.category}</Text>
                  <Text style={styles.categoryAmount}>
                    {formatCurrency(category.amount)}
                  </Text>
                  <Text style={styles.categoryPercentage}>
                    {category.percentage.toFixed(1)}%
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>
    </ScrollView>
  );
};

export default CategoryBreakdown;
