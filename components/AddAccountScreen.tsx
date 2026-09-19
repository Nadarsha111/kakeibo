import React, { useEffect, useMemo, useState } from 'react';
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
import { getAccountService, getTransactionService } from '../database';
import { Account } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import { addMonths, isValidDate, monthlyPayment, totalInterest } from '../utils/loanMath';

interface AddAccountScreenProps {
  visible: boolean;
  onClose: () => void;
  onAccountAdded: () => void;
  profileId?: number | 'all';
  /** When set, the form edits this (non-loan) account instead of adding one. onAccountAdded fires after the save. */
  account?: Account | null;
}

export default function AddAccountScreen({
  visible,
  onClose,
  onAccountAdded,
  profileId,
  account,
}: AddAccountScreenProps) {
  const { theme } = useTheme();
  const { formatCurrency } = useSettings();
  const styles = createStyles(theme);
  
  const [name, setName] = useState('');
  const [type, setType] = useState<Account['type']>('checking'); // Default to checking
  const [balance, setBalance] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [creditLimit, setCreditLimit] = useState('');
  const [billDay, setBillDay] = useState('');

  // Loan-specific state
  const [isLending, setIsLending] = useState(true);
  const [loanCounterpartyName, setLoanCounterpartyName] = useState('');
  const [loanCounterpartyContact, setLoanCounterpartyContact] = useState('');
  const [loanPrincipal, setLoanPrincipal] = useState('');
  const [loanExpectedReturnDate, setLoanExpectedReturnDate] = useState('');
  const [loanDescription, setLoanDescription] = useState('');
  // Installment plan (monthly payments with optional interest)
  const [isInstallment, setIsInstallment] = useState(false);
  const [interestRate, setInterestRate] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [firstPaymentDate, setFirstPaymentDate] = useState('');
  const [installmentOverride, setInstallmentOverride] = useState('');
  // Account that receives the borrowed cash (or pays out the lent cash); null records the debt only
  const [fundingAccountId, setFundingAccountId] = useState<number | null>(null);
  const [fundingAccounts, setFundingAccounts] = useState<Account[]>([]);

  const isEditing = !!account;

  useEffect(() => {
    if (!visible || !account) return;
    setName(account.name);
    setType(account.type);
    // A credit card stores what is owed as a negative balance; the form shows it as a positive amount
    setBalance(String(account.type === 'credit_card' ? Math.abs(account.balance) : account.balance));
    setCurrency(account.currency);
    setBankName(account.bankName ?? '');
    setAccountNumber(account.accountNumber ?? '');
    setCreditLimit(account.creditLimit ? String(account.creditLimit) : '');
    setBillDay(account.billDay ? String(account.billDay) : '');
  }, [visible, account?.id]);

  useEffect(() => {
    if (!visible || type !== 'loan' || !profileId || profileId === 'all') return;
    setFundingAccounts(
      getAccountService().getAccounts(profileId).filter((account) => account.type !== 'loan'),
    );
  }, [visible, type, profileId]);

  const installmentPlan = useMemo(() => {
    const principal = parseFloat(loanPrincipal);
    const rate = parseFloat(interestRate || '0');
    const months = parseInt(termMonths, 10);
    if (!isInstallment || !(principal > 0) || isNaN(rate) || rate < 0 || !(months >= 1)) return null;
    const override = parseFloat(installmentOverride);
    const payment = override > 0 ? override : monthlyPayment(principal, rate, months);
    return { payment, months, interest: totalInterest(principal, payment, months) };
  }, [isInstallment, loanPrincipal, interestRate, termMonths, installmentOverride]);

  const resetForm = () => {
    setName('');
    setType('checking');
    setBalance('');
    setCurrency('USD');
    setBankName('');
    setAccountNumber('');
    setCreditLimit('');
    setBillDay('');
    // Reset loan fields
    setIsLending(true);
    setLoanCounterpartyName('');
    setLoanCounterpartyContact('');
    setLoanPrincipal('');
    setLoanExpectedReturnDate('');
    setLoanDescription('');
    setFundingAccountId(null);
    setIsInstallment(false);
    setInterestRate('');
    setTermMonths('');
    setFirstPaymentDate('');
    setInstallmentOverride('');
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
      if (isInstallment) {
        const rate = parseFloat(interestRate || '0');
        const months = Number(termMonths);
        if (isNaN(rate) || rate < 0 || rate > 100) {
          Alert.alert('Error', 'Enter a yearly interest rate between 0 and 100.');
          return;
        }
        if (!Number.isInteger(months) || months < 1 || months > 600) {
          Alert.alert('Error', 'Enter the term as a whole number of months (1 to 600).');
          return;
        }
        if (firstPaymentDate.trim() && !isValidDate(firstPaymentDate.trim())) {
          Alert.alert('Error', 'Enter the first payment date as YYYY-MM-DD.');
          return;
        }
        if (installmentOverride.trim() && !(parseFloat(installmentOverride) > 0)) {
          Alert.alert('Error', 'Enter a valid monthly payment amount.');
          return;
        }
      }
    } else {
      if (!name.trim()) {
        Alert.alert('Error', 'Please enter an account name.');
        return;
      }
      if (!balance || isNaN(parseFloat(balance))) {
        Alert.alert('Error', type === 'credit_card'
          ? 'Please enter the amount owed on this card (0 if nothing).'
          : 'Please enter a valid initial balance.');
        return;
      }
      if (type === 'credit_card' && creditLimit.trim() && !(parseFloat(creditLimit) > 0)) {
        Alert.alert('Error', 'Please enter a valid credit limit.');
        return;
      }
      if (type === 'credit_card' && billDay.trim() && !(Number.isInteger(Number(billDay)) && Number(billDay) >= 1 && Number(billDay) <= 31)) {
        Alert.alert('Error', 'Enter the bill day as a day of the month, from 1 to 31.');
        return;
      }
    }

    try {
      if (account) {
        getAccountService().updateAccount(account.id, {
          name: name.trim(),
          balance: type === 'credit_card' ? 0 - Math.abs(parseFloat(balance)) : parseFloat(balance),
          currency: currency.trim() || 'USD',
          // null clears the value; undefined would leave the old one in place
          bankName: bankName.trim() || null,
          accountNumber: accountNumber.trim() || null,
          ...(type === 'credit_card' && {
            creditLimit: creditLimit.trim() ? parseFloat(creditLimit) : null,
            billDay: billDay.trim() ? Number(billDay) : null,
          }),
        });
        onAccountAdded();
        onClose();
        return;
      }

      if (!profileId || profileId === 'all') {
        Alert.alert('Error', 'A profile must be selected to add an account.');
        return;
      }

      let accountData: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>;

      if (type === 'loan') {
        let installmentFields: Partial<Account> = {};
        if (isInstallment && installmentPlan) {
          const today = new Date().toISOString().split('T')[0];
          const firstDue = firstPaymentDate.trim() || addMonths(today, 1);
          const paymentDay = parseInt(firstDue.slice(8), 10);
          const months = installmentPlan.months;
          installmentFields = {
            loanInterestRate: parseFloat(interestRate || '0'),
            loanTermMonths: months,
            loanInstallmentAmount: installmentPlan.payment,
            loanPaymentDay: paymentDay,
            loanNextDueDate: firstDue,
            loanExpectedReturnDate: addMonths(firstDue, months - 1, paymentDay),
          };
        }
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
          ...installmentFields,
        };
      } else {
        accountData = {
          profileId,
          name: name.trim(),
          type,
          // A credit card is money owed, stored as a negative balance so spending deepens it and payments reduce it
          balance: type === 'credit_card' ? 0 - Math.abs(parseFloat(balance)) : parseFloat(balance),
          currency: currency.trim() || 'USD',
          creditLimit: type === 'credit_card' && creditLimit.trim() ? parseFloat(creditLimit) : undefined,
          billDay: type === 'credit_card' && billDay.trim() ? Number(billDay) : undefined,
          bankName: bankName.trim() || undefined,
          accountNumber: accountNumber.trim() || undefined,
          isActive: true,
        };
      }

      if (type === 'loan') {
        getTransactionService().addLoanWithFunding(accountData, fundingAccountId);
      } else {
        getAccountService().addAccount(accountData);
      }
      resetForm();
      onAccountAdded();
      onClose();
    } catch (error) {
      console.error('Error saving account:', error);
      Alert.alert('Error', `Failed to ${isEditing ? 'save' : 'add'} account. Please try again.`);
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
          <Text style={styles.headerTitle}>{isEditing ? 'Edit Account' : 'Add Account'}</Text>
          <TouchableOpacity onPress={handleSubmit} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Account Type (fixed once the account exists) */}
          {!isEditing && (
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
          )}
          
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
                <View style={[styles.loanTypeContainer, { marginTop: 12, marginBottom: 0 }]}>
                  <TouchableOpacity
                    style={[styles.loanTypeTab, !isInstallment && styles.activeLoanType]}
                    onPress={() => setIsInstallment(false)}
                  >
                    <Text style={[styles.loanTypeText, !isInstallment && styles.activeLoanTypeText]}>
                      Flexible
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.loanTypeTab, isInstallment && styles.activeLoanType]}
                    onPress={() => setIsInstallment(true)}
                  >
                    <Text style={[styles.loanTypeText, isInstallment && styles.activeLoanTypeText]}>
                      Monthly Installments
                    </Text>
                  </TouchableOpacity>
                </View>
                {isInstallment ? (
                  <>
                    <TextInput
                      style={[styles.textInput, { marginTop: 12 }]}
                      value={interestRate}
                      onChangeText={setInterestRate}
                      placeholder="Interest Rate % per year (0 if none)"
                      keyboardType="decimal-pad"
                      placeholderTextColor={theme.colors.textSecondary}
                    />
                    <TextInput
                      style={[styles.textInput, { marginTop: 12 }]}
                      value={termMonths}
                      onChangeText={setTermMonths}
                      placeholder="Term in Months"
                      keyboardType="number-pad"
                      placeholderTextColor={theme.colors.textSecondary}
                    />
                    <TextInput
                      style={[styles.textInput, { marginTop: 12 }]}
                      value={firstPaymentDate}
                      onChangeText={setFirstPaymentDate}
                      placeholder="First Payment Date (YYYY-MM-DD, default next month)"
                      placeholderTextColor={theme.colors.textSecondary}
                    />
                    <TextInput
                      style={[styles.textInput, { marginTop: 12 }]}
                      value={installmentOverride}
                      onChangeText={setInstallmentOverride}
                      placeholder={
                        installmentPlan
                          ? `Monthly Payment (calculated: ${installmentPlan.payment.toFixed(2)})`
                          : 'Monthly Payment (calculated from the above)'
                      }
                      keyboardType="decimal-pad"
                      placeholderTextColor={theme.colors.textSecondary}
                    />
                    {installmentPlan && (
                      <Text style={styles.helperText}>
                        {`About ${formatCurrency(installmentPlan.payment)} a month for ${installmentPlan.months} months, ${formatCurrency(installmentPlan.interest)} total interest. Interest is charged monthly on what is still owed.`}
                      </Text>
                    )}
                  </>
                ) : (
                  <TextInput
                    style={[styles.textInput, { marginTop: 12 }]}
                    value={loanExpectedReturnDate}
                    onChangeText={setLoanExpectedReturnDate}
                    placeholder="Expected Return Date (YYYY-MM-DD)"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                )}
                <TextInput
                  style={[styles.textInput, styles.multilineInput, { marginTop: 12 }]}
                  value={loanDescription}
                  onChangeText={setLoanDescription}
                  placeholder="Description (Optional)"
                  multiline
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {isLending ? "Paid From Account" : "Deposit Into Account"}
                </Text>
                <View style={styles.chipRow}>
                  {[{ id: null, name: "Don't record" }, ...fundingAccounts].map((account) => (
                    <TouchableOpacity
                      key={account.id ?? 'none'}
                      style={[styles.chip, fundingAccountId === account.id && styles.chipActive]}
                      onPress={() => setFundingAccountId(account.id)}
                    >
                      <Text style={[styles.chipText, fundingAccountId === account.id && styles.chipTextActive]}>
                        {account.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={styles.helperText}>
                  {isLending
                    ? "Deducts the loan amount from this account. It won't count as spending."
                    : "Adds the loan amount to this account. It won't count as income."}
                </Text>
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
                  autoFocus={!isEditing}
                />
              </View>

              {/* Current Balance */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  {type === 'credit_card' ? 'Amount Owed' : 'Current Balance'}
                </Text>
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
                {type === 'credit_card' && (
                  <Text style={styles.helperText}>
                    What you owe on this card right now (0 if nothing). It counts as money you have to pay back.
                  </Text>
                )}
              </View>

              {type === 'credit_card' && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Credit Limit (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={creditLimit}
                    onChangeText={setCreditLimit}
                    placeholder="e.g., 50000"
                    keyboardType="decimal-pad"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                  <Text style={styles.helperText}>
                    Used to show how much of the limit you have used.
                  </Text>
                </View>
              )}

              {type === 'credit_card' && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Bill Day (Optional)</Text>
                  <TextInput
                    style={styles.textInput}
                    value={billDay}
                    onChangeText={setBillDay}
                    placeholder="Day of the month the bill is due, e.g., 15"
                    keyboardType="number-pad"
                    maxLength={2}
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                  <Text style={styles.helperText}>
                    What you owe on this card is added to "Money needed this month" when this day falls before the month ends.
                  </Text>
                </View>
              )}

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
    chipRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    chipActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    chipText: {
      fontSize: 14,
      color: theme.colors.text,
    },
    chipTextActive: {
      color: 'white',
      fontWeight: '600',
    },
  });
