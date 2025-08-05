import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "../context/ThemeContext";
import { SafeAreaView } from "react-native-safe-area-context";
import { ScrollView } from "react-native";
import { useSettings } from "../context/SettingsContext";

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
}

function createStyles(theme: any) {
  return StyleSheet.create({
    container: {
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
    header: {
      marginBottom: 16,
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
    donutChart: {
      width: 150,
      height: 150,
      borderRadius: 75,
      backgroundColor: theme.colors.card,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 20,
      borderColor: theme.colors.primary,
    },
    donutCenterText: {
      fontSize: 18,
      fontWeight: "bold",
      color: theme.colors.text,
    },
    donutCenterLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 4,
    },
    legendContainer: {
      gap: 8,
      marginBottom: 16,
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
}) => {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const {formatCurrency} =useSettings();
  return (
    <SafeAreaView style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
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
        <View>
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
    </SafeAreaView>
  );
};

export default CategoryBreakdown;
