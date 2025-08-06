import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Alert,
} from 'react-native';
import DatabaseService from '../database/database';
import { Account } from '../types';
import { useTheme } from '../context/ThemeContext';
import { SafeAreaView } from 'react-native-safe-area-context';

interface AddLoanScreenProps {
  visible: boolean;
  onClose: () => void;
  onLoanAdded: () => void;
}

export default function AddLoanScreen({ visible, onClose, onLoanAdded }: AddLoanScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  
  const [borrowerName, setBorrowerName] = useState('');
  const [borrowerContact, setBorrowerContact] = useState('');
  const [amount, setAmount] = useState('');
  const [expectedReturnDate, setExpectedReturnDate] = useState('');
  const [description, setDescription] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<number | undefined>();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      loadAccounts();
    }
  }, [visible]);

  const loadAccounts = () => {
    try {
      const accountsList = DatabaseService.getAccounts();
      setAccounts(accountsList);
    } catch (error) {
      console.error('Error loading accounts:', error);
    }
  };

  const resetForm = () => {
    setBorrowerName('');
    setBorrowerContact('');
    setAmount('');
    setExpectedReturnDate('');
    setDescription('');
    setSelectedAccount(undefined);
  };

  const handleSubmit = async () => {
    if (!borrowerName.trim()) {
      Alert.alert('Error', 'Please enter borrower name');
      return;
    }

    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }

    try {
      const loanData = {
        borrowerName: borrowerName.trim(),
        borrowerContact: borrowerContact.trim() || undefined,
        amount: Number(amount),
        lentDate: new Date().toISOString().split('T')[0],
        expectedReturnDate: expectedReturnDate || undefined,
        description: description.trim() || undefined,
        accountId: selectedAccount,
      };

      DatabaseService.addLoan(loanData);
      
      Alert.alert('Success', 'Loan added successfully');
      resetForm();
      onLoanAdded();
      onClose();
    } catch (error) {
      console.error('Error adding loan:', error);
      Alert.alert('Error', 'Failed to add loan');
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add Loan</Text>
          <TouchableOpacity onPress={handleSubmit} style={styles.saveButton}>
            <Text style={styles.saveText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Borrower Information</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Name *</Text>
              <TextInput
                style={styles.textInput}
                value={borrowerName}
                onChangeText={setBorrowerName}
                placeholder="Enter borrower's name"
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Contact (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={borrowerContact}
                onChangeText={setBorrowerContact}
                placeholder="Phone, email, or other contact info"
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Loan Details</Text>
            
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Amount *</Text>
              <TextInput
                style={styles.textInput}
                value={amount}
                onChangeText={setAmount}
                placeholder="0.00"
                keyboardType="decimal-pad"
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Expected Return Date (Optional)</Text>
              <TextInput
                style={styles.textInput}
                value={expectedReturnDate}
                onChangeText={setExpectedReturnDate}
                placeholder="YYYY-MM-DD"
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Account</Text>
              <TouchableOpacity
                style={styles.accountSelector}
                onPress={() => setShowAccountPicker(!showAccountPicker)}
              >
                <Text style={[
                  styles.accountSelectorText,
                  !selectedAccount && styles.placeholderText
                ]}>
                  {selectedAccount 
                    ? accounts.find(a => a.id === selectedAccount)?.name || 'Select an account'
                    : 'Select an account'
                  }
                </Text>
                <Text style={styles.dropdownIcon}>⌄</Text>
              </TouchableOpacity>
              
              {showAccountPicker && (
                <View style={styles.accountDropdown}>
                  <TouchableOpacity
                    style={styles.accountOption}
                    onPress={() => {
                      setSelectedAccount(undefined);
                      setShowAccountPicker(false);
                    }}
                  >
                    <Text style={styles.accountOptionText}>No account</Text>
                  </TouchableOpacity>
                  {accounts.map((account) => (
                    <TouchableOpacity
                      key={account.id}
                      style={styles.accountOption}
                      onPress={() => {
                        setSelectedAccount(account.id);
                        setShowAccountPicker(false);
                      }}
                    >
                      <Text style={styles.accountOptionText}>
                        {account.name} ({account.type})
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Description (Optional)</Text>
              <TextInput
                style={[styles.textInput, styles.multilineInput]}
                value={description}
                onChangeText={setDescription}
                placeholder="Purpose of loan, terms, etc."
                multiline
                numberOfLines={3}
                placeholderTextColor={theme.colors.textSecondary}
              />
            </View>
          </View>

          <View style={styles.infoCard}>
            <Text style={styles.infoTitle}>💡 Tip</Text>
            <Text style={styles.infoText}>
              Selecting an account will automatically deduct the loan amount from that account's balance.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
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
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    cancelButton: {
      padding: 8,
    },
    cancelText: {
      color: theme.colors.textSecondary,
      fontSize: 16,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },
    saveButton: {
      padding: 8,
    },
    saveText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    content: {
      flex: 1,
      padding: 16,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 16,
    },
    inputGroup: {
      marginBottom: 16,
    },
    inputLabel: {
      fontSize: 14,
      fontWeight: '500',
      color: theme.colors.text,
      marginBottom: 6,
    },
    textInput: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      fontSize: 16,
      color: theme.colors.text,
    },
    multilineInput: {
      height: 80,
      textAlignVertical: 'top',
    },
    accountSelector: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 12,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    accountSelectorText: {
      fontSize: 16,
      color: theme.colors.text,
    },
    placeholderText: {
      color: theme.colors.textSecondary,
    },
    dropdownIcon: {
      fontSize: 16,
      color: theme.colors.textSecondary,
    },
    accountDropdown: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderTopWidth: 0,
      borderBottomLeftRadius: 8,
      borderBottomRightRadius: 8,
      maxHeight: 200,
    },
    accountOption: {
      paddingHorizontal: 12,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    accountOptionText: {
      fontSize: 16,
      color: theme.colors.text,
    },
    pickerContainer: {
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.border,
      borderRadius: 8,
      overflow: 'hidden',
    },
    picker: {
      color: theme.colors.text,
    },
    infoCard: {
      backgroundColor: theme.colors.surface,
      padding: 16,
      borderRadius: 12,
      marginTop: 16,
      borderLeftWidth: 4,
      borderLeftColor: theme.colors.primary,
    },
    infoTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 8,
    },
    infoText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      lineHeight: 20,
    },
  });