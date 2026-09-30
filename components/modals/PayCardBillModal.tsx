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
import { getAccountService, getTransactionService } from '../../database';
import { Account } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { isValidDate, round2 } from '../../utils/loanMath';
import ChipSelect from '../ChipSelect';

export interface CardBillToPay {
  /** The credit card account the bill is on. */
  accountId: number;
  /** Which of its physical cards the bill is for, or null for the account's own bill. */
  cardId: number | null;
  label: string;
  amount: number;
}

interface PayCardBillModalProps {
  visible: boolean;
  bill: CardBillToPay | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Pays a credit card bill: a transfer from a bank or cash account to the card, tagged to the
 * physical card the bill is for so that card's own bill goes down.
 */
export default function PayCardBillModal({ visible, bill, onClose, onSaved }: PayCardBillModalProps) {
  const { theme } = useTheme();
  const { formatCurrency } = useSettings();
  const styles = createStyles(theme);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [profileId, setProfileId] = useState<number | null>(null);

  useEffect(() => {
    if (!visible || !bill) return;
    const card = getAccountService().getAccountById(bill.accountId);
    setProfileId(card?.profileId ?? null);
    const candidates = card
      ? getAccountService().getAccounts(card.profileId).filter((a) => a.type !== 'loan' && a.type !== 'credit_card')
      : [];
    setAccounts(candidates);
    setAccountId(candidates[0]?.id ?? null);
    setAmount(String(round2(bill.amount)));
    setDate(new Date().toISOString().split('T')[0]);
  }, [visible, bill?.accountId, bill?.cardId]);

  const handleSave = () => {
    if (!bill || profileId == null) return;
    const paid = parseFloat(amount);
    if (!(paid > 0)) {
      Alert.alert('Error', 'Enter an amount greater than zero.');
      return;
    }
    if (accountId == null) {
      Alert.alert('Error', 'Choose the account you paid from.');
      return;
    }
    if (!isValidDate(date.trim())) {
      Alert.alert('Error', 'Enter the date as YYYY-MM-DD.');
      return;
    }
    try {
      getTransactionService().addTransfer({
        fromAccountId: accountId,
        toAccountId: bill.accountId,
        toCardId: bill.cardId,
        amount: round2(paid),
        date: date.trim(),
        description: 'Card bill payment',
        profileId,
      });
      onSaved();
      onClose();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Pay Bill</Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {bill && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{bill.label}</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Bill amount</Text>
                <Text style={styles.value}>{formatCurrency(bill.amount)}</Text>
              </View>
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
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Paid From</Text>
            {accounts.length === 0 ? (
              <Text style={styles.helperText}>Add a bank or cash account first to pay the card from.</Text>
            ) : (
              <ChipSelect<number | null>
                options={accounts.map((a) => ({ key: a.id, label: a.name }))}
                selected={accountId}
                onSelect={setAccountId}
              />
            )}
            <TextInput
              style={[styles.textInput, { marginTop: 12 }]}
              value={date}
              onChangeText={setDate}
              placeholder="Date (YYYY-MM-DD)"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>
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
  });
