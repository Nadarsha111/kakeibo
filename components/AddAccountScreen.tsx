import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { getAccountService } from '../database';
import { Account } from '../types';
import { useTheme } from '../context/ThemeContext';

interface AddAccountScreenProps {
  visible: boolean;
  onClose: () => void;
  onAccountAdded: () => void;
  profileId?: number | 'all';
}

export default function AddAccountScreen({
  visible,
  onClose,
  onAccountAdded,
  profileId,
}: AddAccountScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  
  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('checking'); // Default to checking
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');

  // Loan-specific state
  const [isLending, setIsLending] = useState(true);
  const [loanCounterpartyName, setLoanCounterpartyName] = useState('');
  const [loanCounterpartyContact, setLoanCounterpartyContact] = useState('');
  const [loanPrincipal, setLoanPrincipal] = useState('');
  const [loanExpectedReturnDate, setLoanExpectedReturnDate] = useState('');
  const [loanDescription, setLoanDescription] = useState('');

  const resetForm = () => {
    setName('');
    setType('checking');
    setBalance('');
    setCurrency('USD');
    setBankName('');
    setAccountNumber('');
    // Reset loan fields
    setIsLending(true);
    setLoanCounterpartyName('');
    setLoanCounterpartyContact('');
    setLoanPrincipal('');
    setLoanExpectedReturnDate('');
    setLoanDescription('');
  };

  const handleSubmit = () => {
    // Validation
    if (type === 'loan') {
      if (!loanCounterpartyName.trim()) {
        Alert.alert('Error', `Please enter the ${isLending ? 'borrower' : 'lender'}'s name.`);
        return;
      }
      if (!loanPrincipal || isNaN(parseFloat(loanPrincipal)) || parseFloat(loanPrincipal) <= 0) {
        Alert.alert('Error', 'Please enter a valid loan amount.');
        return;
      }
    } else {
      if (!name.trim()) {
        Alert.alert('Error', 'Please enter an account name.');
        return;
      }
      if (!balance || isNaN(parseFloat(balance))) {
        Alert.alert('Error', 'Please enter a valid initial balance.');
        return;
      }
    }

    try {
      if (!profileId || profileId === 'all') {
        Alert.alert('Error', 'A profile must be selected to add an account.');
        return;
      }

      let accountData: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;

      if (type === 'loan') {
        accountData = {
          profileId,
          name: `${isLending ? 'Loan to' : 'Loan from'} ${loanCounterpartyName.trim()}`,
          type: 'loan',
          balance: 0, // This will be set by the service
          currency: currency.trim() || 'USD',
          isActive: true,
          isLending,
          loanPrincipal: parseFloat(loanPrincipal),
          loanCounterpartyName: loanCounterpartyName.trim(),
          loanCounterpartyContact: loanCounterpartyContact.trim() || undefined,
          loanLentDate: new Date().toISOString().split('T')[0],
          loanExpectedReturnDate: loanExpectedReturnDate.trim() || undefined,
          description: loanDescription.trim() || undefined,
        };
      } else {
        accountData = {
          profileId,
          name: name.trim(),
          type,
          balance: parseFloat(balance),
          currency: currency.trim() || 'USD',
          bankName: bankName.trim() || undefined,
          accountNumber: accountNumber.trim() || undefined,
          isActive: true,
        };
      }

      const accountService = getAccountService();
      accountService.addAccount(accountData);
      resetForm();
      onAccountAdded();
      onClose();
    } catch (error) {
      console.error('Error adding account:', error);
      Alert.alert('Error', 'Failed to add account. Please try again.');
    }
  };

  const getAccountTypeEmoji = (accountType: Account['type']) => {
    const emojiMap = {
      savings: '🏦',
      checking: '💳',
      credit_card: '💰',
      loan: '🏠',
      investment: '📈',
      cash: '💵',
    };
    return emojiMap[accountType] || '💰';
  };

  const getAccountTypeLabel = (accountType: Account['type']) => {
    const labelMap = {
      savings: 'Savings Account',
      checking: 'Checking Account',
      credit_card: 'Credit Card',
      loan: 'Loan Account',
      investment: 'Investment Account',
      cash: 'Cash Wallet',
    };
    return labelMap[accountType] || accountType;
  };

  const accountTypes: Account['type'][] = [
    'checking',
    'savings',
    'credit_card',
    'cash',
    'investment',
    'loan',
  ];

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Account</Text>
          <TouchableOpacity onPress={handleSubmit} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Account Type */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Account Type</Text>
            <View style={styles.typeGrid}>
              {accountTypes.map((accountType) => (
                <TouchableOpacity
                  key={accountType}
                  style={[styles.typeCard, type === accountType && styles.typeCardActive]}
                  onPress={() => setType(accountType)}
                >
                  <Text style={styles.typeEmoji}>{getAccountTypeEmoji(accountType)}</Text>
                  <Text style={[styles.typeLabel, type === accountType && styles.typeLabelActive]}>
                    {getAccountTypeLabel(accountType)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          
          {type === 'loan' ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Loan Type</Text>
                <View style={styles.loanTypeContainer}>
                  <TouchableOpacity
                    style={[styles.loanTypeTab, isLending && styles.activeLoanType]}
                    onPress={() => setIsLending(true)}
                  >
                    <Text style={[styles.loanTypeText, isLending && styles.activeLoanTypeText]}>
                      Money Lent
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.loanTypeTab, !isLending && styles.activeLoanType]}
                    onPress={() => setIsLending(false)}
                  >
                    <Text style={[styles.loanTypeText, !isLending && styles.activeLoanTypeText]}>
                      Money Borrowed
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {isLending ? "Borrower Information" : "Lender Information"}
                </Text>
                <TextInput
                  style={styles.textInput}
                  value={loanCounterpartyName}
                  onChangeText={setLoanCounterpartyName}
                  placeholder={`Enter ${isLending ? "borrower's" : "lender's"} name`}
                  placeholderTextColor={theme.colors.textSecondary}
                />
                <TextInput
                  style={[styles.textInput, { marginTop: 12 }]}
                  value={loanCounterpartyContact}
                  onChangeText={setLoanCounterpartyContact}
                  placeholder="Contact (Optional)"
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Loan Details</Text>
                <TextInput
                  style={styles.textInput}
                  value={loanPrincipal}
                  onChangeText={setLoanPrincipal}
                  placeholder="Loan Amount"
                  keyboardType="decimal-pad"
                  placeholderTextColor={theme.colors.textSecondary}
                />
                <TextInput
                  style={[styles.textInput, { marginTop: 12 }]}
                  value={loanExpectedReturnDate}
                  onChangeText={setLoanExpectedReturnDate}
                  placeholder="Expected Return Date (YYYY-MM-DD)"
                  placeholderTextColor={theme.colors.textSecondary}
                />
                <TextInput
                  style={[styles.textInput, styles.multilineInput, { marginTop: 12 }]}
                  value={loanDescription}
                  onChangeText={setLoanDescription}
                  placeholder="Description (Optional)"
                  multiline
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>
            </>
          ) : (
            <>
              {/* Account Name */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Account Name</Text>
                <TextInput
                  style={styles.textInput}
                  value={name}
                  onChangeText={setName}
                  placeholder="e.g., Main Checking, Chase Savings"
                  autoFocus
                />
              </View>

              {/* Current Balance */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Current Balance</Text>
                <View style={styles.balanceRow}>
                  <TextInput
                    style={styles.balanceInput}
                    value={balance}
                    onChangeText={setBalance}
                    placeholder="0.00"
                    keyboardType="decimal-pad"
                  />
                  <TextInput
                    style={styles.currencyInput}
                    value={currency}
                    onChangeText={setCurrency}
                    placeholder="USD"
                  />
                </View>
                <Text style={styles.helperText}>
                  Enter negative amount for debt accounts (e.g., credit cards)
                </Text>
              </View>

              {/* Bank Name (Optional) */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Bank Name (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  value={bankName}
                  onChangeText={setBankName}
                  placeholder="e.g., Chase, Bank of America"
                />
              </View>

              {/* Account Number (Optional) */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Account Number (Optional)</Text>
                <TextInput
                  style={styles.textInput}
                  value={accountNumber}
                  onChangeText={setAccountNumber}
                  placeholder="Last 4 digits or identifier"
                  secureTextEntry
                />
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
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
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    cancelButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
    },
    cancelButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 16,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },
    saveButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
    },
    saveButtonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    content: {
      flex: 1,
      paddingHorizontal: 16,
    },
    section: {
      marginTop: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 12,
    },
    textInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
    },
    multilineInput: {
      height: 80,
      textAlignVertical: 'top',
    },
    typeGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
    },
    typeCard: {
      flex: 1,
      minWidth: '45%',
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      alignItems: 'center',
      borderWidth: 2,
      borderColor: 'transparent',
    },
    typeCardActive: {
      borderColor: theme.colors.primary,
      backgroundColor: theme.colors.primaryLight || theme.colors.surface,
    },
    typeEmoji: {
      fontSize: 32,
      marginBottom: 8,
    },
    typeLabel: {
      fontSize: 12,
      textAlign: 'center',
      color: theme.colors.text,
      fontWeight: '500',
    },
    typeLabelActive: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
    balanceRow: {
      flexDirection: 'row',
      gap: 12,
    },
    balanceInput: {
      flex: 3,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
    },
    currencyInput: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
      textAlign: 'center',
    },
    helperText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 8,
      fontStyle: 'italic',
    },
    loanTypeContainer: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surface,
      borderRadius: 8,
      overflow: 'hidden',
      marginBottom: 16,
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
  });
