import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Alert,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { getBudgetService, getCategoryService } from "../database";
import { BudgetWithCategory, Category } from "../types";
import OptionSelector from "./OptionSelector";

interface AddEditBudgetModalProps {
  visible: boolean;
  onClose: () => void;
  onSave: () => void;
  budgetToEdit?: BudgetWithCategory | null;
}

export default function AddEditBudgetModal({
  visible,
  onClose,
  onSave,
  budgetToEdit,
}: AddEditBudgetModalProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [amount, setAmount] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<
    number | undefined
  >();
  const [categories, setCategories] = useState<Category[]>([]);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);

  useEffect(() => {
    if (visible) {
      const categoryService = getCategoryService();
      const expenseCategories = categoryService.getCategoriesByType("expense");
      setCategories(expenseCategories);

      if (budgetToEdit) {
        setAmount(budgetToEdit.amount.toString());
        setSelectedCategoryId(budgetToEdit.categoryId);
      } else {
        setAmount("");
        setSelectedCategoryId(undefined);
      }
    }
  }, [visible, budgetToEdit]);

  const handleSave = () => {
    if (!selectedCategoryId) {
      Alert.alert("Error", "Please select a category.");
      return;
    }
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert("Error", "Please enter a valid budget amount.");
      return;
    }

    const budgetService = getBudgetService();
    const budgetData = {
      categoryId: selectedCategoryId,
      amount: parseFloat(amount),
      period: "monthly" as const,
      // start/end dates will be set by the service for monthly budgets
      startDate: "",
      endDate: "",
    };

    try {
      if (budgetToEdit) {
        budgetService.updateBudget(budgetToEdit.id, {
          amount: budgetData.amount,
        });
      } else {
        budgetService.addBudget(budgetData);
      }
      onSave();
    } catch (error) {
      console.error("Error saving budget:", error);
      Alert.alert("Error", "Failed to save budget.");
    }
  };

  const categoryOptions = categories.map((c) => ({
    label: c.name,
    value: c.id.toString(),
  }));

  const selectedCategoryName =
    categories.find((c) => c.id === selectedCategoryId)?.name ||
    "Select Category";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>
            {budgetToEdit ? "Edit Budget" : "Add Budget"}
          </Text>

          <Text style={styles.label}>Category</Text>
          <TouchableOpacity
            style={styles.selectorButton}
            onPress={() => setShowCategoryPicker(true)}
            disabled={!!budgetToEdit}
          >
            <Text style={styles.selectorText}>{selectedCategoryName}</Text>
          </TouchableOpacity>

          <Text style={styles.label}>Monthly Amount</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleSave}
            >
              <Text style={[styles.buttonText, { color: "#fff" }]}>Save</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <OptionSelector
        visible={showCategoryPicker}
        onClose={() => setShowCategoryPicker(false)}
        title="Select Category"
        options={categoryOptions}
        selectedValue={selectedCategoryId?.toString()}
        onSelect={(value) => {
          setSelectedCategoryId(parseInt(value, 10));
          setShowCategoryPicker(false);
        }}
      />
    </Modal>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    modalOverlay: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: "rgba(0,0,0,0.5)",
    },
    modalContainer: {
      width: "90%",
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 24,
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: theme.colors.text,
      marginBottom: 24,
      textAlign: "center",
    },
    label: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
    selectorButton: {
      backgroundColor: theme.colors.background,
      padding: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 16,
    },
    selectorText: { color: theme.colors.text, fontSize: 16 },
    input: {
      backgroundColor: theme.colors.background,
      color: theme.colors.text,
      padding: 16,
      borderRadius: 8,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      marginBottom: 16,
    },
    buttonContainer: {
      flexDirection: "row",
      justifyContent: "space-between",
      marginTop: 16,
    },
    button: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 8,
      alignItems: "center",
    },
    cancelButton: { backgroundColor: theme.colors.card, marginRight: 8 },
    saveButton: { backgroundColor: theme.colors.primary, marginLeft: 8 },
    buttonText: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
  });
