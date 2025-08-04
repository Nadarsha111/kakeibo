import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  StyleSheet, 
  Alert,
  Modal 
} from 'react-native';
import DatabaseService from '../database/database';
import { Category } from '../types';
import { useTheme } from '../context/ThemeContext';

interface AddTransactionScreenProps {
  visible: boolean;
  onClose: () => void;
  onTransactionAdded: () => void;
}

export default function AddTransactionScreen({ 
  visible, 
  onClose, 
  onTransactionAdded 
}: AddTransactionScreenProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'debit_card'>('credit_card');
  const [priority, setPriority] = useState<'need' | 'want' | undefined>(undefined);
  const [categories, setCategories] = useState<Category[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (visible) {
      loadCategories();
    }
  }, [visible]);

  const loadCategories = () => {
    try {
      const allCategories = DatabaseService.getCategories();
      setCategories(allCategories);
      
      // Set default category based on type
      const defaultCategory = allCategories.find(cat => cat.type === type);
      if (defaultCategory) {
        setSelectedCategory(defaultCategory.name);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleTypeChange = (newType: 'income' | 'expense') => {
    setType(newType);
    // Reset category selection when type changes
    const categoryForType = categories.find(cat => cat.type === newType);
    setSelectedCategory(categoryForType?.name || '');
    
    // Reset priority for income transactions
    if (newType === 'income') {
      setPriority(undefined);
    }
  };

  const handleSubmit = () => {
    // Validation
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert('Error', 'Please enter a valid amount');
      return;
    }
    
    if (!selectedCategory) {
      Alert.alert('Error', 'Please select a category');
      return;
    }

    // For expense transactions, priority is optional but recommended
    if (type === 'expense' && !priority) {
      Alert.alert(
        'Priority Selection', 
        'Would you like to classify this expense as a Need or Want? This helps with budgeting.',
        [
          { text: 'Skip', style: 'cancel', onPress: () => submitTransaction() },
          { text: 'Select Priority', onPress: () => {} }
        ]
      );
      return;
    }

    submitTransaction();
  };

  const submitTransaction = () => {
    try {
      const transactionData = {
        amount: parseFloat(amount),
        type,
        category: selectedCategory,
        description: description.trim() || '',
        date,
        paymentMethod,
        priority: type === 'expense' ? priority : undefined,
      };

      console.log('Adding transaction:', transactionData);
      const transactionId = DatabaseService.addTransaction(transactionData);
      console.log('Transaction added with ID:', transactionId);
      
      resetForm();
      onTransactionAdded();
      onClose();
    } catch (error) {
      console.error('Error adding transaction:', error);
      Alert.alert(
        'Error',
        'Failed to add transaction. Please try again.',
        [{ text: 'OK' }]
      );
    }
  };

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setType('expense');
    setSelectedCategory('');
    setPaymentMethod('credit_card');
    setDate(new Date().toISOString().split('T')[0]);
    setPriority(undefined);
  };

  const getFilteredCategories = () => {
    return categories.filter(cat => cat.type === type);
  };

  const getCategoryEmoji = (categoryName: string) => {
    const emojiMap: { [key: string]: string } = {
      'Transport': '🚗',
      'Restaurant': '🍽️',
      'Shopping': '🛍️',
      'Food': '🍎',
      'Gift': '🎁',
      'Free time': '🎮',
      'Family': '👨‍👩‍👧‍👦',
      'Health': '🏥',
      'Salary': '💰',
      'Investment': '📈',
    };
    return emojiMap[categoryName] || '💵';
  };

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
          <Text style={styles.headerTitle}>Add Transaction</Text>
          <TouchableOpacity onPress={handleSubmit} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>Save</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content}>
          {/* Amount Input */}
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

          {/* Type Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Type</Text>
            <View style={styles.typeSelector}>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  type === 'expense' && styles.typeButtonActive
                ]}
                onPress={() => handleTypeChange('expense')}
              >
                <Text style={[
                  styles.typeButtonText,
                  type === 'expense' && styles.typeButtonTextActive
                ]}>
                  Expense
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  type === 'income' && styles.typeButtonActive
                ]}
                onPress={() => handleTypeChange('income')}
              >
                <Text style={[
                  styles.typeButtonText,
                  type === 'income' && styles.typeButtonTextActive
                ]}>
                  Income
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Category Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Category</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={styles.categoryGrid}>
                {getFilteredCategories().map((category) => (
                  <TouchableOpacity
                    key={category.id}
                    style={[
                      styles.categoryItem,
                      selectedCategory === category.name && styles.categoryItemActive
                    ]}
                    onPress={() => setSelectedCategory(category.name)}
                  >
                    <View style={[
                      styles.categoryIcon,
                      { backgroundColor: category.color }
                    ]}>
                      <Text style={styles.categoryEmoji}>
                        {getCategoryEmoji(category.name)}
                      </Text>
                    </View>
                    <Text style={styles.categoryName}>{category.name}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>
          </View>

          {/* Payment Method */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Payment Method</Text>
            <View style={styles.paymentGrid}>
              {[
                { value: 'cash', label: 'Cash', emoji: '💵' },
                { value: 'credit_card', label: 'Credit Card', emoji: '💳' },
                { value: 'debit_card', label: 'Debit Card', emoji: '💳' }
              ].map((method) => (
                <TouchableOpacity
                  key={method.value}
                  style={[
                    styles.paymentItem,
                    paymentMethod === method.value && styles.paymentItemActive
                  ]}
                  onPress={() => setPaymentMethod(method.value as any)}
                >
                  <Text style={styles.paymentEmoji}>{method.emoji}</Text>
                  <Text style={styles.paymentLabel}>{method.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Priority (for expenses only) */}
          {type === 'expense' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Priority (Optional)</Text>
              <Text style={styles.sectionSubtitle}>
                Classify this expense to help with budgeting
              </Text>
              <View style={styles.priorityGrid}>
                {[
                  { value: 'need', label: 'Need', emoji: '🎯', description: 'Essential expense' },
                  { value: 'want', label: 'Want', emoji: '✨', description: 'Discretionary expense' }
                ].map((priorityOption) => (
                  <TouchableOpacity
                    key={priorityOption.value}
                    style={[
                      styles.priorityItem,
                      priority === priorityOption.value && styles.priorityItemActive
                    ]}
                    onPress={() => setPriority(priorityOption.value as 'need' | 'want')}
                  >
                    <Text style={styles.priorityEmoji}>{priorityOption.emoji}</Text>
                    <Text style={styles.priorityLabel}>{priorityOption.label}</Text>
                    <Text style={styles.priorityDescription}>{priorityOption.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {priority && (
                <TouchableOpacity
                  style={styles.clearPriorityButton}
                  onPress={() => setPriority(undefined)}
                >
                  <Text style={styles.clearPriorityText}>Clear Selection</Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* Description */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Description (Optional)</Text>
            <TextInput
              style={styles.descriptionInput}
              value={description}
              onChangeText={setDescription}
              placeholder="Add a note..."
              multiline
              numberOfLines={3}
            />
          </View>

          {/* Date */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date</Text>
            <TextInput
              style={styles.dateInput}
              value={date}
              onChangeText={setDate}
              placeholder="YYYY-MM-DD"
            />
          </View>
        </ScrollView>
      </View>
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
  amountInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 4,
  },
  typeButton: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeButtonActive: {
    backgroundColor: theme.colors.primary,
  },
  typeButtonText: {
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  typeButtonTextActive: {
    color: '#fff',
  },
  categoryGrid: {
    flexDirection: 'row',
    paddingVertical: 8,
  },
  categoryItem: {
    alignItems: 'center',
    marginRight: 16,
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.surface,
    minWidth: 80,
  },
  categoryItemActive: {
    backgroundColor: theme.colors.primary,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  categoryEmoji: {
    fontSize: 20,
    color: theme.colors.text,
  },
  categoryName: {
    fontSize: 12,
    textAlign: 'center',
    color: theme.colors.text,
  },
  paymentGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  paymentItem: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentItemActive: {
    borderColor: theme.colors.primary,
  },
  paymentEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  paymentLabel: {
    fontSize: 12,
    color: theme.colors.text,
    textAlign: 'center',
  },
  descriptionInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    textAlignVertical: 'top',
    color: theme.colors.text,
  },
  dateInput: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    color: theme.colors.text,
  },
  sectionSubtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginBottom: 12,
    marginTop: 4,
  },
  priorityGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  priorityItem: {
    flex: 1,
    alignItems: 'center',
    padding: 16,
    marginHorizontal: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  priorityItemActive: {
    borderColor: theme.colors.primary,
    backgroundColor: theme.colors.primaryLight || theme.colors.surface,
  },
  priorityEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  priorityLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  priorityDescription: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  clearPriorityButton: {
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  clearPriorityText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    textDecorationLine: 'underline',
  },
});
