import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
} from "react-native";
import {
  getCategoryService,
  getAccountService,
  getTransactionService,
  getCardService,
} from "../database";
import { Category, Account, CreditCard, Transaction } from "../types";
import { useTheme } from "../context/ThemeContext";
import { useSettings } from "../context/SettingsContext";

interface AddTransactionScreenProps {
  visible: boolean;
  onClose: () => void;
  onTransactionAdded: () => void;
  transactionToEdit?: Transaction | null;
  loanForRepayment?: Account | null;
  initialType?: 'income' | 'expense' | 'transfer';
  initialFromAccount?: Account | null;
}

export default function AddTransactionScreen({
  visible,
  onClose,
  onTransactionAdded,
  transactionToEdit,
  loanForRepayment,
  initialType,
  initialFromAccount,
}: AddTransactionScreenProps) {
  const { theme } = useTheme();
  const { selectedProfileId } = useSettings();
  const styles = createStyles(theme);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"income" | "expense" | "transfer">("expense");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<
    "cash" | "credit_card" | "debit_card"
  >("credit_card");
  const [fromAccount, setFromAccount] = useState<number | undefined>(
    undefined,
  );
  const [cardId, setCardId] = useState<number | undefined>(undefined);
  const [cardsForAccount, setCardsForAccount] = useState<CreditCard[]>([]);
  const [toAccount, setToAccount] = useState<number | undefined>(undefined);
  const [priority, setPriority] = useState<"need" | "want" | undefined>(
    undefined,
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);

  const resetForm = useCallback((accounts: Account[], categories: Category[]) => {
    setAmount("");
    setDescription("");
    setType("expense");
    setPaymentMethod("credit_card");
    setDate(new Date().toISOString().split("T")[0]);
    setPriority(undefined);
    setToAccount(undefined);
    setCardId(undefined);

    const defaultCategory = categories.find(cat => cat.type === 'expense');
    setSelectedCategory(defaultCategory?.name || "");
    setFromAccount(accounts.length > 0 ? accounts[0].id : undefined);
  }, []);

  const loadDataAndSetState = useCallback(() => {
    const categoryService = getCategoryService();
    const allCategories = categoryService.getCategories();
    setCategories(allCategories);

    const accountService = getAccountService();
    const profileId = selectedProfileId === "all" ? undefined : selectedProfileId;
    const profileAccounts = accountService.getAccounts(profileId);
    setAccounts(profileAccounts);

    if (transactionToEdit) {
      setAmount(String(transactionToEdit.amount));
      setDescription(transactionToEdit.description || "");
      setType(transactionToEdit.type);
      setSelectedCategory(transactionToEdit.category);
      setPaymentMethod(transactionToEdit.paymentMethod);
      setFromAccount(transactionToEdit.accountId || undefined);
      setCardId(transactionToEdit.cardId || undefined);
      setPriority(transactionToEdit.priority || undefined);
      setDate(transactionToEdit.date);
      setToAccount(undefined);
    } else {
      resetForm(profileAccounts, allCategories);
      if (loanForRepayment) {
        setType('transfer');
        setDescription(`Repayment for: ${loanForRepayment.name}`);
        if (loanForRepayment.isLending) { // We are receiving money
          setFromAccount(loanForRepayment.id);
        } else { // We are paying money
          setToAccount(loanForRepayment.id);
        }
      } else if (initialFromAccount) {
        setType('transfer');
        setFromAccount(initialFromAccount.id);
      } else if (initialType) {
        setType(initialType);
      }
    }
  }, [selectedProfileId, transactionToEdit, loanForRepayment, initialType, initialFromAccount, resetForm]);

  useEffect(() => {
    if (visible) {
      loadDataAndSetState();
    }
  }, [visible, loadDataAndSetState]);

  // A credit card account that shares its balance across more than one physical card needs to
  // know which one this was charged to, so its own bill can be worked out separately.
  useEffect(() => {
    const account = accounts.find((acc) => acc.id === fromAccount);
    if (!fromAccount || account?.type !== 'credit_card') {
      setCardsForAccount([]);
      setCardId(undefined);
      return;
    }
    const cards = getCardService().getCardsForAccount(fromAccount);
    setCardsForAccount(cards);
    setCardId((current) => (current && cards.some((c) => c.id === current) ? current : undefined));
  }, [fromAccount, accounts]);

  const handleTypeChange = (newType: "income" | "expense" | "transfer") => {
    setType(newType);
    // Reset category selection when type changes
    const categoryForType = categories.find((cat) => cat.type === newType);
    setSelectedCategory(categoryForType?.name || "");

    // Reset priority for income transactions
    if (newType === "income" || newType === "transfer") {
      setPriority(undefined);
    }
  };

  const handleSubmit = () => {
    // Validation
    if (!amount || parseFloat(amount) <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }

    if (type !== 'transfer' && !selectedCategory) {
      Alert.alert("Error", "Please select a category");
      return;
    }

    // For expense transactions, priority is optional but recommended
    if (type === "expense" && !priority) {
      Alert.alert(
        "Priority Selection",
        "Would you like to classify this expense as a Need or Want? This helps with budgeting.",
        [
          { text: "Skip", style: "cancel", onPress: () => submitTransaction() },
          { text: "Select Priority", onPress: () => {} },
        ],
      );
      return;
    }

    submitTransaction();
  };

  const submitTransaction = () => {
    try {
      const transactionService = getTransactionService();

      if (type === 'transfer') {
        if (!fromAccount || !toAccount) {
          Alert.alert('Error', 'Please select both "From" and "To" accounts for a transfer.');
          return;
        }
        if (fromAccount === toAccount) {
          Alert.alert('Error', '"From" and "To" accounts cannot be the same.');
          return;
        }
        if (selectedProfileId === 'all') {
          Alert.alert('Error', 'Please select a specific profile to make a transfer.');
          return;
        }
        transactionService.addTransfer({
          fromAccountId: fromAccount,
          toAccountId: toAccount,
          amount: parseFloat(amount),
          date,
          description: description.trim() || 'Fund Transfer',
          profileId: selectedProfileId,
        });
      } else {
        const selectedAccountDetails = accounts.find(
          (acc) => acc.id === fromAccount,
        );
        if (!selectedAccountDetails) {
          Alert.alert("Error", "Please select a valid account.");
          return;
        }

        const profileIdToUse = selectedAccountDetails.profileId;

        const transactionData = {
          profileId: profileIdToUse,
          amount: parseFloat(amount),
          type,
          category: selectedCategory,
          description: description.trim() || null,
          date,
          paymentMethod,
          accountId: fromAccount,
          cardId: cardId ?? null,
          priority: type === "expense" ? priority : undefined,
        };

        if (transactionToEdit) {
          transactionService.updateTransaction(
            transactionToEdit.id,
            transactionData,
          );
        } else {
          transactionService.addTransaction(transactionData);
        }
      }

      onTransactionAdded();
    } catch (error) {
      console.error("Error adding transaction:", error);
      Alert.alert("Error", "Failed to add transaction. Please try again.", [
        { text: "OK" },
      ]);
    }
  };

  const getFilteredCategories = () => {
    return categories.filter(
      (cat) => cat.type === type && !cat.name.startsWith("Transfer"),
    );
  };

  const getAccountTypeEmoji = (type: Account["type"]) => {
    const emojiMap = {
      savings: "🏦",
      checking: "💳",
      credit_card: "💰",
      loan: "🏠",
      investment: "📈",
      cash: "💵",
    };
    return emojiMap[type] || "💰";
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
          <Text style={styles.headerTitle}>
            {transactionToEdit ? "Edit" : "Add"} Transaction
          </Text>
          <TouchableOpacity onPress={handleSubmit} style={styles.saveButton}>
            <Text style={styles.saveButtonText}>
              {transactionToEdit ? "Update" : "Save"}
            </Text>
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
                  type === "expense" && styles.typeButtonActive,
                ]}
                onPress={() => handleTypeChange("expense")}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    type === "expense" && styles.typeButtonTextActive,
                  ]}
                >
                  Expense
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  type === "income" && styles.typeButtonActive,
                ]}
                onPress={() => handleTypeChange("income")}
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    type === "income" && styles.typeButtonTextActive,
                  ]}
                >
                  Income
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.typeButton,
                  type === "transfer" && styles.typeButtonActive,
                ]}
                onPress={() => handleTypeChange("transfer")}
                disabled={!!transactionToEdit} // Disable for edits
              >
                <Text
                  style={[
                    styles.typeButtonText,
                    type === "transfer" && styles.typeButtonTextActive,
                    !!transactionToEdit && { color: theme.colors.disabled },
                  ]}
                >
                  Transfer
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Category Selector */}
          <View style={styles.section}>
            {type !== 'transfer' && (<>
            <Text style={styles.sectionTitle}>Category & Description</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScrollContent}
            >
              {getFilteredCategories().map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryItemCompact,
                    selectedCategory === category.name &&
                      styles.categoryItemCompactActive,
                  ]}
                  onPress={() => setSelectedCategory(category.name)}
                >
                  <Text style={styles.categoryEmojiCompact}>
                    {category.icon}
                  </Text>
                  <Text
                    style={[
                      styles.categoryNameCompact,
                      selectedCategory === category.name &&
                        styles.categoryNameCompactActive,
                    ]}
                  >
                    {category.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
            <TextInput
              style={[styles.textInput, { marginTop: 16 }]}
              value={description}
              onChangeText={setDescription}
              placeholder="Add a note (optional)"
              placeholderTextColor={theme.colors.textSecondary}
            />
            </>)}
          </View>

          {/* Account Selector */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>{type === 'transfer' ? 'From Account' : 'Account'}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScrollContent}
            >
              {accounts.map((account) => (
                <TouchableOpacity
                  key={account.id}
                  style={[
                    styles.categoryItemCompact,
                    fromAccount === account.id &&
                      styles.categoryItemCompactActive,
                  ]}
                  onPress={() => setFromAccount(account.id)}
                >
                  <Text style={styles.categoryEmojiCompact}>
                    {getAccountTypeEmoji(account.type)}
                  </Text>
                  <Text
                    style={[
                      styles.categoryNameCompact,
                      fromAccount === account.id &&
                        styles.categoryNameCompactActive,
                    ]}
                  >
                    {account.bankName
                      ? `${account.name} (${account.bankName})`
                      : account.name}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {type !== 'transfer' && cardsForAccount.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Card</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScrollContent}
              >
                {[{ id: undefined, name: 'Unassigned' }, ...cardsForAccount].map((card) => (
                  <TouchableOpacity
                    key={card.id ?? 'unassigned'}
                    style={[
                      styles.categoryItemCompact,
                      cardId === card.id && styles.categoryItemCompactActive,
                    ]}
                    onPress={() => setCardId(card.id)}
                  >
                    <Text
                      style={[
                        styles.categoryNameCompact,
                        cardId === card.id && styles.categoryNameCompactActive,
                      ]}
                    >
                      {card.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {type === 'transfer' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>To Account</Text>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.categoryScrollContent}
              >
                {accounts.filter(acc => acc.id !== fromAccount).map((account) => (
                  <TouchableOpacity
                    key={account.id}
                    style={[
                      styles.categoryItemCompact,
                      toAccount === account.id &&
                        styles.categoryItemCompactActive,
                    ]}
                    onPress={() => setToAccount(account.id)}
                  >
                    <Text style={styles.categoryEmojiCompact}>
                      {getAccountTypeEmoji(account.type)}
                    </Text>
                    <Text
                      style={[
                        styles.categoryNameCompact,
                        toAccount === account.id &&
                          styles.categoryNameCompactActive,
                      ]}
                    >
                      {account.bankName ? `${account.name} (${account.bankName})` : account.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Payment Method & Priority (Combined) */}
          {type !== 'transfer' && <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {type === "expense" ? "Payment & Priority" : "Payment Method"}
            </Text>

            {/* Compact Payment Method Selector */}
            <View style={styles.compactRow}>
              <Text style={styles.compactLabel}>Method:</Text>
              <View style={styles.compactSelector}>
                {[
                  { value: "cash", emoji: "💵" },
                  { value: "credit_card", emoji: "💳" },
                  { value: "debit_card", emoji: "🏧" },
                ].map((method) => (
                  <TouchableOpacity
                    key={method.value}
                    style={[
                      styles.compactButton,
                      paymentMethod === method.value &&
                        styles.compactButtonActive,
                    ]}
                    onPress={() => setPaymentMethod(method.value as any)}
                  >
                    <Text style={styles.compactEmoji}>{method.emoji}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Compact Priority Selector (for expenses only) */}
            {type === "expense" && (
              <View style={styles.compactRow}>
                <Text style={styles.compactLabel}>Priority:</Text>
                <View style={styles.compactSelector}>
                  <TouchableOpacity
                    style={[
                      styles.compactButton,
                      priority === "need" && styles.compactButtonActive,
                    ]}
                    onPress={() =>
                      setPriority(priority === "need" ? undefined : "need")
                    }
                  >
                    <Text style={styles.compactEmoji}>🎯</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.compactButton,
                      priority === "want" && styles.compactButtonActive,
                    ]}
                    onPress={() =>
                      setPriority(priority === "want" ? undefined : "want")
                    }
                  >
                    <Text style={styles.compactEmoji}>✨</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.compactButton,
                      !priority && styles.compactButtonActive,
                    ]}
                    onPress={() => setPriority(undefined)}
                  >
                    <Text style={styles.compactText}>Skip</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>}

          {/* Date */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date</Text>
            <TextInput
              style={styles.textInput}
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

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
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
      fontWeight: "600",
      color: theme.colors.text,
    },
    saveButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
    },
    saveButtonText: {
      color: "#fff",
      fontSize: 16,
      fontWeight: "600",
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
      fontWeight: "600",
      color: theme.colors.text,
      marginBottom: 12,
    },
    amountInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      fontSize: 24,
      fontWeight: "bold",
      textAlign: "center",
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
    },
    typeSelector: {
      flexDirection: "row",
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 4,
    },
    typeButton: {
      flex: 1,
      paddingVertical: 12,
      alignItems: "center",
      borderRadius: 8,
    },
    typeButtonActive: {
      backgroundColor: theme.colors.primary,
    },
    typeButtonText: {
      color: theme.colors.textSecondary,
      fontWeight: "500",
    },
    typeButtonTextActive: {
      color: "#fff",
    },
    categoryGrid: {
      flexDirection: "row",
      paddingVertical: 8,
    },
    categoryItem: {
      alignItems: "center",
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
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 8,
    },
    categoryEmoji: {
      fontSize: 20,
      color: theme.colors.text,
    },
    categoryName: {
      fontSize: 12,
      textAlign: "center",
      color: theme.colors.text,
    },
    paymentGrid: {
      flexDirection: "row",
      justifyContent: "space-between",
    },
    paymentItem: {
      flex: 1,
      alignItems: "center",
      padding: 16,
      marginHorizontal: 4,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: "transparent",
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
      textAlign: "center",
    },
    descriptionInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      textAlignVertical: "top",
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
      flexDirection: "row",
      justifyContent: "space-between",
      marginBottom: 16,
    },
    priorityItem: {
      flex: 1,
      alignItems: "center",
      padding: 16,
      marginHorizontal: 4,
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: "transparent",
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
      fontWeight: "600",
      color: theme.colors.text,
      textAlign: "center",
      marginBottom: 4,
    },
    priorityDescription: {
      fontSize: 10,
      color: theme.colors.textSecondary,
      textAlign: "center",
    },
    clearPriorityButton: {
      alignSelf: "center",
      paddingVertical: 8,
      paddingHorizontal: 16,
    },
    clearPriorityText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textDecorationLine: "underline",
    },
    // Compact UI styles
    compactRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: 16,
      paddingHorizontal: 4,
    },
    compactLabel: {
      fontSize: 14,
      fontWeight: "500",
      color: theme.colors.text,
      flex: 1,
    },
    compactSelector: {
      flexDirection: "row",
      backgroundColor: theme.colors.surface,
      borderRadius: 8,
      padding: 2,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    compactButton: {
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginHorizontal: 2,
      borderRadius: 6,
      minWidth: 44,
      alignItems: "center",
      justifyContent: "center",
    },
    compactButtonActive: {
      backgroundColor: theme.colors.primary,
    },
    compactEmoji: {
      fontSize: 16,
    },
    compactText: {
      fontSize: 12,
      color: theme.colors.text,
      fontWeight: "500",
    },
    // Compact category styles
    categoryScrollContent: {
      paddingVertical: 8,
      paddingHorizontal: 4,
    },
    categoryItemCompact: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 12,
      marginRight: 8,
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    categoryItemCompactActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    categoryEmojiCompact: {
      fontSize: 16,
      marginRight: 6,
    },
    categoryNameCompact: {
      fontSize: 12,
      color: theme.colors.text,
      fontWeight: "500",
    },
    categoryNameCompactActive: {
      color: "#fff",
    },
  });
