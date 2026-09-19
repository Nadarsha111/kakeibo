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
  Switch,
} from 'react-native';
import { getAccountService, getCategoryService, getRecurringService } from '../database';
import { Account, Category, RecurringItem } from '../types';
import { useTheme } from '../context/ThemeContext';
import ChipSelect from './ChipSelect';
import { FREQUENCIES, RecurringFrequency, countDue } from '../utils/recurring';

interface RecurringItemModalProps {
  visible: boolean;
  /** The item being edited, or null to add a new one. */
  item: RecurringItem | null;
  /** The profile a new item is added to. */
  profileId?: number;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * Adds or edits something that repeats: rent, a subscription, insurance, a salary...
 */
export default function RecurringItemModal({ visible, item, profileId, onClose, onSaved }: RecurringItemModalProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const [type, setType] = useState<RecurringItem['type']>('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [dueDate, setDueDate] = useState('');
  const [category, setCategory] = useState('');
  const [accountId, setAccountId] = useState<number | null>(null);
  const [toAccountId, setToAccountId] = useState<number | null>(null);
  const [autoPost, setAutoPost] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);

  const owningProfile = item?.profileId ?? profileId;

  useEffect(() => {
    if (!visible) return;
    const expenseCategories = getCategoryService().getCategoriesByType('expense');
    setCategories(getCategoryService().getCategories());
    setAccounts(owningProfile ? getAccountService().getAccounts(owningProfile).filter((a) => a.type !== 'loan') : []);

    if (item) {
      setType(item.type);
      setName(item.name);
      setAmount(String(item.amount));
      setFrequency(item.frequency);
      setDueDate(item.nextDueDate);
      setCategory(item.category);
      setAccountId(item.accountId ?? null);
      setToAccountId(item.toAccountId ?? null);
      setAutoPost(!!item.autoPost);
    } else {
      setType('expense');
      setName('');
      setAmount('');
      setFrequency('monthly');
      setDueDate(new Date().toISOString().split('T')[0]);
      setCategory(expenseCategories.find((c) => c.name !== 'Transfer Out')?.name ?? '');
      setAccountId(null);
      setToAccountId(null);
      setAutoPost(false);
    }
  }, [visible, item?.id]);

  const changeType = (next: RecurringItem['type']) => {
    setType(next);
    // A category belongs to one type, so pick the first that suits the new one (a transfer has none)
    setCategory(
      next === 'transfer'
        ? ''
        : (categories.find((c) => c.type === next && c.name !== 'Transfer In' && c.name !== 'Transfer Out')?.name ?? ''),
    );
  };

  // What saving now would record straight away, so a date far in the past is not a surprise
  const today = new Date().toISOString().split('T')[0];
  const backlog =
    autoPost && /^\d{4}-\d{2}-\d{2}$/.test(dueDate.trim()) && dueDate.trim() <= today
      ? countDue(dueDate.trim(), today, frequency, parseInt(dueDate.trim().slice(8), 10))
      : 0;

  const handleSave = () => {
    if (!owningProfile) {
      Alert.alert('Error', 'A profile must be selected first.');
      return;
    }
    try {
      const data = {
        name,
        amount: parseFloat(amount),
        type,
        category,
        frequency,
        nextDueDate: dueDate.trim(),
        accountId,
        toAccountId: type === 'transfer' ? toAccountId : null,
        autoPost,
      };
      if (item) {
        getRecurringService().updateItem(item.id, data);
      } else {
        getRecurringService().addItem({ ...data, profileId: owningProfile });
      }
      onSaved();
      onClose();
    } catch (error) {
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to save.');
    }
  };

  const categoryOptions = categories.filter((c) => c.type === type && c.name !== 'Transfer In' && c.name !== 'Transfer Out');

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{item ? 'Edit Recurring' : 'Add Recurring'}</Text>
          <TouchableOpacity onPress={handleSave} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.section}>
            <View style={styles.typeContainer}>
              {(['expense', 'income', 'transfer'] as const).map((option) => (
                <TouchableOpacity
                  key={option}
                  style={[styles.typeTab, type === option && styles.typeTabActive]}
                  onPress={() => changeType(option)}
                >
                  <Text style={[styles.typeText, type === option && styles.typeTextActive]}>
                    {option === 'expense' ? 'Bill / Expense' : option === 'income' ? 'Income' : 'Savings transfer'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Name</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder={type === 'expense' ? 'e.g., Rent, Netflix, Insurance' : type === 'income' ? 'e.g., Salary' : 'e.g., FD deposit'}
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Amount</Text>
            <TextInput
              style={styles.textInput}
              value={amount}
              onChangeText={setAmount}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>How often</Text>
            <ChipSelect
              options={FREQUENCIES.map((f) => ({ key: f.value, label: f.label }))}
              selected={frequency}
              onSelect={setFrequency}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Next due date</Text>
            <TextInput
              style={styles.textInput}
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="YYYY-MM-DD"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <Text style={styles.helperText}>
              Monthly, quarterly and yearly items keep this day of the month.
            </Text>
          </View>

          {type !== 'transfer' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Category</Text>
              <ChipSelect
                options={categoryOptions.map((c) => ({ key: c.name, label: c.name }))}
                selected={category}
                onSelect={setCategory}
              />
            </View>
          )}

          {type === 'transfer' ? (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Move money from</Text>
                <ChipSelect<number | null>
                  options={accounts.filter((a) => a.id !== toAccountId).map((a) => ({ key: a.id, label: a.name }))}
                  selected={accountId}
                  onSelect={setAccountId}
                />
              </View>
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>Into</Text>
                <ChipSelect<number | null>
                  options={accounts.filter((a) => a.id !== accountId).map((a) => ({ key: a.id, label: a.name }))}
                  selected={toAccountId}
                  onSelect={setToAccountId}
                />
                <Text style={styles.helperText}>
                  For an FD, a savings account or an investment. It is not counted as spending.
                </Text>
              </View>
            </>
          ) : (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{type === 'expense' ? 'Usually paid from' : 'Usually received into'}</Text>
              <ChipSelect<number | null>
                options={[{ key: null, label: 'No default' }, ...accounts.map((a) => ({ key: a.id, label: a.name }))]}
                selected={accountId}
                onSelect={setAccountId}
              />
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.switchRow}>
              <View style={styles.switchText}>
                <Text style={styles.sectionTitle}>Record automatically</Text>
                <Text style={styles.helperText}>
                  When you open the app after it falls due, the payment is recorded for you on the account above, dated the day it was due.
                </Text>
              </View>
              <Switch
                value={autoPost}
                onValueChange={setAutoPost}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              />
            </View>
            {autoPost && accountId === null && type !== 'transfer' && (
              <Text style={styles.warningText}>Choose the account above so it knows where to record it.</Text>
            )}
            {backlog > 0 && (
              <Text style={styles.warningText}>
                {backlog} {backlog === 1 ? 'payment' : 'payments'} from this date up to today will be recorded as soon as you save.
              </Text>
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
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    switchText: {
      flex: 1,
    },
    warningText: {
      fontSize: 13,
      color: '#f59e0b',
      marginTop: 10,
      fontWeight: '600',
    },
    typeContainer: {
      flexDirection: 'row',
      backgroundColor: theme.colors.surface,
      borderRadius: 8,
      overflow: 'hidden',
    },
    typeTab: {
      flex: 1,
      paddingVertical: 12,
      alignItems: 'center',
    },
    typeTabActive: {
      backgroundColor: theme.colors.primary,
    },
    typeText: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.textSecondary,
    },
    typeTextActive: {
      color: 'white',
    },
  });
