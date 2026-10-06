import React, { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  Platform,
  Keyboard,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AmountKeypad, { evaluateAmount, hasOperator } from "../AmountKeypad";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import {
  getCategoryService,
  getAccountService,
  getTransactionService,
  getCardService,
  getSettingsService,
} from "../../database";
import { Category, Account, CreditCard, Transaction } from "../../types";
import { useTheme } from "../../context/ThemeContext";
import { useSettings } from "../../context/SettingsContext";
import { isValidDate } from "../../utils/loanMath";

type PaymentMethod = "cash" | "credit_card" | "debit_card";

const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "cash", label: "💵 Cash" },
  { value: "credit_card", label: "💳 Credit card" },
  { value: "debit_card", label: "🏧 Debit card" },
];

/** YYYY-MM-DD in the device's own timezone (toISOString would give the UTC day). */
function toLocalDateString(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function todayString(): string {
  return toLocalDateString(new Date());
}

function shiftDate(date: string, days: number): string {
  const base = parseLocalDate(date);
  base.setDate(base.getDate() + days);
  return toLocalDateString(base);
}

function parseLocalDate(date: string): Date {
  return isValidDate(date) ? new Date(`${date}T00:00:00`) : new Date();
}

function formatLongDate(date: string): string {
  return parseLocalDate(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function relativeDayLabel(date: string): string | null {
  const today = todayString();
  if (date === today) return "Today";
  if (date === shiftDate(today, -1)) return "Yesterday";
  if (date === shiftDate(today, 1)) return "Tomorrow";
  return null;
}

// New transactions start from whatever was last saved, so repeat entries need fewer taps.
const LAST_ACCOUNT_KEY = "addTransaction.lastAccountId";
const lastCategoryKey = (type: "income" | "expense") => `addTransaction.lastCategory.${type}`;

// Categories are ordered by how often they were used in this window, and only the top few are
// shown until the user asks for the rest.
const CATEGORY_USAGE_DAYS = 90;
const TOP_CATEGORY_COUNT = 8;

function defaultAccount(accounts: Account[]): Account | undefined {
  const lastId = Number(getSettingsService().getSetting(LAST_ACCOUNT_KEY));
  return accounts.find((acc) => acc.id === lastId) ?? accounts[0];
}

function defaultCategory(type: "income" | "expense" | "transfer", categories: Category[]): string {
  if (type === "transfer") return "";
  const last = getSettingsService().getSetting(lastCategoryKey(type));
  const match = categories.find((cat) => cat.type === type && cat.name === last);
  return (match ?? categories.find((cat) => cat.type === type))?.name || "";
}

/** The payment method an account most likely implies, so the user rarely has to pick one. */
function paymentMethodForAccount(account?: Account): PaymentMethod {
  if (account?.type === "credit_card") return "credit_card";
  if (account?.type === "cash") return "cash";
  return "debit_card";
}

/**
 * A horizontal row of chips that scrolls the selected one into view, so a preselected chip
 * (e.g. the last used account) isn't left hidden off the edge of the row.
 */
function ChipScrollRow({
  activeIndex,
  contentContainerStyle,
  children,
}: {
  activeIndex: number;
  contentContainerStyle: any;
  children: React.ReactNode;
}) {
  const scrollRef = useRef<ScrollView>(null);
  const chipLayouts = useRef<Record<number, { x: number; width: number }>>({});
  const viewportWidth = useRef(0);
  const scrollX = useRef(0);
  const [layoutVersion, setLayoutVersion] = useState(0);

  useEffect(() => {
    const chip = chipLayouts.current[activeIndex];
    const width = viewportWidth.current;
    if (activeIndex < 0 || !chip || !width) return;
    const fullyVisible = chip.x >= scrollX.current && chip.x + chip.width <= scrollX.current + width;
    if (fullyVisible) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, chip.x - (width - chip.width) / 2), animated: true });
  }, [activeIndex, layoutVersion]);

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScroll={(e) => {
        scrollX.current = e.nativeEvent.contentOffset.x;
      }}
      onLayout={(e) => {
        viewportWidth.current = e.nativeEvent.layout.width;
        setLayoutVersion((v) => v + 1);
      }}
    >
      {React.Children.toArray(children).map((child, index) => (
        <View
          key={(child as React.ReactElement).key ?? index}
          onLayout={(e) => {
            const { x, width } = e.nativeEvent.layout;
            chipLayouts.current[index] = { x, width };
            if (index === activeIndex) setLayoutVersion((v) => v + 1);
          }}
        >
          {child}
        </View>
      ))}
    </ScrollView>
  );
}

