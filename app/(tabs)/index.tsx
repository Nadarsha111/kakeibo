import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, StyleSheet, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import DatabaseService from "../../database/database";
import { useTheme } from "../../context/ThemeContext";
import SettingsManager from "../../utils/settings";
import { SafeAreaView } from "react-native-safe-area-context";

interface DashboardData {
  totalBalance: number;
  monthlyAccountBalances: Array<{
    accountId: number;
    name: string;
    closingBalance: number;
  }>;
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
    monthlyAccountBalances: [],
    weeklyExpenses: 0,
    weeklyIncome: 0,
    monthlyExpenses: 0,
    categorySummary: [],
  });
  const [isLoading, setIsLoading] = useState(false);

 

  // Reload data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadDashboardData(true); // Force refresh when tab is focused
      
      // Also refresh after a short delay to catch any recent changes
      const timeout = setTimeout(() => {
        loadDashboardData(true);
      }, 500); // Reduced delay for faster updates

      return () => clearTimeout(timeout);
    }, [])
  );

  const loadDashboardData = async (forceRefresh = false) => {
    if (isLoading && !forceRefresh) return; // Prevent multiple simultaneous loads unless forced
    
    setIsLoading(true);
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

      // Batch all database calls for better performance
      const [monthlyAccountBalances, weeklyExpenses, weeklyIncome, monthlyExpenses, categorySummary] = await Promise.all([
        Promise.resolve(DatabaseService.getMonthlyAccountBalances(now.getFullYear(), now.getMonth() + 1)),
        Promise.resolve(DatabaseService.getTotalExpenses(
          weekStart.toISOString().split("T")[0],
          weekEnd.toISOString().split("T")[0]
        )),
        Promise.resolve(DatabaseService.getTotalIncome(
          weekStart.toISOString().split("T")[0],
          weekEnd.toISOString().split("T")[0]
        )),
        Promise.resolve(DatabaseService.getTotalExpenses(
          monthStart.toISOString().split("T")[0],
          monthEnd.toISOString().split("T")[0]
        )),
        Promise.resolve(DatabaseService.getCategorySummary(
          monthStart.toISOString().split("T")[0],
          monthEnd.toISOString().split("T")[0]
        ))
      ]);

      // Calculate total balance from monthly account balances
      const totalBalance = monthlyAccountBalances.reduce((sum, account) => sum + account.closingBalance, 0);

      console.log("Loaded data:", {
        totalBalance,
        monthlyAccountBalances: monthlyAccountBalances.length,
        weeklyExpenses,
        weeklyIncome,
        monthlyExpenses,
        categorySummary: categorySummary.length,
      });

      setData({
        totalBalance,
        monthlyAccountBalances: monthlyAccountBalances || [],
        weeklyExpenses: weeklyExpenses || 0,
        weeklyIncome: weeklyIncome || 0,
        monthlyExpenses: monthlyExpenses || 0,
        categorySummary: (categorySummary || []).slice(0, 5), // Top 5 categories
      });
    } catch (error) {
      console.error("Error loading dashboard data:", error);
      // Set default data on error
      setData({
        totalBalance: 0,
        monthlyAccountBalances: [],
        weeklyExpenses: 0,
        weeklyIncome: 0,
        monthlyExpenses: 0,
        categorySummary: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return SettingsManager.formatCurrency(amount);
  };

  const renderWeeklyChart = () => {
    const maxAmount = Math.max(data.weeklyIncome, data.weeklyExpenses);
    const incomeHeight =
      maxAmount > 0 ? (data.weeklyIncome / maxAmount) * 80 : 0;
    const expenseHeight =
      maxAmount > 0 ? (data.weeklyExpenses / maxAmount) * 80 : 0;

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>This Week</Text>
        <View style={styles.barChart}>
          <View style={styles.barGroup}>
            <View style={styles.barContainer}>
              <View
                style={[styles.bar, styles.incomeBar, { height: incomeHeight }]}
              />
            </View>
            <Text style={styles.barLabel}>Income</Text>
            <Text style={styles.barAmount}>
              {formatCurrency(data.weeklyIncome)}
            </Text>
          </View>
          <View style={styles.barGroup}>
            <View style={styles.barContainer}>
              <View
                style={[
                  styles.bar,
                  styles.expenseBar,
                  { height: expenseHeight },
                ]}
              />
            </View>
            <Text style={styles.barLabel}>Expenses</Text>
            <Text style={styles.barAmount}>
              {formatCurrency(data.weeklyExpenses)}
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderCategoriesPieChart = () => {
    const total = data.categorySummary.reduce(
      (sum, cat) => sum + cat.amount,
      0
    );

    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Top Categories</Text>
        <View style={styles.pieChartContainer}>
          <View style={styles.pieChart}>
            <Text style={styles.pieChartCenterText}>
              {formatCurrency(total)}
            </Text>
            <Text style={styles.pieChartCenterLabel}>Total</Text>
          </View>
          <View style={styles.categoriesLegend}>
            {data.categorySummary.map((category, index) => {
              const percentage =
                total > 0 ? (category.amount / total) * 100 : 0;
              return (
                <View key={index} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendDot,
                      { backgroundColor: category.color },
                    ]}
                  />
                  <Text style={styles.legendText}>{category.category}</Text>
                  <Text style={styles.legendAmount}>
                    {formatCurrency(category.amount)}
                  </Text>
                  <Text style={styles.legendPercentage}>
                    {percentage.toFixed(1)}%
                  </Text>
                </View>
              );
            })}
          </View>
        </View>
      </View>
    );
  };

  const renderAccountBalances = () => {
    return (
      <View style={styles.chartContainer}>
        <Text style={styles.chartTitle}>Monthly Account Balances</Text>
        {data.monthlyAccountBalances.length > 0 ? (
          <View style={styles.accountsList}>
            {data.monthlyAccountBalances.map((account, index) => (
              <View key={account.accountId} style={styles.accountItem}>
                <Text style={styles.accountName}>{account.name}</Text>
                <Text style={styles.accountBalance}>
                  {formatCurrency(account.closingBalance)}
                </Text>
              </View>
            ))}
            <View style={[styles.accountItem, styles.totalAccountItem]}>
              <Text style={styles.totalAccountName}>Total</Text>
              <Text style={styles.totalAccountBalance}>
                {formatCurrency(data.totalBalance)}
              </Text>
            </View>
          </View>
        ) : (
          <Text style={styles.noDataText}>No account data available</Text>
        )}
      </View>
    );
  };

  return (
    <View style={{flex:1,backgroundColor: theme.colors.background}} >
    <ScrollView 
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={isLoading}
          onRefresh={loadDashboardData}
          tintColor={theme.colors.primary}
          colors={[theme.colors.primary]}
        />
      }
    >
      {/* Account Balance Header */}
      <View style={{ ...styles.header, backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }}>
        <Text style={{ ...styles.headerSubtext, color: theme.colors.textSecondary }}>Account balance</Text>
        <Text style={{ ...styles.headerAmount, color: theme.colors.text }}>{formatCurrency(data.totalBalance)}</Text>
        <Text style={{ ...styles.headerPeriod, color: theme.colors.textSecondary }}>
          📅 This Month • {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>
      </View>

      {/* Quick Summary Cards */}
      <View style={styles.summaryContainer}>
        <View style={styles.summaryRow}>
          <View style={{ ...styles.summaryCard, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text style={{ ...styles.summaryLabel, color: theme.colors.textSecondary }}>Income</Text>
            <Text style={{ ...styles.summaryAmount, color: theme.colors.success }}>{formatCurrency(data.weeklyIncome)}</Text>
            <Text style={{ ...styles.summaryPeriod, color: theme.colors.textSecondary }}>This week</Text>
          </View>
          <View style={{ ...styles.summaryCard, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text style={{ ...styles.summaryLabel, color: theme.colors.textSecondary }}>Expenses</Text>
            <Text style={{ ...styles.summaryAmount, color: theme.colors.error }}>{formatCurrency(data.weeklyExpenses)}</Text>
            <Text style={{ ...styles.summaryPeriod, color: theme.colors.textSecondary }}>This week</Text>
          </View>
          <View style={{ ...styles.summaryCard, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text style={{ ...styles.summaryLabel, color: theme.colors.textSecondary }}>Net</Text>
            <Text style={{ ...styles.summaryAmount, color: data.weeklyIncome - data.weeklyExpenses >= 0 ? theme.colors.success : theme.colors.error }}>
              {formatCurrency(data.weeklyIncome - data.weeklyExpenses)}
            </Text>
            <Text style={{ ...styles.summaryPeriod, color: theme.colors.textSecondary }}>This week</Text>
          </View>
        </View>
      </View>

      {/* Weekly Chart */}
      {renderWeeklyChart()}

      {/* Account Balances */}
      {renderAccountBalances()}

      {/* Categories Pie Chart */}
      {renderCategoriesPieChart()}

      {/* Quick Actions */}
      <View style={styles.actionsContainer}>
        <Text style={{ ...styles.actionsTitle, color: theme.colors.text }}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          <View style={{ ...styles.actionCard, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text style={styles.actionIcon}>📊</Text>
            <Text style={{ ...styles.actionText, color: theme.colors.text }}>View Reports</Text>
          </View>
          <View style={{ ...styles.actionCard, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text style={styles.actionIcon}>🎯</Text>
            <Text style={{ ...styles.actionText, color: theme.colors.text }}>Set Budget</Text>
          </View>
          <View style={{ ...styles.actionCard, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={{ ...styles.actionText, color: theme.colors.text }}>Categories</Text>
          </View>
          <View style={{ ...styles.actionCard, backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text style={styles.actionIcon}>⚙️</Text>
            <Text style={{ ...styles.actionText, color: theme.colors.text }}>Settings</Text>
          </View>
        </View>
      </View>
    </ScrollView>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingTop: 35,
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
      fontWeight: "bold",
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
      flexDirection: "row",
      justifyContent: "space-between",
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
      textTransform: "uppercase",
    },
    summaryAmount: {
      fontSize: 18,
      fontWeight: "bold",
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
      fontWeight: "bold",
      color: theme.colors.text,
      marginBottom: 20,
    },
    barChart: {
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "flex-end",
      height: 120,
    },
    barGroup: {
      alignItems: "center",
      flex: 1,
    },
    barContainer: {
      height: 80,
      width: 40,
      justifyContent: "flex-end",
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
      fontWeight: "bold",
      color: theme.colors.text,
      marginTop: 2,
    },
    pieChartContainer: {
      flexDirection: "row",
      alignItems: "center",
    },
    pieChart: {
      width: 100,
      height: 100,
      borderRadius: 50,
      backgroundColor: theme.colors.primary,
      justifyContent: "center",
      alignItems: "center",
      marginRight: 20,
    },
    pieChartCenterText: {
      fontSize: 16,
      fontWeight: "bold",
      color: "#FFFFFF",
    },
    pieChartCenterLabel: {
      fontSize: 12,
      color: "#FFFFFF",
      opacity: 0.8,
    },
    categoriesLegend: {
      flex: 1,
    },
    legendItem: {
      flexDirection: "row",
      alignItems: "center",
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
      fontWeight: "bold",
      color: theme.colors.text,
      marginRight: 8,
    },
    legendPercentage: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      width: 40,
      textAlign: "right",
    },
    actionsContainer: {
      padding: 20,
    },
    actionsTitle: {
      fontSize: 18,
      fontWeight: "bold",
      color: theme.colors.text,
      marginBottom: 15,
    },
    actionsGrid: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-between",
    },
    actionCard: {
      width: "48%",
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 20,
      alignItems: "center",
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
      textAlign: "center",
    },
    accountsList: {
      marginTop: 10,
    },
    accountItem: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border + "30", // Semi-transparent
    },
    totalAccountItem: {
      borderTopWidth: 2,
      borderTopColor: theme.colors.primary,
      borderBottomWidth: 0,
      marginTop: 8,
      paddingTop: 16,
    },
    accountName: {
      fontSize: 14,
      color: theme.colors.text,
      flex: 1,
    },
    accountBalance: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.text,
    },
    totalAccountName: {
      fontSize: 16,
      fontWeight: "bold",
      color: theme.colors.text,
      flex: 1,
    },
    totalAccountBalance: {
      fontSize: 18,
      fontWeight: "bold",
      color: theme.colors.primary,
    },
    noDataText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginTop: 20,
    },
  });
