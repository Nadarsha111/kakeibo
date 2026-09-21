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
import { getCardEmiService, getCardService, getCategoryService } from '../../database';
import { Account, Category, CreditCard } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { addMonths, isValidDate, monthlyPayment, totalInterest } from '../../utils/loanMath';

interface AddCardEmiModalProps {
  visible: boolean;
  account: Account | null;
  onClose: () => void;
  onAdded: () => void;
}

/**
 * Records a purchase on a credit card converted to fixed monthly installments: it counts against
 * the shared balance right away like any other charge, but bills as a fixed amount each month
 * instead of all at once (see CardEmiService and RecurringService.getNeededThisMonth).
 */
export default function AddCardEmiModal({ visible, account, onClose, onAdded }: AddCardEmiModalProps) {
  const { theme } = useTheme();
  const { formatCurrency } = useSettings();
  const styles = createStyles(theme);

  const [name, setName] = useState('');
  const [principal, setPrincipal] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<Category[]>([]);
  const [interestRate, setInterestRate] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [firstDueDate, setFirstDueDate] = useState('');
  const [installmentOverride, setInstallmentOverride] = useState('');
  const [cards, setCards] = useState<CreditCard[]>([]);
  const [cardId, setCardId] = useState<number | undefined>(undefined);

  useEffect(() => {
    if (!visible || !account) return;
    setName('');
    setPrincipal('');
    setInterestRate('');
    setTermMonths('');
    setFirstDueDate('');
    setInstallmentOverride('');
    setCardId(undefined);

    const expenseCategories = getCategoryService().getCategoriesByType('expense');
    setCategories(expenseCategories);
    setCategory(expenseCategories[0]?.name || '');

    setCards(getCardService().getCardsForAccount(account.id));
  }, [visible, account?.id]);

  const installmentPlan = useMemo(() => {
    const amount = parseFloat(principal);
    const rate = parseFloat(interestRate || '0');
    const months = parseInt(termMonths, 10);
    if (!(amount > 0) || isNaN(rate) || rate < 0 || !(months >= 1)) return null;
    const override = parseFloat(installmentOverride);
    const payment = override > 0 ? override : monthlyPayment(amount, rate, months);
    return { payment, months, interest: totalInterest(amount, payment, months) };
  }, [principal, interestRate, termMonths, installmentOverride]);

  const handleSubmit = () => {
    if (!account) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a description, e.g. "Laptop".');
      return;
    }
    if (!principal || !(parseFloat(principal) > 0)) {
      Alert.alert('Error', 'Please enter the purchase amount.');
      return;
    }
    if (!category) {
      Alert.alert('Error', 'Please select a category.');
      return;
    }
    const rate = parseFloat(interestRate || '0');
    if (isNaN(rate) || rate < 0 || rate > 100) {
      Alert.alert('Error', 'Enter a yearly interest rate between 0 and 100 (0 if none).');
      return;
    }
    const months = Number(termMonths);
    if (!Number.isInteger(months) || months < 1 || months > 600) {
      Alert.alert('Error', 'Enter the term as a whole number of months (1 to 600).');
      return;
    }
    if (firstDueDate.trim() && !isValidDate(firstDueDate.trim())) {
      Alert.alert('Error', 'Enter the first due date as YYYY-MM-DD.');
      return;
    }
    if (installmentOverride.trim() && !(parseFloat(installmentOverride) > 0)) {
      Alert.alert('Error', 'Enter a valid monthly installment amount.');
      return;
    }

    try {
      const today = new Date().toISOString().split('T')[0];
      const firstDue = firstDueDate.trim() || addMonths(today, 1);

      getCardEmiService().addEmi({
        accountId: account.id,
        cardId: cardId ?? null,
        profileId: account.profileId,
        name: name.trim(),
        category,
        principal: parseFloat(principal),
        interestRate: rate,
        termMonths: months,
        installmentAmount: installmentOverride.trim() ? parseFloat(installmentOverride) : undefined,
        firstDueDate: firstDue,
        date: today,
      });
      onAdded();
      onClose();
    } catch (error) {
      console.error('Error adding card EMI:', error);
      Alert.alert('Error', error instanceof Error ? error.message : 'Failed to add the EMI.');
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Add EMI</Text>
          <TouchableOpacity onPress={handleSubmit} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          <Text style={styles.helperText}>
            {`Records the purchase on ${account?.name} right away (it counts toward what you owe immediately), but bills it as a fixed amount each month instead of all at once.`}
          </Text>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description</Text>
            <TextInput
              style={styles.textInput}
              value={name}
              onChangeText={setName}
              placeholder="e.g., Laptop, Phone"
              placeholderTextColor={theme.colors.textSecondary}
              autoFocus
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Purchase Amount</Text>
            <TextInput
              style={styles.textInput}
              value={principal}
              onChangeText={setPrincipal}
              placeholder="0.00"
              keyboardType="decimal-pad"
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {categories.map((cat) => (
                <TouchableOpacity
                  key={cat.id}
                  style={[styles.chip, category === cat.name && styles.chipActive]}
                  onPress={() => setCategory(cat.name)}
                >
                  <Text style={[styles.chipText, category === cat.name && styles.chipTextActive]}>
                    {cat.icon} {cat.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {cards.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Card</Text>
              <View style={styles.chipRow}>
                {[{ id: undefined, name: 'Unassigned' }, ...cards].map((card) => (
                  <TouchableOpacity
                    key={card.id ?? 'unassigned'}
                    style={[styles.chip, cardId === card.id && styles.chipActive]}
                    onPress={() => setCardId(card.id)}
                  >
                    <Text style={[styles.chipText, cardId === card.id && styles.chipTextActive]}>{card.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>EMI Plan</Text>
            <TextInput
              style={styles.textInput}
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
              value={firstDueDate}
              onChangeText={setFirstDueDate}
              placeholder="First Due Date (YYYY-MM-DD, default next month)"
              placeholderTextColor={theme.colors.textSecondary}
            />
            <TextInput
              style={[styles.textInput, { marginTop: 12 }]}
              value={installmentOverride}
              onChangeText={setInstallmentOverride}
              placeholder={
                installmentPlan
                  ? `Monthly Installment (calculated: ${formatCurrency(installmentPlan.payment)})`
                  : 'Monthly Installment (calculated from the above)'
              }
              keyboardType="decimal-pad"
              placeholderTextColor={theme.colors.textSecondary}
            />
            {installmentPlan && (
              <Text style={styles.helperText}>
                {`About ${formatCurrency(installmentPlan.payment)} a month for ${installmentPlan.months} months, ${formatCurrency(installmentPlan.interest)} total interest. Interest is charged monthly on what is still outstanding.`}
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
