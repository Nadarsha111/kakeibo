import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  SectionList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  TextInput,
  RefreshControl,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getAccountService, getCardEmiService, getCardService, getProfileService } from "../../database";
import { Account, CardEmi, CreditCard, Profile } from "../../types";
import { useTheme } from "../../context/ThemeContext";
import { useSettings } from "../../context/SettingsContext";
import { formatDate } from "../../utils/format";
import AddAccountModal from "../../components/modals/AddAccountModal";
import LoanPaymentModal from "../../components/modals/LoanPaymentModal";
import CreditLimitModal from "../../components/modals/CreditLimitModal";
import ManageCardsModal from "../../components/modals/ManageCardsModal";
import AddCardEmiModal from "../../components/modals/AddCardEmiModal";
import OptionSelector from "../../components/OptionSelector";
import { useTransactionModal } from "../../context/TransactionModalContext";
import { useTabBarInset } from '../../components/PebbleTabBar';

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

const isLendingLoan = (loan: Account) => loan.isLending === 1 || loan.isLending === true;

const outstandingOf = (loan: Account) =>
  loan.loanStatus === "fully_paid" ? 0 : (loan.loanPrincipal || 0) - (loan.loanReturnedAmount || 0);

// Loans that need attention come first and paid-off ones sink to the bottom
const loanRank = (loan: Account) =>
  ({ overdue: 0, active: 1, partially_paid: 1, fully_paid: 2 } as Record<string, number>)[loan.loanStatus || "active"] ?? 1;

const ordinalSuffix = (day: number) =>
  day % 100 >= 11 && day % 100 <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[day % 10] ?? "th";

