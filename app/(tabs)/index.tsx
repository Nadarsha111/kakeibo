import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, RefreshControl } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
// Using the new service architecture for better separation of concerns
import { getAccountService, getTransactionService } from "../../database";
import { useTheme } from "../../context/ThemeContext";
import { useSettings } from "../../context/SettingsContext";

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
  const {formatCurrency} =useSettings();
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
      // Get service instances
      const accountService = getAccountService();
      const transactionService = getTransactionService();
      
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
        Promise.resolve(accountService.getMonthlyAccountBalances(now.getFullYear(), now.getMonth() + 1)),
        Promise.resolve(transactionService.getTotalExpenses(
          weekStart.toISOString().split("T")[0],
          weekEnd.toISOString().split("T")[0]
        )),
        Promise.resolve(transactionService.getTotalIncome(
          weekStart.toISOString().split("T")[0],
          weekEnd.toISOString().split("T")[0]
        )),
        Promise.resolve(transactionService.getTotalExpenses(
          monthStart.toISOString().split("T")[0],
          monthEnd.toISOString().split("T")[0]
        )),
        Promise.resolve(transactionService.getCategorySummary(
          monthStart.toISOString().split("T")[0],
          monthEnd.toISOString().split("T")[0]
        ))
      ]);

      // Calculate total balance from monthly account balances
      const totalBalance = monthlyAccountBalances.reduce((sum: number, account: any) => sum + account.closingBalance, 0);

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

  // const formatCurrency = (amount: number) => {
  //   return SettingsManager.formatCurrency(amount);
  // };

  const renderWeeklyChart = () => {
    const maxAmount = Math.max(data.weeklyIncome, data.weeklyExpenses);
    const incomeHeight =
      maxAmount > 0 ? (data.weeklyIncome / maxAmount) * 80 : 0;
    const expenseHeight =
      maxAmount > 0 ? (data.weeklyExpenses / maxAmount) * 80 : 0;

    return (
      <View className="m-5 bg-white rounded-xl p-5 border border-gray-200" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
        <Text className="text-lg font-bold mb-5" style={{ color: theme.colors.text }}>This Week</Text>
        <View className="flex-row justify-around items-end h-30">
          <View className="items-center flex-1">
            <View className="h-20 w-10 justify-end mb-2.5">
              <View
                className="w-10 rounded min-h-1"
                style={[{ height: incomeHeight, backgroundColor: theme.colors.success }]}
              />
            </View>
            <Text className="text-xs mt-1.25" style={{ color: theme.colors.textSecondary }}>Income</Text>
            <Text className="text-sm font-bold mt-0.5" style={{ color: theme.colors.text }}>
              {formatCurrency(data.weeklyIncome)}
            </Text>
          </View>
          <View className="items-center flex-1">
            <View className="h-20 w-10 justify-end mb-2.5">
              <View
                className="w-10 rounded min-h-1"
                style={[{ height: expenseHeight, backgroundColor: theme.colors.error }]}
              />
            </View>
            <Text className="text-xs mt-1.25" style={{ color: theme.colors.textSecondary }}>Expenses</Text>
            <Text className="text-sm font-bold mt-0.5" style={{ color: theme.colors.text }}>
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
      <View className="m-5 rounded-xl p-5 border" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
        <Text className="text-lg font-bold mb-5" style={{ color: theme.colors.text }}>Top Categories</Text>
        <View className="flex-row items-center">
          <View 
            className="justify-center items-center mr-5 rounded-full"
            style={{ 
              width: 100, 
              height: 100, 
              backgroundColor: theme.colors.primary 
            }}
          >
            <Text className="text-base font-bold text-white">
              {formatCurrency(total)}
            </Text>
            <Text className="text-xs text-white" style={{ opacity: 0.8 }}>
              Total
            </Text>
          </View>
          <View className="flex-1">
            {data.categorySummary.map((category, index) => {
              const percentage =
                total > 0 ? (category.amount / total) * 100 : 0;
              return (
                <View key={index} className="flex-row items-center mb-2">
                  <View
                    className="rounded-full mr-2"
                    style={{ 
                      width: 12, 
                      height: 12, 
                      backgroundColor: category.color 
                    }}
                  />
                  <Text className="flex-1 text-sm" style={{ color: theme.colors.text }}>
                    {category.category}
                  </Text>
                  <Text className="text-sm font-bold mr-2" style={{ color: theme.colors.text }}>
                    {formatCurrency(category.amount)}
                  </Text>
                  <Text 
                    className="text-xs text-right" 
                    style={{ 
                      color: theme.colors.textSecondary,
                      width: 40 
                    }}
                  >
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
      <View className="m-5 bg-white rounded-xl p-5 border border-gray-200" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
        <Text className="text-lg font-bold mb-5" style={{ color: theme.colors.text }}>Monthly Account Balances</Text>
        {data.monthlyAccountBalances.length > 0 ? (
          <View className="mt-2.5">
            {data.monthlyAccountBalances.map((account, index) => (
              <View key={account.accountId} className="flex-row justify-between items-center py-3 border-b border-opacity-30" style={{ borderBottomColor: theme.colors.border }}>
                <Text className="text-sm flex-1" style={{ color: theme.colors.text }}>{account.name}</Text>
                <Text className="text-base font-semibold" style={{ color: theme.colors.text }}>
                  {formatCurrency(account.closingBalance)}
                </Text>
              </View>
            ))}
            <View className="flex-row justify-between items-center pt-4 mt-2 border-t-2" style={{ borderTopColor: theme.colors.primary }}>
              <Text className="text-base font-bold flex-1" style={{ color: theme.colors.text }}>Total</Text>
              <Text className="text-lg font-bold" style={{ color: theme.colors.primary }}>
                {formatCurrency(data.totalBalance)}
              </Text>
            </View>
          </View>
        ) : (
          <Text className="text-sm text-center mt-5" style={{ color: theme.colors.textSecondary }}>No account data available</Text>
        )}
      </View>
    );
  };

  return (
    <View className="flex-1" style={{ backgroundColor: theme.colors.background }}>
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
      <View className="px-5 pt-9 pb-5 border-b" style={{ backgroundColor: theme.colors.surface, borderBottomColor: theme.colors.border }}>
        <Text className="text-sm mb-1" style={{ color: theme.colors.textSecondary }}>Account balance</Text>
        <Text className="text-3xl font-bold mb-2.5" style={{ color: theme.colors.text }}>{formatCurrency(data.totalBalance)}</Text>
        <Text className="text-sm" style={{ color: theme.colors.textSecondary }}>
          📅 This Month • {new Date().toLocaleDateString("en-US", { month: "long", year: "numeric" })}
        </Text>
      </View>

      {/* Quick Summary Cards */}
      <View className="p-5">
        <View className="flex-row justify-between">
          <View className="flex-1 bg-white rounded-xl p-4 mx-1 border" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text className="text-xs mb-2 uppercase" style={{ color: theme.colors.textSecondary }}>Income</Text>
            <Text className="text-lg font-bold mb-1" style={{ color: theme.colors.success }}>{formatCurrency(data.weeklyIncome)}</Text>
            <Text className="text-xs" style={{ color: theme.colors.textSecondary }}>This week</Text>
          </View>
          <View className="flex-1 bg-white rounded-xl p-4 mx-1 border" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text className="text-xs mb-2 uppercase" style={{ color: theme.colors.textSecondary }}>Expenses</Text>
            <Text className="text-lg font-bold mb-1" style={{ color: theme.colors.error }}>{formatCurrency(data.weeklyExpenses)}</Text>
            <Text className="text-xs" style={{ color: theme.colors.textSecondary }}>This week</Text>
          </View>
          <View className="flex-1 bg-white rounded-xl p-4 mx-1 border" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text className="text-xs mb-2 uppercase" style={{ color: theme.colors.textSecondary }}>Net</Text>
            <Text className="text-lg font-bold mb-1" style={{ color: data.weeklyIncome - data.weeklyExpenses >= 0 ? theme.colors.success : theme.colors.error }}>
              {formatCurrency(data.weeklyIncome - data.weeklyExpenses)}
            </Text>
            <Text className="text-xs" style={{ color: theme.colors.textSecondary }}>This week</Text>
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
      <View className="p-5">
        <Text className="text-lg font-bold mb-4" style={{ color: theme.colors.text }}>Quick Actions</Text>
        <View className="flex-row flex-wrap justify-between">
          <View className="w-[48%] bg-white rounded-xl p-5 items-center mb-3 border" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text className="text-2xl mb-2">📊</Text>
            <Text className="text-sm text-center" style={{ color: theme.colors.text }}>View Reports</Text>
          </View>
          <View className="w-[48%] bg-white rounded-xl p-5 items-center mb-3 border" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text className="text-2xl mb-2">🎯</Text>
            <Text className="text-sm text-center" style={{ color: theme.colors.text }}>Set Budget</Text>
          </View>
          <View className="w-[48%] bg-white rounded-xl p-5 items-center mb-3 border" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text className="text-2xl mb-2">📋</Text>
            <Text className="text-sm text-center" style={{ color: theme.colors.text }}>Categories</Text>
          </View>
          <View className="w-[48%] bg-white rounded-xl p-5 items-center mb-3 border" style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}>
            <Text className="text-2xl mb-2">⚙️</Text>
            <Text className="text-sm text-center" style={{ color: theme.colors.text }}>Settings</Text>
          </View>
        </View>
      </View>
    </ScrollView>
    </View>
  );
}
