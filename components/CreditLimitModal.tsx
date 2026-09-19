import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
} from 'react-native';
import { getAccountService } from '../database';
import { Account } from '../types';
import { useTheme } from '../context/ThemeContext';

interface CreditLimitModalProps {
  visible: boolean;
  account: Account | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Sets or clears the credit limit of a credit card account.
 */
export default function CreditLimitModal({ visible, account, onClose, onSaved }: CreditLimitModalProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [limit, setLimit] = useState('');

  useEffect(() => {
    if (visible && account) {
      setLimit(account.creditLimit ? String(account.creditLimit) : '');
    }
  }, [visible, account?.id]);

  const handleSave = () => {
    if (!account) return;
    const trimmed = limit.trim();
    if (trimmed && !(parseFloat(trimmed) > 0)) {
      Alert.alert('Error', 'Please enter a valid credit limit, or leave it empty to remove it.');
      return;
    }
    try {
      getAccountService().updateAccount(account.id, { creditLimit: trimmed ? parseFloat(trimmed) : null });
      onSaved();
      onClose();
    } catch (error) {
      console.error('Error saving credit limit:', error);
      Alert.alert('Error', 'Failed to save the credit limit.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Credit Limit</Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.content}>
          <Text style={styles.sectionTitle}>{account?.name}</Text>
          <TextInput
            style={styles.textInput}
            value={limit}
            onChangeText={setLimit}
            keyboardType="decimal-pad"
            placeholder="e.g., 50000"
            placeholderTextColor={theme.colors.textSecondary}
            autoFocus
          />
          <Text style={styles.helperText}>
            Used to show how much of the limit you have used. Leave empty to remove the limit.
          </Text>
        </View>
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
      paddingHorizontal: 16,
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
    helperText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 8,
      fontStyle: 'italic',
    },
  });