export default function AccountsScreen() {
  const tabInset = useTabBarInset();
  const { theme } = useTheme();
  const { formatCurrency, selectedProfileId, updateSelectedProfileId } = useSettings();
  const styles = createStyles(theme);

  const { openModal } = useTransactionModal();

  // Accounts state
  const [allAccounts, setAllAccounts] = useState<Account[]>([]);
  const [totalBalance, setTotalBalance] = useState(0);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [paymentLoan, setPaymentLoan] = useState<Account | null>(null);
  const [limitAccount, setLimitAccount] = useState<Account | null>(null);
  const [editAccount, setEditAccount] = useState<Account | null>(null);
  const [cardsAccount, setCardsAccount] = useState<Account | null>(null);
  const [cardsByAccountId, setCardsByAccountId] = useState<Map<number, CreditCard[]>>(new Map());
  const [emiAccount, setEmiAccount] = useState<Account | null>(null);
  const [emisByAccountId, setEmisByAccountId] = useState<Map<number, CardEmi[]>>(new Map());

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

  // Shared state
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState(searchTerm);
  const [selectedAccountId, setSelectedAccountId] = useState<number | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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

  useEffect(() => {
    setSelectedAccountId(null);
  }, [debouncedSearchTerm]
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

      const creditCardIds = allAccountsData.filter((a) => a.type === 'credit_card').map((a) => a.id);
      setCardsByAccountId(getCardService().getCardsForAccounts(creditCardIds));

      const cardEmiService = getCardEmiService();
      setEmisByAccountId(new Map(creditCardIds.map((id) => [id, cardEmiService.getEmisForAccount(id)])));
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
    setPaymentLoan(loanAccount);
  };

  // Whether a bill falling due next month is counted in this month's "Money needed"
  const togglePayAtMonthEnd = (account: Account) => {
    try {
      getAccountService().updateAccount(account.id, { payAtMonthEnd: !account.payAtMonthEnd });
      loadData();
    } catch (error) {
      console.error("Error updating month-end payment:", error);
      Alert.alert("Error", "Failed to update account");
    }
  };

  const deleteAccount = (account: Account, deleteTransactions: boolean) => {
    try {
      getAccountService().deleteAccount(account.id, { deleteTransactions });
      loadData();
    } catch (error) {
      console.error("Error deleting account:", error);
      Alert.alert("Error", "Failed to delete account");
    }
  };

  const handleDeleteAccount = (account: Account) => {
    let transactionCount = 0;
    try {
      transactionCount = getAccountService().getTransactionCount(account.id);
    } catch (error) {
      console.error("Error counting transactions:", error);
    }

    // Nothing recorded against it, so there is no history to decide about
    if (transactionCount === 0) {
      Alert.alert(
        "Delete Account",
        `Are you sure you want to delete "${account.name}"? This action cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteAccount(account, false) },
        ]
      );
      return;
    }

    Alert.alert(
      "Delete Account",
      `"${account.name}" has ${transactionCount} ${transactionCount === 1 ? "transaction" : "transactions"}.\n\n` +
        "Keep History removes the account but leaves its transactions in your spending history and reports.\n\n" +
        "Delete Everything also permanently deletes those transactions.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Keep History", onPress: () => deleteAccount(account, false) },
        { text: "Delete Everything", style: "destructive", onPress: () => deleteAccount(account, true) },
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

  // How much of a credit card's limit is used: the bar fills as the amount owed approaches the limit
  const renderCardUsage = (account: Account) => {
    const limit = account.creditLimit || 0;
    const used = Math.max(0, -account.balance);
    const percent = Math.min(100, (used / limit) * 100);
    const color = percent >= 90 ? '#ef4444' : percent >= 70 ? '#f59e0b' : '#10b981';
    return (
      <View style={{ marginTop: 12 }}>
        <View style={styles.progressContainer}>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${percent}%`, backgroundColor: color }]} />
          </View>
          <Text style={styles.progressText}>{percent.toFixed(0)}%</Text>
        </View>
        <Text style={styles.accountType}>
          {used > limit
            ? `${formatCurrency(used - limit)} over the ${formatCurrency(limit)} limit`
            : `${formatCurrency(limit - used)} available of ${formatCurrency(limit)}`}
        </Text>
      </View>
    );
  };

  const renderBillDay = (account: Account) => (
    <Text style={[styles.accountType, { marginTop: 8 }]}>
      {`Bill on the ${account.billDay}${ordinalSuffix(account.billDay || 0)} of each month${account.payAtMonthEnd ? " · paid at month end" : ""}`}
    </Text>
  );

  // An account that shares its balance across more than one physical card shows each card's own
  // bill day instead of the account's own (which is ignored once cards exist).
  const renderCards = (cards: CreditCard[]) => (
    <View style={{ marginTop: 8 }}>
      {cards.map((card) => (
        <Text key={card.id} style={styles.accountType}>
          {card.billDay
            ? `${card.name}: bill on the ${card.billDay}${ordinalSuffix(card.billDay)} of each month${card.payAtMonthEnd ? " · paid at month end" : ""}`
            : card.payAtMonthEnd
              ? `${card.name}: paid at month end`
              : `${card.name}: no bill day set`}
        </Text>
      ))}
    </View>
  );

  // A purchase converted to EMI bills its own fixed installment each month instead of all at once.
  const renderEmis = (emis: CardEmi[]) => (
    <View style={{ marginTop: 8 }}>
      {emis.map((emi) => {
        const outstanding = Math.max(0, (emi.principal || 0) - (emi.returnedAmount || 0));
        return (
          <View key={emi.id} style={styles.emiRow}>
            <Text style={[styles.accountType, { flex: 1 }]} numberOfLines={1}>
              {`${emi.name}: ${formatCurrency(emi.installmentAmount)}/mo${emi.nextDueDate ? ` · next ${emi.nextDueDate}` : ""} · ${formatCurrency(outstanding)} left`}
            </Text>
            <TouchableOpacity onPress={() => handleDeleteEmi(emi)} hitSlop={8}>
              <MaterialCommunityIcons name="close-circle-outline" size={16} color={theme.colors.textSecondary} />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );

  const handleDeleteEmi = (emi: CardEmi) => {
    Alert.alert(
      "Delete EMI",
      `Are you sure you want to delete "${emi.name}"? The purchase itself stays in your spending history; only this installment plan is removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            try {
              getCardEmiService().deleteEmi(emi.id);
              loadData();
            } catch (error) {
              console.error("Error deleting card EMI:", error);
              Alert.alert("Error", "Failed to delete the EMI.");
            }
          },
        },
      ]
    );
  };

  const renderAccountItem = ({ item: account }: { item: Account }) => {
    const isSelected = selectedAccountId === account.id;
    const cards = cardsByAccountId.get(account.id) ?? [];
    const emis = emisByAccountId.get(account.id) ?? [];
    return (
      <TouchableOpacity
        style={styles.accountCard}
        onPress={() => setSelectedAccountId(isSelected ? null : account.id)}
        activeOpacity={0.9}
      >
        <View style={styles.accountHeader}>
          <View style={styles.accountInfo}>
            <Text style={styles.accountEmoji}>
              {getAccountTypeEmoji(account.type)}
            </Text>
            <View style={styles.accountDetails}>
              <Text style={styles.accountName} numberOfLines={1}>{account.name}</Text>
              <Text style={styles.accountType} numberOfLines={1}>
                {getAccountTypeLabel(account.type)}{account.bankName && ` - ${account.bankName}`}
              </Text>
            </View>
          </View>
          <View style={styles.rightContainer}>
            <View style={styles.balanceContainer}>
              <Text
                style={[
                  styles.accountBalance,
                  account.balance < 0 && styles.negativeBalance,
                ]}
              >
                {formatCurrency(account.type === 'credit_card' ? Math.abs(account.balance) : account.balance)}
              </Text>
              <Text style={styles.currency}>
                {account.type === 'credit_card' ? (account.balance < 0 ? 'owed' : 'credit') : account.currency}
              </Text>
            </View>
          </View>
        </View>
        {account.type === 'credit_card' && (account.creditLimit || 0) > 0 && renderCardUsage(account)}
        {account.type === 'credit_card' && cards.length > 0 && renderCards(cards)}
        {account.type === 'credit_card' && cards.length === 0 && !!account.billDay && renderBillDay(account)}
        {account.type === 'credit_card' && cards.length === 0 && !account.billDay && !!account.payAtMonthEnd && (
          <Text style={[styles.accountType, { marginTop: 8 }]}>Paid at month end</Text>
        )}
        {account.type === 'credit_card' && emis.length > 0 && renderEmis(emis)}
        {isSelected && (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.cardActionButton}
              onPress={() => setEditAccount(account)}
            >
              <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.primary} />
              <Text style={[styles.cardActionButtonText, { color: theme.colors.primary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cardActionButton}
              onPress={() => handleDeleteAccount(account)}
            >
              <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.error} />
              <Text style={[styles.cardActionButtonText, { color: theme.colors.error }]}>Delete</Text>
            </TouchableOpacity>
            {account.type === 'credit_card' && (
              <TouchableOpacity
                style={styles.cardActionButton}
                onPress={() => setLimitAccount(account)}
              >
                <MaterialCommunityIcons name="speedometer" size={20} color={theme.colors.primary} />
                <Text style={[styles.cardActionButtonText, { color: theme.colors.primary }]}>
                  {account.creditLimit ? "Change Limit" : "Set Limit"}
                </Text>
              </TouchableOpacity>
            )}
            {account.type === 'credit_card' && (
              <TouchableOpacity
                style={styles.cardActionButton}
                onPress={() => setCardsAccount(account)}
              >
                <MaterialCommunityIcons name="credit-card-multiple-outline" size={20} color={theme.colors.primary} />
                <Text style={[styles.cardActionButtonText, { color: theme.colors.primary }]}>
                  {cards.length > 0 ? "Cards" : "Split Cards"}
                </Text>
              </TouchableOpacity>
            )}
            {account.type === 'credit_card' && (
              <TouchableOpacity
                style={styles.cardActionButton}
                onPress={() => setEmiAccount(account)}
              >
                <MaterialCommunityIcons name="calendar-clock-outline" size={20} color={theme.colors.primary} />
                <Text style={[styles.cardActionButtonText, { color: theme.colors.primary }]}>Add EMI</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={styles.cardActionButton}
              onPress={() => openModal({ initialFromAccount: account })}
            >
              <MaterialCommunityIcons name="swap-horizontal" size={20} color={theme.colors.primary} />
              <Text style={[styles.cardActionButtonText, { color: theme.colors.primary }]}>Transfer</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderLoanItem = ({ item: loanAccount }: { item: Account }) => {
    const outstandingAmount = (loanAccount.loanPrincipal || 0) - (loanAccount.loanReturnedAmount || 0);
    const progressPercentage = (loanAccount.loanPrincipal || 0) > 0 ? ((loanAccount.loanReturnedAmount || 0) / (loanAccount.loanPrincipal || 0)) * 100 : 0;

    const isSelected = selectedAccountId === loanAccount.id;
    return (
      <TouchableOpacity
        style={[
          styles.accountCard,
          loanAccount.loanStatus === 'overdue' && styles.overdueCard
        ]}
        onPress={() => setSelectedAccountId(isSelected ? null : loanAccount.id)}
        activeOpacity={0.9}
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
          {!!loanAccount.loanTermMonths && (
            <>
              <View style={styles.loanAmountRow}>
                <Text style={styles.loanAmountLabel}>
                  {`Monthly (${loanAccount.loanInterestRate || 0}% for ${loanAccount.loanTermMonths} mo):`}
                </Text>
                <Text style={styles.loanAmountValue}>{formatCurrency(loanAccount.loanInstallmentAmount || 0)}</Text>
              </View>
              {!!loanAccount.loanNextDueDate && (
                <View style={styles.loanAmountRow}>
                  <Text style={styles.loanAmountLabel}>Next due:</Text>
                  <Text style={[
                    styles.loanAmountValue,
                    loanAccount.loanStatus === 'overdue' && { color: '#ef4444' }
                  ]}>
                    {formatDate(loanAccount.loanNextDueDate)}
                  </Text>
                </View>
              )}
              {(loanAccount.loanInterestPaid || 0) > 0 && (
                <View style={styles.loanAmountRow}>
                  <Text style={styles.loanAmountLabel}>Interest paid:</Text>
                  <Text style={styles.loanAmountValue}>{formatCurrency(loanAccount.loanInterestPaid || 0)}</Text>
                </View>
              )}
            </>
          )}
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

        {!isLendingLoan(loanAccount) && !!loanAccount.payAtMonthEnd && loanAccount.loanStatus !== 'fully_paid' && (
          <Text style={[styles.accountType, { marginTop: 8 }]}>Paid at month end</Text>
        )}

        <View style={styles.loanDateSection}>
          <Text style={styles.loanDateLabel}>
            Date: {formatDate(loanAccount.loanLentDate || '')}
          </Text>
          {loanAccount.loanExpectedReturnDate && (
            <Text style={[
              styles.loanDateLabel,
              isOverdue(loanAccount) && loanAccount.loanStatus !== 'fully_paid' && { color: '#ef4444' }
            ]}>
              Expected: {formatDate(loanAccount.loanExpectedReturnDate)}
            </Text>
          )}
        </View>
        {isSelected && (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.cardActionButton}
              onPress={() => handleDeleteAccount(loanAccount)}
            >
              <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.error} />
              <Text style={[styles.cardActionButtonText, { color: theme.colors.error }]}>Delete</Text>
            </TouchableOpacity>
            {!isLendingLoan(loanAccount) && loanAccount.loanStatus !== 'fully_paid' && (
              <TouchableOpacity
                style={styles.cardActionButton}
                onPress={() => togglePayAtMonthEnd(loanAccount)}
              >
                <MaterialCommunityIcons
                  name={loanAccount.payAtMonthEnd ? "calendar-check" : "calendar-blank-outline"}
                  size={20}
                  color={theme.colors.primary}
                />
                <Text style={[styles.cardActionButtonText, { color: theme.colors.primary }]}>
                  {loanAccount.payAtMonthEnd ? "Month-end pay: on" : "Month-end pay: off"}
                </Text>
              </TouchableOpacity>
            )}
            {loanAccount.loanStatus !== 'fully_paid' && (
              <TouchableOpacity
                style={styles.cardActionButton}
                onPress={() => handleRecordPayment(loanAccount)}
              >
                <MaterialCommunityIcons name="cash-plus" size={20} color={theme.colors.primary} />
                <Text style={[styles.cardActionButtonText, { color: theme.colors.primary }]}>Record Payment</Text>
              </TouchableOpacity>
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Money owed on credit cards; already subtracted inside Total Balance, shown here so it is visible
  const cardDebt = useMemo(
    () => allAccounts.reduce((sum, a) => (a.type === "credit_card" && a.balance < 0 ? sum - a.balance : sum), 0),
    [allAccounts]
  );

  // Everything on one page, grouped so there is nothing to switch between. Empty groups are left out.
  const sections = useMemo(() => {
    const sum = (items: Account[], value: (a: Account) => number) => items.reduce((total, a) => total + value(a), 0);
    const byUrgency = (a: Account, b: Account) => loanRank(a) - loanRank(b);

    const cashAccounts = displayedAccounts.filter((a) => a.type !== "loan" && a.type !== "credit_card");
    const cards = displayedAccounts.filter((a) => a.type === "credit_card");
    const loans = displayedAccounts.filter((a) => a.type === "loan");
    const borrowed = loans.filter((l) => !isLendingLoan(l)).sort(byUrgency);
    const lent = loans.filter(isLendingLoan).sort(byUrgency);
    const cardsOwed = sum(cards, (a) => Math.max(0, -a.balance));

    return [
      { key: "accounts", title: "Accounts", items: cashAccounts, meta: formatCurrency(sum(cashAccounts, (a) => a.balance)) },
      { key: "cards", title: "Credit Cards", items: cards, meta: cardsOwed > 0 ? `${formatCurrency(cardsOwed)} owed` : "Nothing owed" },
      { key: "borrowed", title: "Money You Owe", items: borrowed, meta: `${formatCurrency(sum(borrowed, outstandingOf))} outstanding` },
      { key: "lent", title: "Money Owed to You", items: lent, meta: `${formatCurrency(sum(lent, outstandingOf))} outstanding` },
    ]
      .filter((group) => group.items.length > 0)
      .map((group) => ({
        key: group.key,
        title: group.title,
        meta: group.meta,
        count: group.items.length,
        data: collapsedSections[group.key] ? [] : group.items,
      }));
  }, [displayedAccounts, collapsedSections, formatCurrency]);

  const toggleSection = (key: string) => setCollapsedSections((previous) => ({ ...previous, [key]: !previous[key] }));

  const renderSectionHeader = ({ section }: { section: { key: string; title: string; meta: string; count: number } }) => (
    <TouchableOpacity style={styles.sectionHeader} onPress={() => toggleSection(section.key)} activeOpacity={0.7}>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.sectionTitle}>
          {section.title} <Text style={styles.sectionCount}>({section.count})</Text>
        </Text>
        <Text style={styles.sectionMeta}>{section.meta}</Text>
      </View>
      <MaterialCommunityIcons
        name={collapsedSections[section.key] ? "chevron-down" : "chevron-up"}
        size={22}
        color={theme.colors.textSecondary}
      />
    </TouchableOpacity>
  );

  const renderItem = ({ item }: { item: Account }) =>
    item.type === "loan" ? renderLoanItem({ item }) : renderAccountItem({ item });

  const overdueLoans = loanSummary.overdueLoans + loanSummary.overdueBorrowings;

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
      {/* Summary Card */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Balance</Text>
        <Text
          style={[
            styles.summaryAmount,
            totalBalance < 0 && styles.negativeBalance,
          ]}
        >
          {formatCurrency(totalBalance)}
        </Text>
        <View style={styles.loanStats}>
          <View style={styles.loanStatItem}>
            <Text style={styles.loanStatLabel}>On credit cards</Text>
            <Text style={[styles.loanStatValue, { color: '#ef4444' }]}>{formatCurrency(cardDebt)}</Text>
          </View>
          <View style={styles.loanStatItem}>
            <Text style={styles.loanStatLabel}>You owe</Text>
            <Text style={[styles.loanStatValue, { color: '#ef4444' }]}>{formatCurrency(loanSummary.outstandingBorrowings)}</Text>
          </View>
          <View style={styles.loanStatItem}>
            <Text style={styles.loanStatLabel}>Owed to you</Text>
            <Text style={[styles.loanStatValue, { color: '#10b981' }]}>{formatCurrency(loanSummary.outstandingLoans)}</Text>
          </View>
        </View>
        {overdueLoans > 0 && (
          <Text style={[styles.accountCount, { color: '#f59e0b', marginTop: 12 }]}>
            {overdueLoans} overdue {overdueLoans === 1 ? "loan" : "loans"}
          </Text>
        )}
      </View>
    </>
  ), [
    theme,
    searchTerm,
    totalBalance,
    cardDebt,
    loanSummary,
    overdueLoans,
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
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyEmoji}>🏦</Text>
        <Text style={styles.emptyTitle}>No Accounts</Text>
        <Text style={styles.emptyText}>Add your bank accounts, credit cards, cash and loans to track your finances</Text>
      </View>
    );
  }, [debouncedSearchTerm, theme]);

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
            onPress={() => openModal({ initialType: "transfer" })}
          >
            <MaterialCommunityIcons name="swap-horizontal" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.addButton}
            onPress={() => setShowAddAccount(true)}
          >
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
      </View>

      <SectionList
        sections={sections}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        stickySectionHeadersEnabled={false}
        keyExtractor={(item) => item.id.toString()}
        ListHeaderComponent={listHeaderComponent}
        ListEmptyComponent={emptyComponent}
        contentContainerStyle={[styles.listContainer, { paddingBottom: tabInset }]}
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
      <AddAccountModal
        visible={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onAccountAdded={handleAccountAdded}
        profileId={selectedProfileId === 'all' ? (profiles[0]?.id) : selectedProfileId}
      />

      {/* Edit Account Modal */}
      <AddAccountModal
        visible={editAccount !== null}
        account={editAccount}
        onClose={() => setEditAccount(null)}
        onAccountAdded={loadData}
      />

      {/* Credit Limit Modal */}
      <CreditLimitModal
        visible={limitAccount !== null}
        account={limitAccount}
        onClose={() => setLimitAccount(null)}
        onSaved={loadData}
      />

      {/* Manage Cards Modal */}
      <ManageCardsModal
        visible={cardsAccount !== null}
        account={cardsAccount}
        onClose={() => setCardsAccount(null)}
        onChanged={loadData}
      />

      {/* Add Card EMI Modal */}
      <AddCardEmiModal
        visible={emiAccount !== null}
        account={emiAccount}
        onClose={() => setEmiAccount(null)}
        onAdded={loadData}
      />

      {/* Installment Loan Payment Modal */}
      <LoanPaymentModal
        visible={paymentLoan !== null}
        loan={paymentLoan}
        onClose={() => setPaymentLoan(null)}
        onPaymentRecorded={loadData}
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
    cardActions: {
      marginTop: 16,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: 8,
    },
    cardActionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
    },
    cardActionButtonText: {
      marginLeft: 6,
      fontSize: 14,
      fontWeight: '600',
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
      flexShrink: 1,
    },
    rightContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
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
    emiRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 4,
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
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingTop: 16,
      paddingBottom: 8,
      paddingHorizontal: 4,
    },
    sectionHeaderText: {
      flex: 1,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    sectionCount: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.textSecondary,
    },
    sectionMeta: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
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