/** Values to start a fresh (non-edit) form with, e.g. from a matched statement line item. */
interface TransactionPrefill {
  amount?: number;
  description?: string;
  date?: string;
  type?: 'income' | 'expense';
  accountId?: number;
}

interface AddTransactionModalProps {
  visible: boolean;
  onClose: () => void;
  onTransactionAdded: () => void;
  transactionToEdit?: Transaction | null;
  loanForRepayment?: Account | null;
  initialType?: 'income' | 'expense' | 'transfer';
  initialFromAccount?: Account | null;
  prefill?: TransactionPrefill | null;
}

export default function AddTransactionModal({
  visible,
  onClose,
  onTransactionAdded,
  transactionToEdit,
  loanForRepayment,
  initialType,
  initialFromAccount,
  prefill,
}: AddTransactionModalProps) {
  const { theme } = useTheme();
  const { selectedProfileId, formatCurrency } = useSettings();
  const insets = useSafeAreaInsets();
  const styles = createStyles(theme);
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState<"income" | "expense" | "transfer">("expense");
  const [selectedCategory, setSelectedCategory] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("credit_card");
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
  const [date, setDate] = useState(todayString());
  const [showMore, setShowMore] = useState(false);
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [keypadVisible, setKeypadVisible] = useState(true);

  const resetForm = useCallback((accounts: Account[], categories: Category[]) => {
    setAmount("");
    setDescription("");
    setType("expense");
    setDate(todayString());
    setPriority(undefined);
    setToAccount(undefined);
    setCardId(undefined);
    setShowMore(false);
    setShowAllCategories(false);
    setShowDatePicker(false);

    setSelectedCategory(defaultCategory("expense", categories));
    const account = defaultAccount(accounts);
    setFromAccount(account?.id);
    setPaymentMethod(paymentMethodForAccount(account));
  }, []);

  const loadDataAndSetState = useCallback(() => {
    const categoryService = getCategoryService();
    const allCategories = categoryService.getCategories();
    setCategories(allCategories);

    const accountService = getAccountService();
    const profileId = selectedProfileId === "all" ? undefined : selectedProfileId;
    const profileAccounts = accountService.getAccounts(profileId);
    setAccounts(profileAccounts);
    setKeypadVisible(!transactionToEdit);

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
      setShowMore(!!transactionToEdit.priority);
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
        setSelectedCategory(defaultCategory(initialType, allCategories));
      } else if (prefill) {
        if (prefill.type) {
          setType(prefill.type);
          setSelectedCategory(defaultCategory(prefill.type, allCategories));
        }
        if (prefill.amount !== undefined) setAmount(String(prefill.amount));
        if (prefill.description !== undefined) setDescription(prefill.description);
        if (prefill.date) setDate(prefill.date);
        if (prefill.accountId !== undefined) {
          setFromAccount(prefill.accountId);
          setPaymentMethod(paymentMethodForAccount(profileAccounts.find((acc) => acc.id === prefill.accountId)));
        }
      }
    }
  }, [selectedProfileId, transactionToEdit, loanForRepayment, initialType, initialFromAccount, prefill, resetForm]);

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
    setSelectedCategory(defaultCategory(newType, categories));
    setShowAllCategories(false);

    // Reset priority for income transactions
    if (newType === "income" || newType === "transfer") {
      setPriority(undefined);
    }
  };

  const handleSubmit = () => {
    // Validation
    const total = evaluateAmount(amount);
    if (isNaN(total) || total <= 0) {
      Alert.alert("Error", "Please enter a valid amount");
      return;
    }

    if (type !== 'transfer' && !selectedCategory) {
      Alert.alert("Error", "Please select a category");
      return;
    }

    if (!isValidDate(date)) {
      Alert.alert("Error", "Please enter the date as YYYY-MM-DD");
      return;
    }

    submitTransaction();
  };

  const submitTransaction = () => {
    try {
      const transactionService = getTransactionService();
      const total = evaluateAmount(amount);

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
          amount: total,
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
          amount: total,
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
          getSettingsService().setSettings({
            [LAST_ACCOUNT_KEY]: String(fromAccount),
            [lastCategoryKey(type)]: selectedCategory,
          });
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

  // Most-used categories first (over the last few months), so the usual picks are up front.
  const sortedCategories = useMemo(() => {
    if (type === "transfer") return [];
    const since = shiftDate(todayString(), -CATEGORY_USAGE_DAYS);
    const usage = visible ? getTransactionService().getCategoryUsage(type, since) : {};
    return categories
      .filter((cat) => cat.type === type && !cat.name.startsWith("Transfer"))
      .map((cat, index) => ({ cat, index, uses: usage[cat.name] ?? 0 }))
      .sort((a, b) => b.uses - a.uses || a.index - b.index)
      .map(({ cat }) => cat);
  }, [categories, type, visible]);

  // Only the top few show until expanded; the selected one is always among them.
  const visibleCategories = useMemo(() => {
    if (showAllCategories || sortedCategories.length <= TOP_CATEGORY_COUNT + 1) return sortedCategories;
    const top = sortedCategories.slice(0, TOP_CATEGORY_COUNT);
    const selected = sortedCategories.find((cat) => cat.name === selectedCategory);
    return selected && !top.includes(selected) ? [...top.slice(0, -1), selected] : top;
  }, [sortedCategories, showAllCategories, selectedCategory]);

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


  const accountLabel = (account: Account) =>
    account.bankName ? `${account.name} (${account.bankName})` : account.name;

  const selectAccount = (account: Account) => {
    setFromAccount(account.id);
    setPaymentMethod(paymentMethodForAccount(account));
  };

  // Android shows the picker as a one-shot dialog; iOS keeps it inline until toggled closed.
  const handleDatePicked = (event: DateTimePickerEvent, picked?: Date) => {
    if (Platform.OS === "android") setShowDatePicker(false);
    if (event.type === "set" && picked) setDate(toLocalDateString(picked));
  };

  const enteredTotal = evaluateAmount(amount);
  const saveLabel = [
    transactionToEdit ? "Update" : "Save",
    type,
    enteredTotal > 0 ? `· ${formatCurrency(enteredTotal)}` : "",
  ].join(" ").trim();

  const typeColor = (t: typeof type) =>
    t === "expense" ? theme.colors.error : t === "income" ? theme.colors.success : theme.colors.primary;

  const renderChip = (
    key: string | number,
    label: string,
    active: boolean,
    onPress: () => void,
    emoji?: string,
  ) => (
    <TouchableOpacity
      key={key}
      style={[styles.chip, active && styles.chipActive]}
      onPress={onPress}
    >
      {emoji ? <Text style={styles.chipEmoji}>{emoji}</Text> : null}
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );

  const renderChipRow = (activeIndex: number, children: React.ReactNode) => (
    <ChipScrollRow activeIndex={activeIndex} contentContainerStyle={styles.chipRow}>
      {children}
    </ChipScrollRow>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.closeButton} hitSlop={12}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {transactionToEdit ? "Edit" : "Add"} Transaction
          </Text>
          <View style={styles.closeButton} />
        </View>

        <ScrollView
          style={styles.content}
          contentContainerStyle={styles.contentInner}
          keyboardShouldPersistTaps="handled"
        >
          {/* Type */}
          <View style={styles.typeSelector}>
            {(["expense", "income", "transfer"] as const).map((t) => {
              const active = type === t;
              const disabled = t === "transfer" && !!transactionToEdit;
              return (
                <TouchableOpacity
                  key={t}
                  style={[
                    styles.typeButton,
                    active && { backgroundColor: typeColor(t) },
                    disabled && styles.disabled,
                  ]}
                  onPress={() => handleTypeChange(t)}
                  disabled={disabled}
                >
                  <Text style={[styles.typeButtonText, active && styles.typeButtonTextActive]}>
                    {t === "expense" ? "Expense" : t === "income" ? "Income" : "Transfer"}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Amount: typed on AmountKeypad so + and − work on every platform */}
          <TouchableOpacity
            style={[styles.amountBox, keypadVisible && { borderColor: typeColor(type) }]}
            onPress={() => {
              Keyboard.dismiss();
              setShowDatePicker(false);
              setKeypadVisible(true);
            }}
          >
            <Text
              style={[styles.amountText, { color: amount ? typeColor(type) : theme.colors.textSecondary }]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {amount || "0"}
            </Text>
            {hasOperator(amount) && !isNaN(evaluateAmount(amount)) && (
              <Text style={styles.amountResult}>= {formatCurrency(evaluateAmount(amount))}</Text>
            )}
          </TouchableOpacity>

          {/* Category */}
          {type !== "transfer" && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Category</Text>
              <View style={styles.chipWrap}>
                {visibleCategories.map((category) =>
                  renderChip(
                    category.id,
                    category.name,
                    selectedCategory === category.name,
                    () => {
                      setSelectedCategory(category.name);
                      setShowAllCategories(false);
                    },
                    category.icon,
                  ),
                )}
                {sortedCategories.length > visibleCategories.length || showAllCategories
                  ? renderChip(
                      "more",
                      showAllCategories ? "Less ▴" : `+${sortedCategories.length - visibleCategories.length} more`,
                      false,
                      () => setShowAllCategories((v) => !v),
                    )
                  : null}
              </View>
            </View>
          )}

          {/* Account */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {type === "transfer" ? "From" : type === "income" ? "Received in" : "Paid from"}
            </Text>
            {renderChipRow(
              accounts.findIndex((account) => account.id === fromAccount),
              accounts.map((account) =>
                renderChip(
                  account.id,
                  accountLabel(account),
                  fromAccount === account.id,
                  () => selectAccount(account),
                  getAccountTypeEmoji(account.type),
                ),
              ),
            )}
          </View>

          {type !== "transfer" && cardsForAccount.length > 0 && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Card</Text>
              {renderChipRow(
                cardId === undefined ? 0 : cardsForAccount.findIndex((card) => card.id === cardId) + 1,
                [{ id: undefined, name: "Unassigned" }, ...cardsForAccount].map((card) =>
                  renderChip(card.id ?? "unassigned", card.name, cardId === card.id, () => setCardId(card.id)),
                ),
              )}
            </View>
          )}

          {type === "transfer" && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>To</Text>
              {renderChipRow(
                accounts
                  .filter((acc) => acc.id !== fromAccount)
                  .findIndex((account) => account.id === toAccount),
                accounts
                  .filter((acc) => acc.id !== fromAccount)
                  .map((account) =>
                    renderChip(
                      account.id,
                      accountLabel(account),
                      toAccount === account.id,
                      () => setToAccount(account.id),
                      getAccountTypeEmoji(account.type),
                    ),
                  ),
              )}
            </View>
          )}

          {/* Date */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Date</Text>
            <View style={styles.dateRow}>
              <TouchableOpacity style={styles.dateStep} onPress={() => setDate(shiftDate(date, -1))}>
                <Text style={styles.dateStepText}>‹</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.dateCenter}
                onPress={() => {
                  setKeypadVisible(false);
                  setShowDatePicker((v) => !v);
                }}
              >
                <Text style={styles.dateText}>📅 {formatLongDate(date)}</Text>
                {relativeDayLabel(date) && (
                  <Text style={styles.dateCaption}>{relativeDayLabel(date)}</Text>
                )}
              </TouchableOpacity>
              <TouchableOpacity style={styles.dateStep} onPress={() => setDate(shiftDate(date, 1))}>
                <Text style={styles.dateStepText}>›</Text>
              </TouchableOpacity>
            </View>
            {showDatePicker && (
              <DateTimePicker
                value={parseLocalDate(date)}
                mode="date"
                display={Platform.OS === "ios" ? "inline" : "default"}
                onChange={handleDatePicked}
                themeVariant={theme.isDark ? "dark" : "light"}
                accentColor={theme.colors.primary}
              />
            )}
          </View>

          {/* Note */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Note</Text>
            <TextInput
              style={styles.textInput}
              value={description}
              onChangeText={setDescription}
              onFocus={() => setKeypadVisible(false)}
              placeholder={type === "transfer" ? "Fund Transfer" : "Optional"}
              placeholderTextColor={theme.colors.textSecondary}
            />
          </View>

          {/* Less common fields */}
          {type !== "transfer" && (
            <View style={styles.section}>
              <TouchableOpacity onPress={() => setShowMore((v) => !v)} style={styles.moreToggle}>
                <Text style={styles.moreToggleText}>
                  {showMore ? "Hide options ▴" : "More options ▾"}
                </Text>
              </TouchableOpacity>

              {showMore && (
                <>
                  <Text style={styles.subTitle}>Payment method</Text>
                  <View style={styles.chipWrap}>
                    {PAYMENT_METHODS.map((method) =>
                      renderChip(method.value, method.label, paymentMethod === method.value, () =>
                        setPaymentMethod(method.value),
                      ),
                    )}
                  </View>

                  {type === "expense" && (
                    <>
                      <Text style={styles.subTitle}>Need or want?</Text>
                      <View style={styles.chipWrap}>
                        {renderChip("need", "🎯 Need", priority === "need", () =>
                          setPriority(priority === "need" ? undefined : "need"),
                        )}
                        {renderChip("want", "✨ Want", priority === "want", () =>
                          setPriority(priority === "want" ? undefined : "want"),
                        )}
                      </View>
                    </>
                  )}
                </>
              )}
            </View>
          )}
        </ScrollView>

        {keypadVisible && (
          <AmountKeypad value={amount} onChange={setAmount} onDone={() => setKeypadVisible(false)} />
        )}

        {/* Save sits at the bottom, within thumb reach on large phones */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={[styles.saveButton, { backgroundColor: typeColor(type) }]}
            onPress={handleSubmit}
          >
            <Text style={styles.saveButtonText}>{saveLabel}</Text>
          </TouchableOpacity>
        </View>
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
    closeButton: {
      width: 32,
      alignItems: "center",
    },
    closeButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 20,
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: theme.colors.text,
    },
    footer: {
      paddingHorizontal: 16,
      paddingTop: 10,
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
    },
    saveButton: {
      paddingVertical: 16,
      borderRadius: 14,
      alignItems: "center",
    },
    saveButtonText: {
      color: "#fff",
      fontSize: 17,
      fontWeight: "700",
      textTransform: "capitalize",
    },
    content: {
      flex: 1,
      paddingHorizontal: 16,
    },
    contentInner: {
      paddingTop: 16,
      paddingBottom: 48,
    },
    section: {
      marginTop: 20,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: theme.colors.textSecondary,
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 8,
    },
    subTitle: {
      fontSize: 14,
      fontWeight: "500",
      color: theme.colors.text,
      marginTop: 12,
      marginBottom: 8,
    },
    typeSelector: {
      flexDirection: "row",
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 4,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    typeButton: {
      flex: 1,
      paddingVertical: 10,
      alignItems: "center",
      borderRadius: 8,
    },
    typeButtonText: {
      color: theme.colors.textSecondary,
      fontWeight: "600",
    },
    typeButtonTextActive: {
      color: "#fff",
    },
    disabled: {
      opacity: 0.4,
    },
    amountBox: {
      marginTop: 16,
      paddingVertical: 10,
      paddingHorizontal: 16,
      alignItems: "center",
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: "transparent",
    },
    amountText: {
      fontSize: 40,
      fontWeight: "bold",
    },
    amountResult: {
      fontSize: 15,
      fontWeight: "600",
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    textInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 12,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
    },
    chipRow: {
      paddingVertical: 2,
    },
    chipWrap: {
      flexDirection: "row",
      flexWrap: "wrap",
      rowGap: 8,
    },
    chip: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 8,
      paddingHorizontal: 14,
      marginRight: 8,
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    chipActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    chipEmoji: {
      fontSize: 16,
      marginRight: 6,
    },
    chipText: {
      fontSize: 14,
      color: theme.colors.text,
      fontWeight: "500",
    },
    chipTextActive: {
      color: "#fff",
    },
    dateRow: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    dateStep: {
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    dateStepText: {
      fontSize: 24,
      color: theme.colors.primary,
      fontWeight: "600",
    },
    dateCenter: {
      flex: 1,
      alignItems: "center",
      paddingVertical: 10,
    },
    dateText: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.text,
    },
    dateCaption: {
      fontSize: 12,
      color: theme.colors.textSecondary,
    },
    moreToggle: {
      paddingVertical: 8,
    },
    moreToggleText: {
      fontSize: 14,
      color: theme.colors.primary,
      fontWeight: "600",
    },
  });
