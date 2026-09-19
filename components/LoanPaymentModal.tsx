import React, { useEffect, useState } from 'react';
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
import { interestDue, isValidDate, round2 } from '../utils/loanMath';

interface LoanPaymentModalProps {
  visible: boolean;
  loan: Account | null;
  onClose: () => void;
  onPaymentRecorded: () => void;
}

/**
 * Records a payment on a loan, splitting it into interest and principal when the loan has interest.
 */
export default function LoanPaymentModal({ visible, loan, onClose, onPaymentRecorded }: LoanPaymentModalProps) {
  const { theme } = useTheme();
  const { formatCurrency } = useSettings();
  const styles = createStyles(theme);

  const [amount, setAmount] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  // null records the payment on the loan only, e.g. one made before the app was used
  const [accountId, setAccountId] = useState<number | null>(null);
  const [date, setDate] = useState('');
  const [count, setCount] = useState('1');

  const isLending = !!loan?.isLending;
  const outstanding = loan ? round2((loan.loanPrincipal || 0) - (loan.loanReturnedAmount || 0)) : 0;
  const interest = loan ? interestDue(outstanding, loan.loanInterestRate || 0) : 0;
  const payoff = round2(outstanding + interest);

  useEffect(() => {
    if (!visible || !loan) return;
    const candidates = getAccountService()
      .getAccounts(loan.profileId)
      .filter((account) => account.type !== 'loan');
    setAccounts(candidates);
    setAccountId(candidates[0]?.id ?? null);
    setDate(new Date().toISOString().split('T')[0]);
    setCount('1');
    const due = loan.loanInstallmentAmount || payoff;
    setAmount(String(Math.min(due, payoff)));
  }, [visible, loan?.id]);

  // Recording several monthly payments at once only makes sense for the loan on its own
  const showCount = accountId === null && !!loan?.loanTermMonths;
  const paid = parseFloat(amount) || 0;
  const principalPart = round2(paid - interest);

  const handleSave = () => {
    if (!loan) return;
    if (accountId != null && !isValidDate(date.trim())) {
      Alert.alert('Error', 'Enter the payment date as YYYY-MM-DD.');
      return;
    }
    try {
      getTransactionService().recordLoanPayment({
        loanAccountId: loan.id,
        accountId,
        amount: paid,
        date: date.trim(),
        count: showCount ? Number(count) : 1,
      });
      onPaymentRecorded();
      onClose();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to record the payment.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Record Payment</Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {loan && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{loan.loanCounterpartyName}</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Still owed</Text>
                <Text style={styles.value}>{formatCurrency(outstanding)}</Text>
              </View>
              {interest > 0 && (
                <View style={styles.row}>
                  <Text style={styles.label}>Interest this month</Text>
                  <Text style={styles.value}>{formatCurrency(interest)}</Text>
                </View>
              )}
              {loan.loanNextDueDate && (
                <View style={styles.row}>
                  <Text style={styles.label}>Next due</Text>
                  <Text style={styles.value}>{new Date(loan.loanNextDueDate).toLocaleDateString()}</Text>
                </View>
              )}
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Amount</Text>
            <TextInput
              style={styles.textInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <View style={[styles.chipRow, { marginTop: 8 }]}>
              <TouchableOpacity style={styles.chip} onPress={() => setAmount(String(payoff))}>
                <Text style={styles.chipText}>Pay in full ({formatCurrency(payoff)})</Text>
              </TouchableOpacity>
            </View>
            {paid > 0 && (
              <Text style={styles.helperText}>
                {`${formatCurrency(Math.max(0, Math.min(paid, interest)))} interest, ${formatCurrency(Math.max(0, principalPart))} towards the loan`}
              </Text>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isLending ? 'Received Into' : 'Paid From'}</Text>
            <View style={styles.chipRow}>
              <TouchableOpacity
                style={[styles.chip, accountId === null && styles.chipActive]}
                onPress={() => setAccountId(null)}
              >
                <Text style={[styles.chipText, accountId === null && styles.chipTextActive]}>
                  No account
                </Text>
              </TouchableOpacity>
              {accounts.map((account) => (
                <TouchableOpacity
                  key={account.id}
                  style={[styles.chip, accountId === account.id && styles.chipActive]}
                  onPress={() => setAccountId(account.id)}
                >
                  <Text style={[styles.chipText, accountId === account.id && styles.chipTextActive]}>
                    {account.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            {accountId === null ? (
              <Text style={styles.helperText}>
                Only updates this loan. No account balance or transaction changes, so it suits payments made before you started using the app. Enter the oldest first.
              </Text>
            ) : (
              <TextInput
                style={[styles.textInput, { marginTop: 12 }]}
                value={date}
                onChangeText={setDate}
                placeholder="Payment date (YYYY-MM-DD)"
                placeholderTextColor={theme.colors.textSecondary}
              />
            )}
          </View>

          {showCount && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Number of Payments</Text>
              <TextInput
                style={styles.textInput}
                value={count}
                onChangeText={setCount}
                keyboardType="number-pad"
                placeholder="1"
                placeholderTextColor={theme.colors.textSecondary}
              />
              <Text style={styles.helperText}>
                Records the amount above this many times in a row, one for each month already paid.
              </Text>
            </View>
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
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 4,
    },
    label: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    value: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
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
    helperText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 8,
      fontStyle: 'italic',
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
