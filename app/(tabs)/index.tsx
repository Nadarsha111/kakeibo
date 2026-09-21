import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  ScrollView,
  RefreshControl,
  Pressable,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getAccountService, getTransactionService } from "../../database";
import { useTheme } from "../../context/ThemeContext";
import { useSettings } from "../../context/SettingsContext";
import { router } from "expo-router";
import { Account, AccountBalanceRow } from "../../types";
import DonutChart from "../../components/DonutChart";
import TrendChart from "../../components/TrendChart";
import { useTabBarInset } from '../../components/PebbleTabBar';
import NeededThisMonthCard from '../../components/NeededThisMonthCard';
import { groupAccountBalances, type AccountCategory, type BalanceCategory, type LoanBalanceRow } from '../../utils/accountBalances';
import { formatDay } from '../../utils/recurring';

interface DashboardData {
  totalBalance: number;
  monthlyAccountBalances: AccountBalanceRow[];
  weeklyExpenses: number;
  weeklyIncome: number;
  monthlyExpenses: number;
  monthlyIncome: number;
  categorySummary: Array<{
    category: string;
    amount: number;
    color: string;
  }>;
  monthlyTrend: Array<{ month: string; income: number; expenses: number }>;
}

const TREND_MONTHS = 6;

// Loans on the Account Balances card: this many per group until expanded
const LOAN_ROWS_SHOWN = 3;

const ACCOUNT_CATEGORY_EMOJI: Record<AccountCategory, string> = {
  checking: '💳',
  cash: '💵',
  savings: '🏦',
  investment: '📈',
  credit_card: '💰',
};

