import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  SafeAreaView,
} from "react-native";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { getBudgetService } from "../database";
import { BudgetWithCategory } from "../types";
import { useTheme } from "../context/ThemeContext";
import { useSettings } from "../context/SettingsContext";
import AddEditBudgetModal from "./AddEditBudgetModal";

interface ManageBudgetsScreenProps {
  visible: boolean;
  onClose: () => void;
}

export default function ManageBudgetsScreen({
  visible,
  onClose,
}: ManageBudgetsScreenProps) {
  const { theme } = useTheme();
  const { formatCurrency } = useSettings();
  const styles = createStyles(theme);
  const [budgets, setBudgets] = useState<BudgetWithCategory[]>([]);
  const [showAddEditModal, setShowAddEditModal] = useState(false);
  const [budgetToEdit, setBudgetToEdit] = useState<BudgetWithCategory | null>(
    null,
  );

  const loadBudgets = useCallback(() => {
    if (visible) {
      const budgetService = getBudgetService();
      setBudgets(budgetService.getBudgets());
    }
  }, [visible]);

  useEffect(loadBudgets, [loadBudgets]);

  const handleAddBudget = () => {
    setBudgetToEdit(null);
    setShowAddEditModal(true);
  };

  const handleEditBudget = (budget: BudgetWithCategory) => {
    setBudgetToEdit(budget);
    setShowAddEditModal(true);
  };

  const handleDeleteBudget = (id: number) => {
    Alert.alert(
      "Delete Budget",
      "Are you sure you want to delete this budget?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const budgetService = getBudgetService();
            budgetService.deleteBudget(id);
            loadBudgets();
          },
        },
      ],
    );
  };

  const handleSave = () => {
    setShowAddEditModal(false);
    loadBudgets();
  };

  const renderItem = ({ item }: { item: BudgetWithCategory }) => (
    <View style={styles.budgetItem}>
      <View
        style={[
          styles.iconContainer,
          { backgroundColor: `${item.categoryColor}20` },
        ]}
      >
        <Text style={styles.iconEmoji}>{item.categoryIcon}</Text>
      </View>
      <View style={styles.budgetInfo}>
        <Text style={styles.categoryName}>{item.categoryName}</Text>
        <Text style={styles.budgetAmount}>
          {formatCurrency(item.amount)} / month
        </Text>
      </View>
      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEditBudget(item)}
        >
          <MaterialCommunityIcons
            name="pencil"
            size={24}
            color={theme.colors.textSecondary}
          />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleDeleteBudget(item.id)}
        >
          <MaterialCommunityIcons
            name="delete"
            size={24}
            color={theme.colors.error}
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Manage Budgets</Text>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons
              name="close"
              size={24}
              color={theme.colors.text}
            />
          </TouchableOpacity>
        </View>
        <FlatList
          data={budgets}
          renderItem={renderItem}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>
                No budgets set. Tap the '+' button to add one.
              </Text>
            </View>
          }
        />
        <TouchableOpacity style={styles.fab} onPress={handleAddBudget}>
          <MaterialCommunityIcons name="plus" size={32} color="#fff" />
        </TouchableOpacity>
      </SafeAreaView>
      <AddEditBudgetModal
        visible={showAddEditModal}
        onClose={() => setShowAddEditModal(false)}
        onSave={handleSave}
        budgetToEdit={budgetToEdit}
      />
    </Modal>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 16,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: { fontSize: 20, fontWeight: "bold", color: theme.colors.text },
    listContainer: { padding: 16 },
    budgetItem: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
    },
    iconContainer: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: "center",
      justifyContent: "center",
      marginRight: 16,
    },
    iconEmoji: { fontSize: 24 },
    budgetInfo: { flex: 1 },
    categoryName: { fontSize: 16, fontWeight: "600", color: theme.colors.text },
    budgetAmount: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    actions: { flexDirection: "row" },
    actionButton: { padding: 8 },
    fab: {
      position: "absolute",
      right: 24,
      bottom: 24,
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: theme.colors.primary,
      alignItems: "center",
      justifyContent: "center",
      elevation: 8,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      marginTop: 50,
    },
    emptyText: { fontSize: 16, color: theme.colors.textSecondary },
  });
