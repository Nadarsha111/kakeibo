import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
} from 'react-native';
import DatabaseService from '../../database/database';
import { Account } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import AddAccountScreen from '../../components/AddAccountScreen';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function AccountsScreen() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showAddAccount, setShowAddAccount] = useState(false);
  const [totalBalance, setTotalBalance] = useState(0);

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = () => {
    try {
      const accountsList = DatabaseService.getAccounts();
      setAccounts(accountsList);
      
      const total = DatabaseService.getTotalAccountsBalance();
      setTotalBalance(total);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const handleAccountAdded = () => {
    loadAccounts();
    setShowAddAccount(false);
  };

  const handleDeleteAccount = (account: Account) => {
    Alert.alert(
      'Delete Account',
      `Are you sure you want to delete "${account.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () => {
            try {
              DatabaseService.deleteAccount(account.id);
              loadAccounts();
            } catch (error) {
              console.error('Error deleting account:', error);
              Alert.alert('Error', 'Failed to delete account');
            }
          },
        },
      ]
    );
  };

  const getAccountTypeEmoji = (type: Account['type']) => {
    const emojiMap = {
      savings: '🏦',
      checking: '💳',
      credit_card: '💰',
      loan: '🏠',
      investment: '📈',
      cash: '💵',
    };
    return emojiMap[type] || '💰';
  };

  const getAccountTypeLabel = (type: Account['type']) => {
    const labelMap = {
      savings: 'Savings',
      checking: 'Checking',
      credit_card: 'Credit Card',
      loan: 'Loan',
      investment: 'Investment',
      cash: 'Cash',
    };
    return labelMap[type] || type;
  };

  const formatBalance = (balance: number) => {
    const isNegative = balance < 0;
    const absoluteBalance = Math.abs(balance);
    return `${isNegative ? '-' : ''}$${absoluteBalance.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  };

  const renderAccountItem = ({ item: account }: { item: Account }) => (
    <TouchableOpacity
      style={styles.accountCard}
      onLongPress={() => handleDeleteAccount(account)}
    >
      <View style={styles.accountHeader}>
        <View style={styles.accountInfo}>
          <Text style={styles.accountEmoji}>{getAccountTypeEmoji(account.type)}</Text>
          <View style={styles.accountDetails}>
            <Text style={styles.accountName}>{account.name}</Text>
            <Text style={styles.accountType}>{getAccountTypeLabel(account.type)}</Text>
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
            {formatBalance(account.balance)}
          </Text>
          <Text style={styles.currency}>{account.currency}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Accounts</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddAccount(true)}
        >
          <Text style={styles.addButtonText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      {/* Total Balance Summary */}
      <View style={styles.summaryCard}>
        <Text style={styles.summaryLabel}>Total Balance</Text>
        <Text
          style={[
            styles.summaryAmount,
            totalBalance < 0 && styles.negativeBalance,
          ]}
        >
          {formatBalance(totalBalance)}
        </Text>
        <Text style={styles.accountCount}>
          {accounts.length} {accounts.length === 1 ? 'Account' : 'Accounts'}
        </Text>
      </View>

      {/* Accounts List */}
      <FlatList
        data={accounts}
        renderItem={renderAccountItem}
        keyExtractor={(item) => item.id.toString()}
        contentContainerStyle={styles.listContainer}
        showsVerticalScrollIndicator={false}
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

      {/* Add Account Modal */}
      <AddAccountScreen
        visible={showAddAccount}
        onClose={() => setShowAddAccount(false)}
        onAccountAdded={handleAccountAdded}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    addButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    },
    addButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    summaryCard: {
      backgroundColor: theme.colors.surface,
      margin: 20,
      padding: 20,
      borderRadius: 16,
      alignItems: 'center',
      shadowColor: '#000',
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
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 4,
    },
    accountCount: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    listContainer: {
      padding: 20,
      paddingTop: 0,
    },
    accountCard: {
      backgroundColor: theme.colors.surface,
      marginBottom: 12,
      borderRadius: 12,
      padding: 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    accountHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    accountInfo: {
      flexDirection: 'row',
      alignItems: 'center',
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
      fontWeight: '600',
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
      fontStyle: 'italic',
    },
    balanceContainer: {
      alignItems: 'flex-end',
    },
    accountBalance: {
      fontSize: 18,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    negativeBalance: {
      color: '#ef4444',
    },
    currency: {
      fontSize: 10,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    emptyContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 60,
    },
    emptyEmoji: {
      fontSize: 64,
      marginBottom: 16,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: 'center',
      lineHeight: 20,
      paddingHorizontal: 40,
    },
  });
