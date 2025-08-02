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
import DatabaseService from '../services/database';
import { Category } from '../types';

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
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'income' | 'expense'>('expense');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'credit_card' | 'debit_card'>('credit_card');
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

    try {
      const transactionData = {
        amount: parseFloat(amount),
        type,
        category: selectedCategory,
        description: description.trim() || '',
        date,
        paymentMethod,
      };

      console.log('Adding transaction:', transactionData);
      const transactionId = DatabaseService.addTransaction(transactionData);
      console.log('Transaction added with ID:', transactionId);
      
      Alert.alert(
        'Success', 
        'Transaction added successfully!',
        [
          {
            text: 'OK',
            onPress: () => {
              resetForm();
              onTransactionAdded();
              onClose();
            }
          }
        ]
      );
    } catch (error) {
      console.error('Error adding transaction:', error);
      Alert.alert(
        'Error',
        'Failed to add transaction. Please try again.',
        [{ text: 'OK' }]
      );
      console.error('Error adding transaction:', error);
      Alert.alert('Error', 'Failed to add transaction. Please try again.');
    }
  };

  const resetForm = () => {
    setAmount('');
    setDescription('');
    setType('expense');
    setSelectedCategory('');
    setPaymentMethod('credit_card');
    setDate(new Date().toISOString().split('T')[0]);
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cancelButtonText: {
    color: '#6b7280',
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
  saveButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#14b8a6',
    borderRadius: 8,
  },
  saveButtonText: {
    color: 'white',
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
    color: '#111827',
    marginBottom: 12,
  },
  amountInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: 'white',
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
    backgroundColor: '#14b8a6',
  },
  typeButtonText: {
    color: '#6b7280',
    fontWeight: '500',
  },
  typeButtonTextActive: {
    color: 'white',
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
    backgroundColor: 'white',
    minWidth: 80,
  },
  categoryItemActive: {
    backgroundColor: '#14b8a6',
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
    color: 'white',
  },
  categoryName: {
    fontSize: 12,
    textAlign: 'center',
    color: '#111827',
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
    backgroundColor: 'white',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  paymentItemActive: {
    borderColor: '#14b8a6',
  },
  paymentEmoji: {
    fontSize: 24,
    marginBottom: 8,
  },
  paymentLabel: {
    fontSize: 12,
    color: '#111827',
    textAlign: 'center',
  },
  descriptionInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    textAlignVertical: 'top',
  },
  dateInput: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    fontSize: 16,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
});
