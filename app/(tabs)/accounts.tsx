import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  TextInput,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getAccountService, getProfileService } from "../../database";
import { Account, Profile } from "../../types";
import { useTheme } from "../../context/ThemeContext";
import { useSettings } from "../../context/SettingsContext";
import AddAccountScreen from "../../components/AddAccountScreen";
import AddLoanScreen from "../../components/AddLoanScreen";
import OptionSelector from "../../components/OptionSelector";
import { useTransactionModal } from "../../context/TransactionModalContext";

interface LoanSummary {
  totalLoaned: number;
  totalBorrowed: number;
  totalLoanedReturned: number;
  totalBorrowedReturned: number;
  outstandingLoans: number;
  outstandingBorrowings: number;
  activeLoans: number;
  activeBorrowings: number;
  overdueLoans: number;
  overdueBorrowings: number;
}

export default function AccountsScreen() {
  const { theme } = useTheme();
  const { formatCurrency, selectedProfileId, updateSelectedProfileId } = useSettings();
  const styles = createStyles(theme);

  const { openModal } = useTransactionModal();

  // Accounts state
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [showAddAccount, setShowAddAccount] = useState(false);

  // Profiles state
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [profileModalVisible, setProfileModalVisible] = useState(false);

  // Loans state
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
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  const [loanType, setLoanType] = useState<"lendings" | "borrowings">("lendings");

  const loadData = useCallback(() => {
    const profileId = selectedProfileId === 'all' ? undefined : selectedProfileId;
    loadAccounts(profileId);
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
      const allAccountsData = accountService.getAccounts(profileId);
      setAllAccounts(allAccountsData);

      const total = accountService.getTotalAccountsBalance(profileId);
      setTotalBalance(total);

      // Load loans and summary from account service
      const summaryData = accountService.getLoanSummary(profileId);
      setLoanSummary(summaryData);
    } catch (error) {
      console.error("Error loading accounts/loans:", error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      getAccountService().markOverdueLoans();
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

  // Effect to debounce search term
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300); // 300ms delay

    return () => {
      clearTimeout(handler);
    };
  }, [searchTerm]);

  const displayedAccounts = useMemo(() => {
    if (!debouncedSearchTerm.trim()) {
      return allAccounts;
    }
    const lowercasedTerm = debouncedSearchTerm.toLowerCase();
    return allAccounts.filter(
      (account) =>
        account.name.toLowerCase().includes(lowercasedTerm) ||
        (account.bankName && account.bankName.toLowerCase().includes(lowercasedTerm)) ||
        (account.loanCounterpartyName && account.loanCounterpartyName.toLowerCase().includes(lowercasedTerm))
    );
  }, [allAccounts, debouncedSearchTerm]);

  const handleRecordPayment = (loanAccount: Account) => {
    openModal({ loanForRepayment: loanAccount });
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
  const getStatusColor = (status: Account['loanStatus']) => {
    switch (status) {
      case 'active': return theme.colors.primary;
      case 'partially_paid': return '#f59e0b';
      case 'fully_paid': return '#10b981';
      case 'overdue': return '#ef4444';
      default: return theme.colors.textSecondary;
    }
  };

  const getStatusLabel = (status: Account['loanStatus']) => {
    switch (status) {
      case 'active': return 'Active';
      case 'partially_paid': return 'Partial';
      case 'fully_paid': return 'Paid';
      case 'overdue': return 'Overdue';
      default: return status;
    }
  };

  const isOverdue = (loan: Account): boolean => {
    if (!loan.loanExpectedReturnDate || loan.loanStatus === 'fully_paid') return false;
    return new Date(loan.loanExpectedReturnDate) < new Date();
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

  const renderLoanItem = ({ item: loanAccount }: { item: Account }) => {
    const outstandingAmount = (loanAccount.loanPrincipal || 0) - (loanAccount.loanReturnedAmount || 0);
    const progressPercentage = (loanAccount.loanPrincipal || 0) > 0 ? ((loanAccount.loanReturnedAmount || 0) / (loanAccount.loanPrincipal || 0)) * 100 : 0;

    return (
      <TouchableOpacity
        style={[
          styles.accountCard,
          loanAccount.loanStatus === 'overdue' && styles.overdueCard
        ]}
        onPress={() => loanAccount.loanStatus !== 'fully_paid' && handleRecordPayment(loanAccount)}
      >
        <View style={styles.accountHeader}>
          <View style={styles.accountInfo}>
            <Text style={styles.accountEmoji}>💸</Text>
            <View style={styles.accountDetails}>
              <Text style={styles.accountName}>
                {loanAccount.loanCounterpartyName}
              </Text>
              <Text style={styles.accountType}>
                {loanAccount.loanCounterpartyContact || 'No contact'}
              </Text>
              {loanAccount.description && (
                <Text style={styles.bankName}>{loanAccount.description}</Text>
              )}
            </View>
          </View>
          <View style={styles.balanceContainer}>
            <Text style={[styles.loanStatus, { color: getStatusColor(loanAccount.loanStatus) }]}>
              {getStatusLabel(loanAccount.loanStatus)}
            </Text>
          </View>
        </View>

        <View style={styles.loanAmountSection}>
          <View style={styles.loanAmountRow}>
            <Text style={styles.loanAmountLabel}>{loanAccount.isLending  ? "Lent:" : "Borrowed:"}</Text>
            <Text style={styles.loanAmountValue}>{formatCurrency(loanAccount.loanPrincipal || 0)}</Text>
          </View>
          <View style={styles.loanAmountRow}>
            <Text style={styles.loanAmountLabel}>Returned:</Text>
            <Text style={[styles.loanAmountValue, { color: '#10b981' }]}>
              {formatCurrency(loanAccount.loanReturnedAmount || 0)}
            </Text>
          </View>
          <View style={styles.loanAmountRow}>
            <Text style={styles.loanAmountLabel}>Outstanding:</Text>
            <Text style={[styles.loanAmountValue, { color: '#ef4444' }]}>
              {formatCurrency(outstandingAmount)}
            </Text>
          </View>
        </View>

        {(loanAccount.loanReturnedAmount || 0) > 0 && (
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
            Date: {new Date(loanAccount.loanLentDate || '').toLocaleDateString()}
          </Text>
          {loanAccount.loanExpectedReturnDate && (
            <Text style={[
              styles.loanDateLabel,
              isOverdue(loanAccount) && loanAccount.loanStatus !== 'fully_paid' && { color: '#ef4444' }
            ]}>
              Expected: {new Date(loanAccount.loanExpectedReturnDate).toLocaleDateString()}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  const regularAccounts = useMemo(() => displayedAccounts.filter((a) => a.type !== "loan"), [displayedAccounts]);

  const filteredLoans = useMemo(() => displayedAccounts.filter(account => account.type === 'loan').filter(loan => {
    const isLending = loan.isLending === 1 || loan.isLending === true;
    return loanType === 'lendings' ? isLending : !isLending;
  }), [displayedAccounts, loanType]);

  const data = activeTab === "accounts" ? regularAccounts : filteredLoans;
  const renderItem = activeTab === "accounts" ? renderAccountItem : renderLoanItem;

  const listHeaderComponent = useMemo(() => (
    <>
      <View style={styles.searchContainer}>
        <MaterialCommunityIcons name="magnify" size={22} color={theme.colors.textSecondary} style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, bank, or person..."
          placeholderTextColor={theme.colors.textSecondary}
          value={searchTerm}
          onChangeText={setSearchTerm}
          clearButtonMode="while-editing"
        />
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
              {regularAccounts.length} {regularAccounts.length === 1 ? "Account" : "Accounts"}
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
                  {loanType === "lendings" ? "Outstanding" : "Debt"}
                </Text>
                <Text style={[styles.loanStatValue, { color: '#ef4444' }]}>
                  {formatCurrency(loanType === "lendings" ? loanSummary.outstandingLoans : loanSummary.outstandingBorrowings)}
                </Text>
              </View>
              <View style={styles.loanStatItem}>
                <Text style={styles.loanStatLabel}>Repaid</Text>
                <Text style={[styles.loanStatValue, { color: '#10b981' }]}>
                  {formatCurrency(loanType === "lendings" ? loanSummary.totalLoanedReturned : loanSummary.totalBorrowedReturned)}
                </Text>
              </View>
              <View style={styles.loanStatItem}>
                <Text style={styles.loanStatLabel}>Overdue</Text>
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
    </>
  ), [
    theme,
    searchTerm,
    activeTab,
    totalBalance,
    regularAccounts,
    loanSummary,
    loanType,
    formatCurrency,
  ]);

  const emptyComponent = useMemo(() => {
    if (debouncedSearchTerm) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🧐</Text>
          <Text style={styles.emptyTitle}>No Results Found</Text>
          <Text style={styles.emptyText}>Try searching for something else.</Text>
        </View>
      );
    }
    if (activeTab === "accounts") {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyEmoji}>🏦</Text>
          <Text style={styles.emptyTitle}>No Accounts</Text>
          <Text style={styles.emptyText}>Add your bank accounts, credit cards, and cash to track your finances</Text>
        </View>
      );
    }
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>💸</Text>
        <Text style={styles.emptyTitle}>{loanType === "lendings" ? "No Money Lent" : "No Money Borrowed"}</Text>
        <Text style={styles.emptyText}>{loanType === "lendings" ? "Track money you lend to friends and family" : "Track money you borrow from others"}</Text>
      </View>
    );
  }, [debouncedSearchTerm, activeTab, loanType, theme]);

  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme.isDark ? "light-content" : "dark-content"} />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.headerTitleContainer} onPress={() => setProfileModalVisible(true)}>
          <Text style={styles.headerTitle}>{getSelectedProfileName()}</Text>
          <MaterialCommunityIcons name="chevron-down" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View style={styles.headerActions}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => openModal({ initialType: 'transfer' })}
          >
            <MaterialCommunityIcons name="swap-horizontal" size={24} color={theme.colors.primary} />
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
      </View>

      <FlatList
        data={data}
        renderItem={renderItem}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={listHeaderComponent}
        ListEmptyComponent={emptyComponent}
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
        keyboardShouldPersistTaps="handled"
      />

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
      marginHorizontal: 0,
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
    headerActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    actionButton: {
      padding: 8,
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
      marginHorizontal: 0,
      padding: 20,
      marginTop: 20,
      marginBottom: 10,
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
      paddingHorizontal: 20,
      paddingBottom: 40,
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
      backgroundColor: theme.colors.surface,
      marginHorizontal: 0,
      marginTop: 10,
      marginBottom: 16,
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
      alignItems: 'center',
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
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      marginTop: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      height: 48,
      fontSize: 16,
      color: theme.colors.text,
    },
  });
