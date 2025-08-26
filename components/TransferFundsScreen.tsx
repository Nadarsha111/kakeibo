import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
} from 'react-native';
import { getTransactionService } from '../database';
import { Account } from '../types';
import { useTheme } from '../context/ThemeContext';
import { useSettings } from '../context/SettingsContext';
import OptionSelector from './OptionSelector';

interface TransferFundsScreenProps {
  visible: boolean;
  onClose: () => void;
  onTransferComplete: () => void;
  accounts: Account[];
}

export default function TransferFundsScreen({
  visible,
  onClose,
  onTransferComplete,
  accounts,
}: TransferFundsScreenProps) {
  const { theme } = useTheme();
  const { selectedProfileId } = useSettings();
  const styles = createStyles(theme);

  const [fromAccountId, setFromAccountId] = useState<number | undefined>();
  const [toAccountId, setToAccountId] = useState<number | undefined>();
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const [fromModalVisible, setFromModalVisible] = useState(false);
  const [toModalVisible, setToModalVisible] = useState(false);

  useEffect(() => {
    if (!visible) {
      // Reset form when modal is closed
      setFromAccountId(undefined);
      setToAccountId(undefined);
      setAmount('');
      setDescription('');
    }
  }, [visible]);

  const handleSubmit = () => {
    // Validation
    if (!fromAccountId) {
      Alert.alert('Validation Error', 'Please select a "from" account.');
      return;
    }
    if (!toAccountId) {
      Alert.alert('Validation Error', 'Please select a "to" account.');
      return;
    }
    if (fromAccountId === toAccountId) {
      Alert.alert('Validation Error', '"From" and "To" accounts cannot be the same.');
      return;
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert('Validation Error', 'Please enter a valid positive amount.');
      return;
    }
    if (selectedProfileId === 'all') {
        Alert.alert('Error', 'Please select a specific profile before making a transfer.');
        return;
    }

    try {
      const transactionService = getTransactionService();
      transactionService.addTransfer({
        fromAccountId,
        toAccountId,
        amount: parseFloat(amount),
        date: new Date().toISOString().split('T')[0],
        description: description.trim(),
        profileId: selectedProfileId,
      });

      Alert.alert('Success', 'Transfer completed successfully.');
      onTransferComplete();
    } catch (error) {
      console.error('Error completing transfer:', error);
      Alert.alert('Error', 'Failed to complete transfer.');
    }
  };

  const accountOptions = accounts.map(acc => ({
    label: `${acc.name} (${acc.balance.toFixed(2)})`,
    value: acc.id.toString(),
    subtitle: acc.bankName || acc.type,
  }));

  const getAccountName = (id?: number) => accounts.find(a => a.id === id)?.name || 'Select Account';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.headerButton}>
            <Text style={styles.headerButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transfer Funds</Text>
          <TouchableOpacity onPress={handleSubmit} style={styles.headerButton}>
            <Text style={[styles.headerButtonText, styles.saveButtonText]}>Transfer</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Amount</Text>
            <TextInput
              style={styles.amountInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              autoFocus
            />
          </View>

          <View style={styles.transferRow}>
            {/* From Account */}
            <View style={styles.accountBox}>
              <Text style={styles.accountLabel}>From</Text>
              <TouchableOpacity
                style={styles.accountSelector}
                onPress={() => setFromModalVisible(true)}
              >
                <Text style={styles.accountName}>{getAccountName(fromAccountId)}</Text>
                <Text style={styles.dropdownIcon}>▼</Text>
              </TouchableOpacity>
            </View>

            {/* To Account */}
            <View style={styles.accountBox}>
              <Text style={styles.accountLabel}>To</Text>
              <TouchableOpacity
                style={styles.accountSelector}
                onPress={() => fromAccountId && setToModalVisible(true)}
              >
                <Text style={styles.accountName}>{getAccountName(toAccountId)}</Text>
                <Text style={styles.dropdownIcon}>▼</Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description (Optional)</Text>
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder="e.g., Moving funds for savings"
              multiline
            />
          </View>
        </ScrollView>
      </View>

      {/* From Account Modal */}
      <OptionSelector
        visible={fromModalVisible}
        onClose={() => setFromModalVisible(false)}
        title="Select From Account"
        options={accountOptions.filter(opt => opt.value !== toAccountId?.toString())}
        selectedValue={fromAccountId?.toString()}
        onSelect={(value) => {
          setFromAccountId(parseInt(value, 10));
          setFromModalVisible(false);
        }}
      />

      {/* To Account Modal */}
      <OptionSelector
        visible={toModalVisible}
        onClose={() => setToModalVisible(false)}
        title="Select To Account"
        options={accountOptions.filter(opt => opt.value !== fromAccountId?.toString())}
        selectedValue={toAccountId?.toString()}
        onSelect={(value) => {
          setToAccountId(parseInt(value, 10));
          setToModalVisible(false);
        }}
      />
    </Modal>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
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
    headerButton: {
      paddingHorizontal: 8,
      paddingVertical: 8,
    },
    headerButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 16,
    },
    saveButtonText: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },
    content: {
      flex: 1,
      padding: 16,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 12,
    },
    amountInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      fontSize: 28,
      fontWeight: 'bold',
      textAlign: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
    },
    transferRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 16,
      marginVertical: 16,
    },
    accountBox: {
      flex: 1,
    },
    accountLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 8,
      marginLeft: 4,
    },
    accountSelector: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    accountName: {
      fontSize: 16,
      color: theme.colors.text,
      fontWeight: '500',
    },
    dropdownIcon: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    descriptionInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
      minHeight: 100,
      textAlignVertical: 'top',
    },
});