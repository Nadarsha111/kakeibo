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
import { getAccountService, getCardEmiService } from '../../database';
import { Account, CardEmi } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { interestDue, round2 } from '../../utils/loanMath';
import { formatDate } from '../../utils/format';
import ChipSelect from '../ChipSelect';

interface MarkEmiPaidModalProps {
  visible: boolean;
  /** The credit card EMI to mark paid, by id. */
  emiId: number | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Marks a credit card EMI's current installment as paid and moves it on to the next one. Paying
 * from an account records the payment to the card; choosing no account only moves the schedule on.
 */
export default function MarkEmiPaidModal({ visible, emiId, onClose, onSaved }: MarkEmiPaidModalProps) {
  const { theme } = useTheme();
  const { formatCurrency } = useSettings();
  const styles = createStyles(theme);

  const [emi, setEmi] = useState<CardEmi | null>(null);
  const [cardName, setCardName] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountId, setAccountId] = useState<number | null>(null);
  const [date, setDate] = useState('');

  useEffect(() => {
    if (!visible || emiId == null) return;
    const found = getCardEmiService().getEmiById(emiId);
    setEmi(found);
    const card = found ? getAccountService().getAccountById(found.accountId) : null;
    setCardName(card?.name ?? '');
    const candidates = card
      ? getAccountService().getAccounts(card.profileId).filter((a) => a.type !== 'loan' && a.type !== 'credit_card')
      : [];
    setAccounts(candidates);
    setAccountId(candidates[0]?.id ?? null);
    setDate(new Date().toISOString().split('T')[0]);
  }, [visible, emiId]);

  const outstanding = emi ? round2((emi.principal || 0) - (emi.returnedAmount || 0)) : 0;
  const interest = emi ? interestDue(outstanding, emi.interestRate || 0) : 0;
  const installment = emi ? Math.min(emi.installmentAmount, round2(outstanding + interest)) : 0;

  const handleSave = () => {
    if (!emi) return;
    try {
      getCardEmiService().markPaid(emi.id, { accountId, date: date.trim() });
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
          <Text style={styles.headerTitle}>Mark Paid</Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {emi && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{cardName ? `${cardName} – ${emi.name}` : emi.name}</Text>
              {emi.nextDueDate && (
                <View style={styles.row}>
                  <Text style={styles.label}>Due</Text>
                  <Text style={styles.value}>{formatDate(emi.nextDueDate)}</Text>
                </View>
              )}
              <View style={styles.row}>
                <Text style={styles.label}>Installment</Text>
                <Text style={styles.value}>{formatCurrency(installment)}</Text>
              </View>
              {interest > 0 && (
                <View style={styles.row}>
                  <Text style={styles.label}>of which interest</Text>
                  <Text style={styles.value}>{formatCurrency(interest)}</Text>
                </View>
              )}
              <View style={styles.row}>
                <Text style={styles.label}>Left to pay off</Text>
                <Text style={styles.value}>{formatCurrency(outstanding)}</Text>
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Paid From</Text>
            <ChipSelect<number | null>
              options={[{ key: null, label: 'No account' }, ...accounts.map((a) => ({ key: a.id, label: a.name }))]}
              selected={accountId}
              onSelect={setAccountId}
            />
            {accountId === null ? (
              <Text style={styles.helperText}>
                Only moves the EMI on to its next installment, with no transaction or balance change. Use this when you already recorded paying the card's bill.
              </Text>
            ) : (
              <>
                <TextInput
                  style={[styles.textInput, { marginTop: 12 }]}
                  value={date}
                  onChangeText={setDate}
                  placeholder="Date (YYYY-MM-DD)"
                  placeholderTextColor={theme.colors.textSecondary}
                />
                <Text style={styles.helperText}>
                  Records the installment as a payment from this account to the card.
                </Text>
              </>
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
