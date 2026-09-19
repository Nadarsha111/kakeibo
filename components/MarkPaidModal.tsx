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
import { getAccountService, getRecurringService } from '../database';
import { Account, RecurringItem } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import ChipSelect from './ChipSelect';

interface MarkPaidModalProps {
  visible: boolean;
  item: RecurringItem | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Marks a recurring item's current due date as paid (or received): records the transaction and
 * moves the due date on. Choosing no account only moves the due date.
 */
export default function MarkPaidModal({ visible, item, onClose, onSaved }: MarkPaidModalProps) {
  const { theme } = useTheme();
  const { formatCurrency } = useSettings();
  const styles = createStyles(theme);

  const [amount, setAmount] = useState('');
  const [date, setDate] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const isIncome = item?.type === 'income';
  const isTransfer = item?.type === 'transfer';
  const destination = accounts.find((a) => a.id === item?.toAccountId);

  useEffect(() => {
    if (!visible || !item) return;
    const candidates = getAccountService().getAccounts(item.profileId).filter((a) => a.type !== 'loan');
    setAccounts(candidates);
    setAccountId(item.accountId ?? candidates[0]?.id ?? null);
    setAmount(String(item.amount));
    setDate(new Date().toISOString().split('T')[0]);
  }, [visible, item?.id]);

  const handleSave = () => {
    if (!item) return;
    try {
      getRecurringService().markPaid(item.id, { accountId, amount: parseFloat(amount), date: date.trim() });
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
          <Text style={styles.headerTitle}>{isIncome ? 'Mark Received' : isTransfer ? 'Mark Saved' : 'Mark Paid'}</Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {item && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{item.name}</Text>
              <View style={styles.row}>
                <Text style={styles.label}>Due</Text>
                <Text style={styles.value}>{new Date(item.nextDueDate).toLocaleDateString()}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Usual amount</Text>
                <Text style={styles.value}>{formatCurrency(item.amount)}</Text>
              </View>
              {isTransfer && (
                <View style={styles.row}>
                  <Text style={styles.label}>Goes into</Text>
                  <Text style={styles.value}>{destination?.name ?? 'Not set: edit the item first'}</Text>
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
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{isIncome ? 'Received Into' : isTransfer ? 'Moved From' : 'Paid From'}</Text>
            <ChipSelect<number | null>
              options={[{ key: null, label: 'No account' }, ...accounts.filter((a) => a.id !== item?.toAccountId).map((a) => ({ key: a.id, label: a.name }))]}
              selected={accountId}
              onSelect={setAccountId}
            />
            {accountId === null ? (
              <Text style={styles.helperText}>
                Only moves the due date on, with no transaction or balance change. Use this for something you handled before using the app.
              </Text>
            ) : (
              <TextInput
                style={[styles.textInput, { marginTop: 12 }]}
                value={date}
                onChangeText={setDate}
                placeholder="Date (YYYY-MM-DD)"
                placeholderTextColor={theme.colors.textSecondary}
              />
            )}
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