export default function OverviewScreen() {
  const tabInset = useTabBarInset();
  const { theme } = useTheme();
  const { formatCurrency, selectedProfileId } = useSettings();
  const [data, setData] = useState<DashboardData>({
    totalBalance: 0,
    monthlyAccountBalances: [],
    weeklyExpenses: 0,
    weeklyIncome: 0,
    monthlyExpenses: 0,
    monthlyIncome: 0,
    categorySummary: [],
    monthlyTrend: [],
  });
  const [isLoading, setIsLoading] = useState(false);
  const [loansExpanded, setLoansExpanded] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});

  // Reload data when screen comes into focus
  useFocusEffect(
    React.useCallback(() => {
      loadDashboardData(true); // Force refresh when tab is focused

      // Also refresh after a short delay to catch any recent changes
      const timeout = setTimeout(() => {
        loadDashboardData(true);
      }, 500); // Reduced delay for faster updates

      return () => clearTimeout(timeout);
    }, [selectedProfileId]),
  );

  const loadDashboardData = async (forceRefresh = false) => {
    if (isLoading && !forceRefresh) return; // Prevent multiple simultaneous loads unless forced

    setIsLoading(true);
    try {
      const profileId =
        selectedProfileId === "all" ? undefined : selectedProfileId;
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
      const [
        monthlyAccountBalances,
        weeklyExpenses,
        weeklyIncome,
        monthlyExpenses,
        monthlyIncome,
        categorySummary,
        monthlyTrend,
      ] = await Promise.all([
        Promise.resolve(
          accountService.getMonthlyAccountBalances(profileId),
        ),
        Promise.resolve(
          transactionService.getTotalExpenses(
            weekStart.toISOString().split("T")[0],
            weekEnd.toISOString().split("T")[0],
            profileId,
          ),
        ),
        Promise.resolve(
          transactionService.getTotalIncome(
            weekStart.toISOString().split("T")[0],
            weekEnd.toISOString().split("T")[0],
            profileId,
          ),
        ),
        Promise.resolve(
          transactionService.getTotalExpenses(
            monthStart.toISOString().split("T")[0],
            monthEnd.toISOString().split("T")[0],
            profileId,
          ),
        ),
        Promise.resolve(
          transactionService.getTotalIncome(
            monthStart.toISOString().split("T")[0],
            monthEnd.toISOString().split("T")[0],
            profileId,
          ),
        ),
        Promise.resolve(
          transactionService.getCategorySummary(
            monthStart.toISOString().split("T")[0],
            monthEnd.toISOString().split("T")[0],
            profileId,
          ),
        ),
        Promise.resolve(
          transactionService.getMonthlyTrend(TREND_MONTHS, profileId),
        ),
      ]);

      // Get total balance for the selected profile
      const totalBalance = accountService.getTotalAccountsBalance(profileId);

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
        monthlyIncome: monthlyIncome || 0,
        categorySummary: (categorySummary || []).slice(0, 5), // Top 5 categories
        monthlyTrend: monthlyTrend || [],
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
        monthlyIncome: 0,
        categorySummary: [],
        monthlyTrend: [],
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderWeekSummary = () => {
    const net = data.weeklyIncome - data.weeklyExpenses;
    const tiles = [
      { key: "income", label: "Income", amount: data.weeklyIncome, color: theme.colors.success, icon: "arrow-bottom-left" as const },
      { key: "expenses", label: "Expenses", amount: data.weeklyExpenses, color: theme.colors.error, icon: "arrow-top-right" as const },
      { key: "net", label: "Net", amount: net, color: net >= 0 ? theme.colors.success : theme.colors.error, icon: "swap-vertical" as const },
    ];

    return (
      <View className="px-5">
        <Text className="text-xs uppercase mb-3 ml-1" style={{ color: theme.colors.textSecondary }}>
          This week
        </Text>
        <View className="flex-row" style={{ gap: 12 }}>
          {tiles.map((tile) => (
            <View
              key={tile.key}
              className="flex-1 rounded-xl p-3.5 border"
              style={{ backgroundColor: theme.colors.surface, borderColor: theme.colors.border }}
            >
              <View
                className="items-center justify-center rounded-full mb-3"
                style={{ width: 32, height: 32, backgroundColor: `${tile.color}1F` }}
              >
                <MaterialCommunityIcons name={tile.icon} size={18} color={tile.color} />
              </View>
              <Text className="text-xs mb-1" style={{ color: theme.colors.textSecondary }}>
                {tile.label}
              </Text>
              <Text
                className="text-base font-bold"
                style={{ color: tile.color }}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {formatCurrency(tile.amount)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderWeeklyChart = () => {
    const maxAmount = Math.max(data.weeklyIncome, data.weeklyExpenses);
    const incomeHeight =
      maxAmount > 0 ? (data.weeklyIncome / maxAmount) * 80 : 0;
    const expenseHeight =
      maxAmount > 0 ? (data.weeklyExpenses / maxAmount) * 80 : 0;

    return (
      <View
        className="m-5 bg-white rounded-xl p-5 border border-gray-200"
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        }}
      >
        <Text
          className="text-lg font-bold mb-5"
          style={{ color: theme.colors.text }}
        >
          This Week
        </Text>
        <View className="flex-row justify-around items-end h-30">
          <View className="items-center flex-1">
            <View className="h-20 w-10 justify-end mb-2.5">
              <View
                className="w-10 rounded min-h-1"
                style={[
                  {
                    height: incomeHeight,
                    backgroundColor: theme.colors.success,
                  },
                ]}
              />
            </View>
            <Text
              className="text-xs mt-1.25"
              style={{ color: theme.colors.textSecondary }}
            >
              Income
            </Text>
            <Text
              className="text-sm font-bold mt-0.5"
              style={{ color: theme.colors.text }}
            >
              {formatCurrency(data.weeklyIncome)}
            </Text>
          </View>
          <View className="items-center flex-1">
            <View className="h-20 w-10 justify-end mb-2.5">
              <View
                className="w-10 rounded min-h-1"
                style={[
                  {
                    height: expenseHeight,
                    backgroundColor: theme.colors.error,
                  },
                ]}
              />
            </View>
            <Text
              className="text-xs mt-1.25"
              style={{ color: theme.colors.textSecondary }}
            >
              Expenses
            </Text>
            <Text
              className="text-sm font-bold mt-0.5"
              style={{ color: theme.colors.text }}
            >
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
      0,
    );

    return (
      <View
        className="m-5 rounded-xl p-5 border"
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        }}
      >
        <View className="flex-row justify-between items-baseline mb-4">
          <Text className="text-lg font-bold" style={{ color: theme.colors.text }}>
            Top Categories
          </Text>
          <Text className="text-xs" style={{ color: theme.colors.textSecondary }}>
            Spending this month
          </Text>
        </View>

        {data.categorySummary.length === 0 ? (
          <Text
            className="text-sm text-center py-6"
            style={{ color: theme.colors.textSecondary }}
          >
            No spending recorded this month
          </Text>
        ) : (
          <>
            <View className="items-center mb-5">
              <DonutChart
                slices={data.categorySummary.map((c) => ({ amount: c.amount, color: c.color }))}
                size={140}
                strokeWidth={18}
                centerValue={formatCurrency(total)}
                centerLabel="Total"
                centerValueColor={theme.colors.text}
                centerLabelColor={theme.colors.textSecondary}
                trackColor={theme.colors.border}
              />
            </View>

            {data.categorySummary.map((category, index) => {
              const percentage = total > 0 ? (category.amount / total) * 100 : 0;
              const isLast = index === data.categorySummary.length - 1;
              return (
                <View key={category.category} className={isLast ? "" : "mb-4"}>
                  <View className="flex-row items-center mb-1.5">
                    <View
                      className="rounded-full mr-2.5"
                      style={{ width: 10, height: 10, backgroundColor: category.color }}
                    />
                    <Text
                      className="flex-1 text-sm mr-3"
                      style={{ color: theme.colors.text }}
                      numberOfLines={1}
                    >
                      {category.category}
                    </Text>
                    <Text className="text-sm font-bold" style={{ color: theme.colors.text }}>
                      {formatCurrency(category.amount)}
                    </Text>
                    <Text
                      className="text-xs text-right"
                      style={{ color: theme.colors.textSecondary, width: 44 }}
                    >
                      {percentage > 0 && percentage < 1 ? "<1%" : `${percentage.toFixed(0)}%`}
                    </Text>
                  </View>
                  {/* Share of the categories shown, in the category's own color */}
                  <View
                    className="rounded-full overflow-hidden"
                    style={{ height: 4, backgroundColor: theme.colors.border }}
                  >
                    <View
                      className="rounded-full"
                      style={{
                        height: 4,
                        width: `${percentage}%`,
                        backgroundColor: category.color,
                      }}
                    />
                  </View>
                </View>
              );
            })}
          </>
        )}
      </View>
    );
  };

  const renderMonthlyTrend = () => {
    const savingsRate =
      data.monthlyIncome > 0
        ? ((data.monthlyIncome - data.monthlyExpenses) / data.monthlyIncome) * 100
        : 0;

    return (
      <View
        className="m-5 rounded-xl p-5 border"
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        }}
      >
        <View className="flex-row justify-between items-center mb-1">
          <Text className="text-lg font-bold" style={{ color: theme.colors.text }}>
            Income vs Expenses
          </Text>
          <Text
            className="text-sm font-semibold"
            style={{ color: savingsRate >= 0 ? theme.colors.success : theme.colors.error }}
          >
            {savingsRate >= 0 ? "+" : ""}
            {savingsRate.toFixed(0)}% saved this month
          </Text>
        </View>
        <Text className="text-xs mb-4" style={{ color: theme.colors.textSecondary }}>
          Last {TREND_MONTHS} months
        </Text>
        {data.monthlyTrend.length > 0 ? (
          <TrendChart
            data={data.monthlyTrend}
            incomeColor={theme.colors.success}
            expenseColor={theme.colors.error}
            labelColor={theme.colors.textSecondary}
          />
        ) : (
          <Text className="text-sm text-center" style={{ color: theme.colors.textSecondary }}>
            No transaction history yet
          </Text>
        )}
        <View className="flex-row justify-center mt-3">
          <View className="flex-row items-center mr-5">
            <View
              className="rounded-full mr-1.5"
              style={{ width: 10, height: 10, backgroundColor: theme.colors.success }}
            />
            <Text className="text-xs" style={{ color: theme.colors.textSecondary }}>
              Income
            </Text>
          </View>
          <View className="flex-row items-center">
            <View
              className="rounded-full mr-1.5"
              style={{ width: 10, height: 10, backgroundColor: theme.colors.error }}
            />
            <Text className="text-xs" style={{ color: theme.colors.textSecondary }}>
              Expenses
            </Text>
          </View>
        </View>
      </View>
    );
  };

  const renderAccountBalances = () => {
    const groups = groupAccountBalances(data.monthlyAccountBalances);
    const hasLoans = groups.youOwe.length + groups.owedToYou.length > 0;

    const loanDetail = (loan: LoanBalanceRow) => {
      if (loan.detail?.kind === 'installment') {
        return `EMI ${formatCurrency(loan.detail.amount)}${loan.detail.dueDate ? ` · due ${formatDay(loan.detail.dueDate)}` : ''}`;
      }
      return loan.detail?.kind === 'dueBack' ? `Due back ${formatDay(loan.detail.dueDate)}` : null;
    };

    const toggleCategory = (type: string) =>
      setExpandedCategories((previous) => ({ ...previous, [type]: !previous[type] }));

    const renderCategory = (category: BalanceCategory) => {
      const open = !!expandedCategories[category.type];
      const balanceColor = (amount: number) => (amount < 0 ? theme.colors.error : theme.colors.text);
      return (
        <View key={category.type}>
          <Pressable
            onPress={() => toggleCategory(category.type)}
            className="flex-row justify-between items-center py-3 border-b border-opacity-30"
            style={{ borderBottomColor: theme.colors.border }}
          >
            <View className="flex-row items-center flex-1">
              <Text className="text-lg mr-2">{ACCOUNT_CATEGORY_EMOJI[category.type]}</Text>
              <Text className="text-sm font-semibold" style={{ color: theme.colors.text }}>
                {category.label}
              </Text>
              <Text className="text-xs ml-1.5" style={{ color: theme.colors.textSecondary }}>
                ({category.accounts.length})
              </Text>
              <MaterialCommunityIcons
                name={open ? 'chevron-up' : 'chevron-down'}
                size={20}
                color={theme.colors.textSecondary}
              />
            </View>
            <Text className="text-base font-semibold" style={{ color: balanceColor(category.total) }}>
              {formatCurrency(category.total)}
            </Text>
          </Pressable>
          {open &&
            category.accounts.map((account) => (
              <View
                key={account.accountId}
                className="flex-row justify-between items-center py-2.5 pl-9 border-b border-opacity-30"
                style={{ borderBottomColor: theme.colors.border }}
              >
                <Text className="text-sm flex-1" style={{ color: theme.colors.textSecondary }}>
                  {account.name}
                </Text>
                <Text className="text-sm" style={{ color: balanceColor(account.closingBalance) }}>
                  {formatCurrency(account.closingBalance)}
                </Text>
              </View>
            ))}
        </View>
      );
    };

    // Loans show only the biggest few per group; a row for the rest keeps the numbers adding up
    const collapsibleLoans = (loans: LoanBalanceRow[], noun: string) => {
      const sorted = [...loans].sort((a, b) => b.outstanding - a.outstanding);
      const hidden = loansExpanded ? [] : sorted.slice(LOAN_ROWS_SHOWN);
      return {
        shown: loansExpanded ? sorted : sorted.slice(0, LOAN_ROWS_SHOWN),
        toggle:
          sorted.length > LOAN_ROWS_SHOWN ? (
            <Pressable
              key={`toggle-${noun}`}
              onPress={() => setLoansExpanded(!loansExpanded)}
              className="flex-row justify-between items-center py-3"
            >
              <View className="flex-row items-center flex-1">
                <Text className="text-sm font-semibold" style={{ color: theme.colors.primary }}>
                  {loansExpanded ? 'Show less' : `${hidden.length} more`}
                </Text>
                <MaterialCommunityIcons
                  name={loansExpanded ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color={theme.colors.primary}
                />
              </View>
              {!loansExpanded && (
                <Text className="text-base" style={{ color: theme.colors.textSecondary }}>
                  {formatCurrency(hidden.reduce((total, loan) => total + loan.outstanding, 0))}
                </Text>
              )}
            </Pressable>
          ) : null,
      };
    };

    const renderLoanRows = (loans: LoanBalanceRow[], color: string, noun: string) => {
      const rows = collapsibleLoans(loans, noun);
      return [
        ...rows.shown.map((loan) => {
          const detail = loanDetail(loan);
          return (
            <View
              key={loan.accountId}
              className="flex-row justify-between items-center py-3 border-b border-opacity-30"
              style={{ borderBottomColor: theme.colors.border }}
            >
              <View className="flex-1">
                <Text className="text-sm" style={{ color: theme.colors.text }}>
                  {loan.name}
                </Text>
                {detail && (
                  <Text className="text-xs mt-0.5" style={{ color: theme.colors.textSecondary }}>
                    {detail}
                  </Text>
                )}
              </View>
              <Text className="text-base font-semibold" style={{ color }}>
                {formatCurrency(loan.outstanding)}
              </Text>
            </View>
          );
        }),
        rows.toggle,
      ];
    };

    return (
      <View
        className="m-5 bg-white rounded-xl p-5 border border-gray-200"
        style={{
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
        }}
      >
        <Text
          className="text-lg font-bold mb-5"
          style={{ color: theme.colors.text }}
        >
          Account Balances
        </Text>
        {data.monthlyAccountBalances.length > 0 ? (
          <View className="mt-2.5">
            {groups.categories.map(renderCategory)}
            {/* The categories above added together */}
            <View
              className="flex-row justify-between items-center pt-4 mt-2 border-t-2"
              style={{ borderTopColor: theme.colors.primary }}
            >
              <Text
                className="text-base font-bold flex-1"
                style={{ color: theme.colors.text }}
              >
                Total
              </Text>
              <Text
                className="text-lg font-bold"
                style={{ color: theme.colors.primary }}
              >
                {formatCurrency(groups.accountsTotal)}
              </Text>
            </View>

            {hasLoans && (
              <View className="mt-6">
                <Text
                  className="text-xs uppercase mb-1"
                  style={{ color: theme.colors.textSecondary }}
                >
                  Loans (not part of the total above)
                </Text>
                {groups.youOwe.length > 0 && (
                  <>
                    <Text className="text-xs mt-2" style={{ color: theme.colors.textSecondary }}>
                      You owe
                    </Text>
                    {renderLoanRows(groups.youOwe, theme.colors.error, 'owe')}
                  </>
                )}
                {groups.owedToYou.length > 0 && (
                  <>
                    <Text className="text-xs mt-3" style={{ color: theme.colors.textSecondary }}>
                      Owed to you
                    </Text>
                    {renderLoanRows(groups.owedToYou, theme.colors.success, 'owed')}
                  </>
                )}
                {/* Total, plus what is owed to you, minus what you owe */}
                <View
                  className="flex-row justify-between items-center pt-4 mt-2 border-t-2"
                  style={{ borderTopColor: theme.colors.primary }}
                >
                  <Text
                    className="text-base font-bold flex-1"
                    style={{ color: theme.colors.text }}
                  >
                    Net worth
                  </Text>
                  <Text
                    className="text-lg font-bold"
                    style={{ color: groups.netWorth < 0 ? theme.colors.error : theme.colors.primary }}
                  >
                    {formatCurrency(groups.netWorth)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        ) : (
          <Text
            className="text-sm text-center mt-5"
            style={{ color: theme.colors.textSecondary }}
          >
            No account data available
          </Text>
        )}
      </View>
    );
  };

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: theme.colors.background }}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: tabInset }}
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
        <View
          className="px-5 pt-9 pb-5 border-b"
          style={{
            backgroundColor: theme.colors.surface,
            borderBottomColor: theme.colors.border,
          }}
        >
          <Text
            className="text-sm mb-1"
            style={{ color: theme.colors.textSecondary }}
          >
            Account balance
          </Text>
          <Text
            className="text-3xl font-bold mb-2.5"
            style={{ color: theme.colors.text }}
          >
            {formatCurrency(data.totalBalance)}
          </Text>
          <Text
            className="text-sm"
            style={{ color: theme.colors.textSecondary }}
          >
            📅 This Month •{" "}
            {new Date().toLocaleDateString("en-US", {
              month: "long",
              year: "numeric",
            })}
          </Text>
        </View>

        {/* What has to be paid before the month ends, against what you have */}
        <View className="pt-5">
          <NeededThisMonthCard refreshKey={data.totalBalance} />
        </View>

        {/* Account Balances */}
        {renderAccountBalances()}

        {/* This week at a glance */}
        {renderWeekSummary()}

        {/* Weekly Chart */}
        {renderWeeklyChart()}

        {/* Monthly Income vs Expense Trend */}
        {renderMonthlyTrend()}

        {/* Categories Pie Chart */}
        {renderCategoriesPieChart()}

        {/* Quick Actions */}
        <View className="p-5">
          <Text
            className="text-lg font-bold mb-4"
            style={{ color: theme.colors.text }}
          >
            Quick Actions
          </Text>
          <View className="flex-row flex-wrap justify-between">
            <Pressable
              onPress={() => router.push("/(tabs)/budget")}
              className="w-[48%] bg-white rounded-xl p-5 items-center mb-3 border"
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              }}
            >
              <Text className="text-2xl mb-2">🎯</Text>
              <Text
                className="text-sm text-center"
                style={{ color: theme.colors.text }}
              >
                Set Budget
              </Text>
            </Pressable>
            <Pressable
              onPress={() => router.push("/(tabs)/profiles")}
              className="w-[48%] bg-white rounded-xl p-5 items-center mb-3 border"
              style={{
                backgroundColor: theme.colors.surface,
                borderColor: theme.colors.border,
              }}
            >
                <Text className="text-2xl mb-2">📋</Text>
                {/* <Text style={{ color: theme.colors.text }} className="text-xl font-bold my-2">10</Text> */}
                <Text
                  style={{ color: theme.colors.text }}
                  className="text-sm text-center"
                >
                  Add Business
                </Text>
            </Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}
