import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  SafeAreaView,
  TextInput,
  Alert,
  Modal,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { getCategoryService } from '../../database';
import { isTransferCategory, type CategoryUsage } from '../../database/CategoryService';
import { Category } from '../../types';
import OptionSelector from '../OptionSelector';

interface ManageCategoriesModalProps {
  visible: boolean;
  onClose: () => void;
}

export default function ManageCategoriesModal({ visible, onClose }: ManageCategoriesModalProps) {
  const { theme, isDark } = useTheme();
  const { formatCurrency } = useSettings();
  const styles = createStyles(theme);

  const [categories, setCategories] = useState<Category[]>([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [selectedTab, setSelectedTab] = useState<'expense' | 'income'>('expense');
  const [categoryToDelete, setCategoryToDelete] = useState<{ category: Category; usage: CategoryUsage } | null>(null);
  const [replacementId, setReplacementId] = useState<number | null>(null);
  const [deleteError, setDeleteError] = useState<string>();

  // Form states
  const [formName, setFormName] = useState('');
  const [formColor, setFormColor] = useState('#10b981');
  const [formIcon, setFormIcon] = useState('💰');
  const [formType, setFormType] = useState<'income' | 'expense'>('expense');
  const [formBudgetLimit, setFormBudgetLimit] = useState('');

  // Modal states
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showIconPicker, setShowIconPicker] = useState(false);

  const predefinedColors = [
    '#10b981', '#ef4444', '#f97316', '#3b82f6', '#06b6d4',
    '#8b5cf6', '#ec4899', '#14b8a6', '#22c55e', '#6366f1',
    '#f59e0b', '#84cc16', '#06b6d4', '#8b5cf6', '#f43f5e'
  ];

  const predefinedIcons = [
    '💰', '🏠', '🚗', '🍽️', '🛍️', '🍎', '🎁', '🎮',
    '👨‍👩‍👧‍👦', '🏥', '📚', '⚡', '💡', '🎵', '🎬', '✈️',
    '🏋️', '🎨', '📱', '💻', '🍕', '☕', '🚕', '🚌'
  ];

  useEffect(() => {
    if (visible) {
      loadCategories();
    }
  }, [visible]);

  const loadCategories = () => {
    const categoryService = getCategoryService();
    const allCategories = categoryService.getCategories();
    setCategories(allCategories);
  };

  const filteredCategories = categories.filter(cat => cat.type === selectedTab);
  const replacements = categoryToDelete ? categories.filter((category) =>
    category.type === categoryToDelete.category.type && category.id !== categoryToDelete.category.id &&
    !isTransferCategory(category.name),
  ) : [];
  const replacement = replacements.find(({ id }) => id === replacementId);
  const usageLabels = categoryToDelete ? ([
    [categoryToDelete.usage.transactions, 'transaction', 'transactions'],
    [categoryToDelete.usage.recurringItems, 'recurring item', 'recurring items'],
    [categoryToDelete.usage.budgets, 'budget', 'budgets'],
  ] as const).flatMap(([count, singular, plural]) => count ? [`${count} ${count === 1 ? singular : plural}`] : []) : [];

  const resetForm = () => {
    setFormName('');
    setFormColor('#10b981');
    setFormIcon('💰');
    setFormType('expense');
    setFormBudgetLimit('');
    setEditingCategory(null);
  };

  const handleAddCategory = () => {
    resetForm();
    setFormType(selectedTab); // Set type to current tab
    setShowAddModal(true);
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategory(category);
    setFormName(category.name);
    setFormColor(category.color);
    setFormIcon(category.icon);
    setFormType(category.type);
    setFormBudgetLimit(category.budgetLimit?.toString() || '');
    setShowAddModal(true);
  };

  const handleSaveCategory = () => {
    if (!formName.trim()) {
      Alert.alert('Error', 'Please enter a category name');
      return;
    }

    const categoryData = {
      name: formName.trim(),
      color: formColor,
      icon: formIcon,
      type: formType,
      budgetLimit: formBudgetLimit ? parseFloat(formBudgetLimit) : undefined,
    };

    let success = false;
    const categoryService = getCategoryService();
    if (editingCategory) {
      success = categoryService.updateCategory(editingCategory.id, categoryData);
    } else {
      success = categoryService.addCategory(categoryData);
    }

    if (success) {
      loadCategories();
      setShowAddModal(false);
      resetForm();
    } else {
      Alert.alert('Error', 'Failed to save category. Name might already exist.');
    }
  };

  const closeReplacement = () => {
    setCategoryToDelete(null);
    setReplacementId(null);
    setDeleteError(undefined);
  };

  const deleteCategory = (category: Category, targetId?: number) => {
    try {
      getCategoryService().deleteCategory(category.id, targetId);
      closeReplacement();
      loadCategories();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Try again.';
      if (targetId === undefined) Alert.alert('Could not delete category', message);
      else setDeleteError(message);
    }
  };

  const handleDeleteCategory = (category: Category) => {
    if (isTransferCategory(category.name)) {
      Alert.alert('Transfer category', 'This category is used for transfers between accounts.');
      return;
    }
    try {
      const usage = getCategoryService().getCategoryUsage(category.id);
      if (usage.transactions || usage.recurringItems || usage.budgets) {
        setCategoryToDelete({ category, usage });
        return;
      }
      Alert.alert('Delete category', `Delete “${category.name}”?`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => deleteCategory(category) },
      ]);
    } catch (error) {
      Alert.alert('Could not delete category', error instanceof Error ? error.message : 'Try again.');
    }
  };

  const renderCategoryItem = ({ item }: { item: Category }) => (
    <View style={styles.categoryItem}>
      <View style={styles.categoryInfo}>
        <View style={[styles.categoryIcon, { backgroundColor: item.color }]}>
          <Text style={styles.iconText}>{item.icon}</Text>
        </View>
        <View style={styles.categoryDetails}>
          <Text style={styles.categoryName}>{item.name}</Text>
          {item.budgetLimit && (
            <Text style={styles.budgetLimit}>Budget: {formatCurrency(item.budgetLimit)}</Text>
          )}
        </View>
      </View>
      <View style={styles.categoryActions}>
        <TouchableOpacity
          style={styles.editButton}
          onPress={() => handleEditCategory(item)}
        >
          <Text style={styles.editButtonText}>Edit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.deleteButton}
          onPress={() => handleDeleteCategory(item)}
        >
          <Text style={styles.deleteButtonText}>Delete</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const colorOptions = predefinedColors.map(color => ({
    label: '',
    value: color,
    color: color,
  }));

  const iconOptions = predefinedIcons.map(icon => ({
    label: icon,
    value: icon,
  }));

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <SafeAreaView style={styles.container}>
        <StatusBar style={isDark ? "light" : "dark"} />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Manage Categories</Text>
          <TouchableOpacity onPress={handleAddCategory}>
            <Text style={styles.addButton}>+ Add</Text>
          </TouchableOpacity>
        </View>

        {/* Tab Selector */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'expense' && styles.activeTab]}
            onPress={() => setSelectedTab('expense')}
          >
            <Text style={[styles.tabText, selectedTab === 'expense' && styles.activeTabText]}>
              Expenses
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, selectedTab === 'income' && styles.activeTab]}
            onPress={() => setSelectedTab('income')}
          >
            <Text style={[styles.tabText, selectedTab === 'income' && styles.activeTabText]}>
              Income
            </Text>
          </TouchableOpacity>
        </View>

        {/* Categories List */}
        <FlatList
          data={filteredCategories}
          renderItem={renderCategoryItem}
          keyExtractor={(item) => item.id.toString()}
          style={styles.categoriesList}
          showsVerticalScrollIndicator={false}
        />

        {categoryToDelete && (
          <Modal visible transparent animationType="fade" onRequestClose={closeReplacement}>
            <View style={styles.modalOverlay}>
              <View style={styles.modalContent}>
                <Text style={styles.modalTitle}>Delete “{categoryToDelete.category.name}”</Text>
                <Text style={styles.replacementNote}>
                  Used by {usageLabels.join(', ')}. Choose where to move these items before deleting the category.
                </Text>
                <FlatList
                  data={replacements}
                  keyExtractor={({ id }) => String(id)}
                  style={styles.replacementList}
                  ListEmptyComponent={<Text style={styles.replacementNote}>Add another {categoryToDelete.category.type} category first.</Text>}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      accessibilityRole="button"
                      accessibilityState={{ selected: item.id === replacementId }}
                      style={[styles.replacementOption, item.id === replacementId && styles.replacementSelected]}
                      onPress={() => {
                        setReplacementId(item.id);
                        setDeleteError(undefined);
                      }}
                    >
                      <Text style={styles.categoryName}>{item.icon} {item.name}</Text>
                    </TouchableOpacity>
                  )}
                />
                {replacement?.budgetLimit != null && categoryToDelete.category.budgetLimit != null && (
                  <Text style={styles.replacementNote}>The replacement keeps its current category budget limit.</Text>
                )}
                {deleteError && <Text accessibilityLiveRegion="polite" style={styles.deleteError}>{deleteError}</Text>}
                <View style={styles.modalActions}>
                  <TouchableOpacity accessibilityRole="button" style={styles.cancelButton} onPress={closeReplacement}>
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    accessibilityRole="button"
                    disabled={!replacement}
                    style={[styles.confirmDeleteButton, !replacement && styles.disabled]}
                    onPress={() => {
                      if (replacement) deleteCategory(categoryToDelete.category, replacement.id);
                    }}
                  >
                    <Text style={styles.saveButtonText}>Move and delete</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* Add/Edit Category Modal */}
        <Modal visible={showAddModal} animationType="slide" transparent={true}>
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>
                {editingCategory
                  ? `Edit ${formType === 'income' ? 'Income' : 'Expense'} Category`
                  : `Add ${formType === 'income' ? 'Income' : 'Expense'} Category`}
              </Text>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Name</Text>
                <TextInput
                  style={styles.input}
                  value={formName}
                  onChangeText={setFormName}
                  placeholder="Category name"
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>

              <View style={styles.formRow}>
                <View style={styles.formGroup}>
                  <Text style={styles.label}>Color</Text>
                  <TouchableOpacity
                    style={[styles.colorButton, { backgroundColor: formColor }]}
                    onPress={() => setShowColorPicker(true)}
                  >
                    <Text style={styles.colorButtonText}>●</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.formGroup}>
                  <Text style={styles.label}>Icon</Text>
                  <TouchableOpacity
                    style={styles.iconButton}
                    onPress={() => setShowIconPicker(true)}
                  >
                    <Text style={styles.iconButtonText}>{formIcon}</Text>
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.formGroup}>
                <Text style={styles.label}>Budget Limit (Optional)</Text>
                <TextInput
                  style={styles.input}
                  value={formBudgetLimit}
                  onChangeText={setFormBudgetLimit}
                  placeholder="0.00"
                  keyboardType="numeric"
                  placeholderTextColor={theme.colors.textSecondary}
                />
              </View>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  style={styles.cancelButton}
                  onPress={() => {
                    setShowAddModal(false);
                    resetForm();
                  }}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.saveButton}
                  onPress={handleSaveCategory}
                >
                  <Text style={styles.saveButtonText}>
                    {editingCategory ? 'Update' : 'Add'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Color Picker Modal */}
        <OptionSelector
          visible={showColorPicker}
          onClose={() => setShowColorPicker(false)}
          title="Select Color"
          options={colorOptions}
          selectedValue={formColor}
          onSelect={(value: string) => {
            setFormColor(value);
          }}
          renderOption={(option) => (
            <View style={styles.colorOption}>
              <View style={[styles.colorSwatch, { backgroundColor: option.value }]} />
              <Text style={styles.colorValue}>{option.value}</Text>
            </View>
          )}
        />

        {/* Icon Picker Modal */}
        <OptionSelector
          visible={showIconPicker}
          onClose={() => setShowIconPicker(false)}
          title="Select Icon"
          options={iconOptions}
          selectedValue={formIcon}
          onSelect={(value: string) => {
            setFormIcon(value);
          }}
        />
      </SafeAreaView>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  closeButton: {
    color: theme.colors.primary,
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  addButton: {
    color: theme.colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    margin: 16,
    backgroundColor: theme.colors.surface,
    borderRadius: 8,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTab: {
    backgroundColor: theme.colors.primary,
  },
  tabText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  activeTabText: {
    color: 'white',
    fontWeight: '600',
  },
  categoriesList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  categoryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  categoryInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  iconText: {
    fontSize: 20,
  },
  categoryDetails: {
    flex: 1,
  },
  categoryName: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  budgetLimit: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  categoryActions: {
    flexDirection: 'row',
    gap: 8,
  },
  editButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  editButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  deleteButton: {
    backgroundColor: theme.colors.error,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  deleteButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 24,
    textAlign: 'center',
  },
  replacementNote: { color: theme.colors.textSecondary, marginBottom: 8 },
  replacementList: { flexGrow: 0, marginTop: 8 },
  replacementOption: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
  },
  replacementSelected: { borderColor: theme.colors.primary },
  deleteError: { color: theme.colors.error, marginTop: 8 },
  confirmDeleteButton: { flex: 1, backgroundColor: theme.colors.error, borderRadius: 8, padding: 12 },
  disabled: { opacity: 0.5 },
  formGroup: {
    marginBottom: 16,
  },
  formRow: {
    flexDirection: 'row',
    gap: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  colorButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.border,
  },
  colorButtonText: {
    fontSize: 24,
    color: 'white',
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  iconButtonText: {
    fontSize: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: theme.colors.background,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cancelButtonText: {
    color: theme.colors.text,
    textAlign: 'center',
    fontWeight: '600',
  },
  saveButton: {
    flex: 1,
    backgroundColor: theme.colors.primary,
    padding: 12,
    borderRadius: 8,
  },
  saveButtonText: {
    color: 'white',
    textAlign: 'center',
    fontWeight: '600',
  },
  colorOption: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  colorSwatch: {
    width: 24,
    height: 24,
    borderRadius: 12,
    marginRight: 12,
  },
  colorValue: {
    fontSize: 14,
    color: theme.colors.text,
  },
});
