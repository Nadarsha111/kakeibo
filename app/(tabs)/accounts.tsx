import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  RefreshControl,
  ScrollView,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getAccountService, getLoanService, getProfileService } from "../../database";
import { Account, Loan, LoanSummary, Profile } from "../../types";
import { useTheme } from "../../context/ThemeContext";
import { useSettings } from "../../context/SettingsContext";
import AddAccountScreen from "../../components/AddAccountScreen";
import AddLoanScreen from "../../components/AddLoanScreen";
import OptionSelector from "../../components/OptionSelector";

export default function AccountsScreen() {
  const { theme } = useTheme();
  const { formatCurrency, selectedProfileId, updateSelectedProfileId } = useSettings();
  const styles = createStyles(theme);

  // Accounts state
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Profiles state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // Loans state
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loanSummary, setLoanSummary] = useState<LoanSummary>({
    totalLoaned: 0,
    totalBorrowed: 0,
    totalLoanedReturned: 0,
    totalBorrowedReturned: 0,
    outstandingLoans: 0,
    outstandingBorrowings: 0,
    activeLoans: 0,
    activeBorrowings: 0,
    overdueLoans: 0,
    overdueBorrowings: 0,
  });
  const [showAddLoan, setShowAddLoan] = useState(false);

  // Shared state
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<"accounts" | "loans">("accounts");
  const [loanType, setLoanType] = useState<"lendings" | "borrowings">("lendings");

  const loadData = useCallback(() => {
    const profileId = selectedProfileId === 'all' ? undefined : selectedProfileId;
    loadAccounts(profileId);
    loadLoans(profileId);
  }, [selectedProfileId]);

  useFocusEffect(
    useCallback(() => {
      // Load profiles first
      const profileService = getProfileService();
      const profileList = profileService.getProfiles();
      setProfiles(profileList);

      // Then load accounts and loans based on selected profile
      loadData();
    }, [loadData]) // Rerun when selected profile changes
  );

  const loadAccounts = (profileId?: number) => {
    try {
      const accountService = getAccountService();
      const accountsList = accountService.getAccounts(profileId);
      setAccounts(accountsList);

      const total = accountService.getTotalAccountsBalance(profileId);
      setTotalBalance(total);
    } catch (error) {
      console.error("Error loading accounts:", error);
    }
  };
  const loadLoans = (profileId?: number) => {
    try {
      const loanService = getLoanService();
      const loansData = loanService.getLoans(profileId);
      console.log("Loaded loans:", loansData);
      setLoans(loansData);

      const summaryData = loanService.getLoanSummary(profileId);
      setLoanSummary(summaryData);
    } catch (error) {
      console.error("Error loading loans:", error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      getLoanService().markOverdueLoans();
      loadData();
    } catch (error) {
      console.error("Error refreshing:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleAccountAdded = () => {
    loadData();
    setShowAddAccount(false);
  };

  const handleLoanAdded = () => {
    loadData();
    setShowAddLoan(false);
  };

  const handleRecordPayment = (loan: Loan) => {
    const outstandingAmount = loan.amount - loan.returnedAmount;
    Alert.prompt(
      'Record Payment',
      `Outstanding amount: ${formatCurrency(outstandingAmount)}\nEnter payment amount:`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Record',
          onPress: (paymentAmount) => {
            if (paymentAmount && !isNaN(Number(paymentAmount))) {
              const amount = Number(paymentAmount);
              if (amount > 0 && amount <= outstandingAmount) {
                try {
                  const loanService = getLoanService();
                  loanService.recordLoanPayment(loan.id, amount, new Date().toISOString().split('T')[0]);
                  loadData();
                } catch (error) {
                  Alert.alert('Error', 'Failed to record payment');
                }
              } else {
                Alert.alert('Invalid Amount', 'Please enter a valid amount not exceeding the outstanding balance');
              }
            }
          },
        },
      ],
      'plain-text'
    );
  };

  const handleDeleteAccount = (account: Account) => {
    Alert.alert(
      "Delete Account",
      `Are you sure you want to delete "${account.name}"? This action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            try {
              const accountService = getAccountService();
              accountService.deleteAccount(account.id);
              loadData();
            } catch (error) {
              console.error("Error deleting account:", error);
              Alert.alert("Error", "Failed to delete account");
            }
          },
        },
      ]
    );
  };

  const getSelectedProfileName = () => {
    if (selectedProfileId === 'all') {
      return 'All Profiles';
    }
    const profile = profiles.find(p => p.id === selectedProfileId);
    return profile?.name || 'Select Profile';
  };

  const profileOptions = [
    { label: 'All Profiles', value: 'all' },
    ...profiles.map(p => ({
      label: p.name,
      value: p.id.toString(),
      subtitle: p.description || undefined
    }))
  ];

  const getAccountTypeEmoji = (type: Account["type"]) => {
    const emojiMap = {
      savings: "🏦",
      checking: "💳",
      credit_card: "💰",
      loan: "🏠",
      investment: "📈",
      cash: "💵",
    };
    return emojiMap[type] || "💰";
  };

  const getAccountTypeLabel = (type: Account["type"]) => {
    const labelMap = {
      savings: "Savings",
      checking: "Checking",
      credit_card: "Credit Card",
      loan: "Loan",
      investment: "Investment",
      cash: "Cash",
    };
    return labelMap[type] || type;
  };

  // Loan helper functions
  const getStatusColor = (status: Loan['status']) => {
    switch (status) {
      case 'active': return theme.colors.primary;
      case 'partially_paid': return '#f59e0b';
      case 'fully_paid': return '#10b981';
      case 'overdue': return '#ef4444';
      default: return theme.colors.textSecondary;
    }
  };

  const getStatusLabel = (status: Loan['status']) => {
    switch (status) {
      case 'active': return 'Active';
      case 'partially_paid': return 'Partial';
      case 'fully_paid': return 'Paid';
      case 'overdue': return 'Overdue';
      default: return status;
    }
  };

  const isOverdue = (loan: Loan): boolean => {
    if (!loan.expectedReturnDate || loan.status === 'fully_paid') return false;
    return new Date(loan.expectedReturnDate) < new Date();
  };

  const renderAccountItem = ({ item: account }: { item: Account }) => (
    <TouchableOpacity
      style={styles.accountCard}
      onLongPress={() => handleDeleteAccount(account)}
    >
      <View style={styles.accountHeader}>
        <View style={styles.accountInfo}>
          <Text style={styles.accountEmoji}>
            {getAccountTypeEmoji(account.type)}
          </Text>
          <View style={styles.accountDetails}>
            <Text style={styles.accountName}>{account.name}</Text>
            <Text style={styles.accountType}>
              {getAccountTypeLabel(account.type)}
            </Text>
            {account.bankName && (
              <Text style={styles.bankName}>{account.bankName}</Text>
            )}
          </View>
        </View>
        <View style={styles.balanceContainer}>
          <Text
            style={[
              styles.accountBalance,
              account.balance < 0 && styles.negativeBalance,
            ]}
          >
            {formatCurrency(account.balance)}
          </Text>
          <Text style={styles.currency}>{account.currency}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  const renderLoanItem = ({ item: loan }: { item: Loan }) => {
    const outstandingAmount = loan.amount - loan.returnedAmount;
    const progressPercentage = (loan.returnedAmount / loan.amount) * 100;

    return (
      <TouchableOpacity
        style={[
          styles.accountCard,
          loan.status === 'overdue' && styles.overdueCard
        ]}
        onPress={() => loan.status !== 'fully_paid' && handleRecordPayment(loan)}
      >
        <View style={styles.accountHeader}>
          <View style={styles.accountInfo}>
            <Text style={styles.accountEmoji}>💸</Text>
            <View style={styles.accountDetails}>
              <Text style={styles.accountName}>
                {loan.isLending ? loan.borrowerName : loan.lenderName}
              </Text>
              <Text style={styles.accountType}>
                {loan.isLending ? 
                  (loan.borrowerContact || 'No contact') :
                  (loan.lenderContact || 'No contact')}
              </Text>
              {loan.description && (
                <Text style={styles.bankName}>{loan.description}</Text>
              )}
            </View>
          </View>
          <View style={styles.balanceContainer}>
            <Text style={[styles.loanStatus, { color: getStatusColor(loan.status) }]}>
              {getStatusLabel(loan.status)}
            </Text>
          </View>
        </View>

        <View style={styles.loanAmountSection}>
          <View style={styles.loanAmountRow}>
            <Text style={styles.loanAmountLabel}>{loan.isLending  ? "Lent:" : "Borrowed:"}</Text>
            <Text style={styles.loanAmountValue}>{formatCurrency(loan.amount)}</Text>
          </View>
          <View style={styles.loanAmountRow}>
            <Text style={styles.loanAmountLabel}>Returned:</Text>
            <Text style={[styles.loanAmountValue, { color: '#10b981' }]}>
              {formatCurrency(loan.returnedAmount)}
            </Text>
          </View>
          <View style={styles.loanAmountRow}>
            <Text style={styles.loanAmountLabel}>Outstanding:</Text>
            <Text style={[styles.loanAmountValue, { color: '#ef4444' }]}>
              {formatCurrency(outstandingAmount)}
            </Text>
          </View>
        </View>

        {loan.returnedAmount > 0 && (
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View 
                style={[
                  styles.progressFill, 
                  { width: `${progressPercentage}%` }
                ]} 
              />
            </View>
            <Text style={styles.progressText}>{progressPercentage.toFixed(1)}%</Text>
          </View>
        )}

        <View style={styles.loanDateSection}>
          <Text style={styles.loanDateLabel}>
            Lent: {new Date(loan.lentDate).toLocaleDateString()}
          </Text>
          {loan.expectedReturnDate && (
            <Text style={[
              styles.loanDateLabel,
              isOverdue(loan) && loan.status !== 'fully_paid' && { color: '#ef4444' }
            ]}>
              Expected: {new Date(loan.expectedReturnDate).toLocaleDateString()}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const filteredLoans = loans.filter(loan => {
    const isLending = loan.isLending === 1 || loan.isLending === true;
    return loanType === 'lendings' ? isLending : !isLending;
  });

  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerTitleContainer} onPress={() => setProfileModalVisible(true)}>
          <Text style={styles.headerTitle}>{getSelectedProfileName()}</Text>
          <MaterialCommunityIcons name="chevron-down" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => {
            if (activeTab === "accounts") {
              setShowAddAccount(true);
            } else {
              setShowAddLoan(true);
            }
          }}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>
      {/* Tab Switcher */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[styles.tab, activeTab === "accounts" && styles.activeTab]}
          onPress={() => setActiveTab("accounts")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "accounts" && styles.activeTabText,
            ]}
          >
            Accounts
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === "loans" && styles.activeTab]}
          onPress={() => setActiveTab("loans")}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === "loans" && styles.activeTabText,
            ]}
          >
            Loans
          </Text>
        </TouchableOpacity>
      </View>
      {/* Summary Card */}
      <View style={styles.summaryCard}>
        {activeTab === "accounts" ? (
          <>
            <Text style={styles.summaryLabel}>Total Balance</Text>
            <Text
              style={[
                styles.summaryAmount,
                totalBalance < 0 && styles.negativeBalance,
              ]}
            >
              {formatCurrency(totalBalance)}
            </Text>
            <Text style={styles.accountCount}>
              {accounts.length} {accounts.length === 1 ? "Account" : "Accounts"}
            </Text>
          </>
        ) : (
          <>
            <Text style={styles.summaryLabel}>
              {loanType === "lendings" ? "Total Money Lent" : "Total Money Borrowed"}
            </Text>
            <Text
              style={[
                styles.summaryAmount,
                { color: '#ef4444' }
              ]}
            >
              {formatCurrency(loanType === "lendings" ? loanSummary.totalLoaned : loanSummary.totalBorrowed)}
            </Text>
            <View style={styles.loanStats}>
              <View style={styles.loanStatItem}>
                <Text style={styles.loanStatLabel}>
                  {loanType === "lendings" ? "Outstanding Loans" : "Outstanding Debt"}
                </Text>
                <Text style={[styles.loanStatValue, { color: '#ef4444' }]}>
                  {formatCurrency(loanType === "lendings" ? loanSummary.outstandingLoans : loanSummary.outstandingBorrowings)}
                </Text>
              </View>
              <View style={styles.loanStatItem}>
                <Text style={styles.loanStatLabel}>
                  {loanType === "lendings" ? "Repaid" : "Repaid"}
                </Text>
                <Text style={[styles.loanStatValue, { color: '#10b981' }]}>
                  {formatCurrency(loanType === "lendings" ? loanSummary.totalLoanedReturned : loanSummary.totalBorrowedReturned)}
                </Text>
              </View>
              <View style={styles.loanStatItem}>
                <Text style={styles.loanStatLabel}>
                  {loanType === "lendings" ? "Overdue" : "Overdue"}
                </Text>
                <Text style={[styles.loanStatValue, { color: '#f59e0b' }]}>
                  {loanType === "lendings" ? loanSummary.overdueLoans : loanSummary.overdueBorrowings}
                </Text>
              </View>
            </View>
          </>
        )}
      </View>

      {/* Loan Type Switcher */}
      {activeTab === "loans" && (
        <View style={styles.loanTypeContainer}>
          <TouchableOpacity
            style={[styles.loanTypeTab, loanType === "lendings" && styles.activeLoanType]}
            onPress={() => setLoanType("lendings")}
          >
            <Text style={[styles.loanTypeText, loanType === "lendings" && styles.activeLoanTypeText]}>
              Money Lent
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.loanTypeTab, loanType === "borrowings" && styles.activeLoanType]}
            onPress={() => setLoanType("borrowings")}
          >
            <Text style={[styles.loanTypeText, loanType === "borrowings" && styles.activeLoanTypeText]}>
              Money Borrowed
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Content List */}
      {activeTab === "accounts" ? (
        <FlatList
          data={accounts}
          renderItem={renderAccountItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>🏦</Text>
              <Text style={styles.emptyTitle}>No Accounts</Text>
              <Text style={styles.emptyText}>
                Add your bank accounts, credit cards, and cash to track your finances
              </Text>
            </View>
          }
        />
      ) : (
        <FlatList
          data={filteredLoans}
          renderItem={renderLoanItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyEmoji}>💸</Text>
              <Text style={styles.emptyTitle}>
                {loanType === "lendings" ? "No Money Lent" : "No Money Borrowed"}
              </Text>
              <Text style={styles.emptyText}>
                {loanType === "lendings"
                  ? "Track money you lend to friends and family"
                  : "Track money you borrow from others"
                }
              </Text>
            </View>
          }
        />
      )}

      {/* Add Account Modal */}
      <AddAccountScreen
        visible={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onAccountAdded={handleAccountAdded}
        profileId={selectedProfileId === 'all' ? (profiles[0]?.id) : selectedProfileId}
      />
      <AddLoanScreen
        visible={showAddLoan}
        onClose={() => setShowAddLoan(false)}
        onLoanAdded={handleLoanAdded}
        profileId={selectedProfileId === 'all' ? (profiles[0]?.id) : selectedProfileId}
      />

      {/* Profile Selection Modal */}
      <OptionSelector
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
        title="Select a Profile"
        options={profileOptions}
        selectedValue={selectedProfileId.toString()}
        onSelect={(value) => {
          setProfileModalVisible(false);
          updateSelectedProfileId(value === 'all' ? 'all' : parseInt(value, 10));
        }}
      />
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    tabContainer: {
      flexDirection: "row",
      backgroundColor: theme.colors.surface,
      marginHorizontal: 20,
      marginTop: 16,
      borderRadius: 8,
      padding: 4,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 6,
      alignItems: "center",
    },
    activeTab: {
      backgroundColor: theme.colors.primary,
    },
    tabText: {
      fontSize: 14,
      fontWeight: "600",
      color: theme.colors.textSecondary,
    },
    activeTabText: {
      color: "#fff",
    },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 20,
      paddingTop: 40,
      paddingBottom: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: "bold",
      color: theme.colors.text,
    },
    addButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    },
    addButtonText: {
      color: "#fff",
      fontWeight: "600",
      fontSize: 14,
    },
    summaryCard: {
      backgroundColor: theme.colors.surface,
      margin: 20,
      padding: 20,
      borderRadius: 16,
      alignItems: "center",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    summaryLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 8,
    },
    summaryAmount: {
      fontSize: 32,
      fontWeight: "bold",
      color: theme.colors.text,
      marginBottom: 4,
    },
    accountCount: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    listContainer: {
      padding: 20,
      paddingTop: 20,
    },
    accountCard: {
      backgroundColor: theme.colors.surface,
      marginBottom: 12,
      borderRadius: 12,
      padding: 16,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    accountHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
    },
    accountInfo: {
      flexDirection: "row",
      alignItems: "center",
      flex: 1,
    },
    accountEmoji: {
      fontSize: 24,
      marginRight: 12,
    },
    accountDetails: {
      flex: 1,
    },
    accountName: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.text,
      marginBottom: 2,
    },
    accountType: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginBottom: 1,
    },
    bankName: {
      fontSize: 11,
      color: theme.colors.textSecondary,
      fontStyle: "italic",
    },
    balanceContainer: {
      alignItems: "flex-end",
    },
    accountBalance: {
      fontSize: 18,
      fontWeight: "bold",
      color: theme.colors.text,
    },
    negativeBalance: {
      color: "#ef4444",
    },
    currency: {
      fontSize: 10,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    emptyContainer: {
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 60,
    },
    emptyEmoji: {
      fontSize: 64,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: "600",
      color: theme.colors.text,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: "center",
      lineHeight: 20,
      paddingHorizontal: 40,
    },
    // Loan-specific styles
    overdueCard: {
      borderLeftWidth: 4,
      borderLeftColor: '#ef4444',
    },
    loanStatus: {
      fontSize: 12,
      fontWeight: '600',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: theme.colors.background,
      textAlign: 'center',
    },
    loanAmountSection: {
      marginBottom: 12,
    },
    loanAmountRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    loanAmountLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    loanAmountValue: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    progressContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 12,
      gap: 8,
    },
    progressBar: {
      flex: 1,
      height: 6,
      backgroundColor: theme.colors.border,
      borderRadius: 3,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: '#10b981',
      borderRadius: 3,
    },
    progressText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      minWidth: 35,
      textAlign: 'right',
    },
    loanDateSection: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    loanDateLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    loanTypeContainer: {
      flexDirection: 'row',
      backgroundColor: theme.colors.background,
      marginHorizontal: 16,
      marginTop: 16,
      borderRadius: 8,
      overflow: 'hidden',
    },
    loanTypeTab: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
    },
    activeLoanType: {
      backgroundColor: theme.colors.primary,
    },
    loanTypeText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    activeLoanTypeText: {
      color: 'white',
    },
    loanStats: {
      marginTop: 8,
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 8,
    },
    loanStatItem: {
      flex: 1,
    },
    loanStatLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginBottom: 4,
    },
    loanStatValue: {
      fontSize: 14,
      fontWeight: '600',
    },
  });
