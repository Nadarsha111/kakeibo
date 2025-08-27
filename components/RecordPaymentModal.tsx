import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { useTheme } from "../context/ThemeContext";
import { useSettings } from "../context/SettingsContext";
import { getLoanService, getAccountService } from "../database";
import { Loan, Account } from "../types";
import OptionSelector from "./OptionSelector";

interface RecordPaymentModalProps {
  visible: boolean;
  onClose: () => void;
  onPaymentRecorded: () => void;
  loan: Loan | null;
}

export default function RecordPaymentModal({
  visible,
  onClose,
  onPaymentRecorded,
  loan,
}: RecordPaymentModalProps) {
  const { theme } = useTheme();
  const { formatCurrency, selectedProfileId } = useSettings();
  const styles = createStyles(theme);

  const [amount, setAmount] = useState("");
  const [selectedAccountId, setSelectedAccountId] = useState<
    number | undefined
  >();
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [showAccountPicker, setShowAccountPicker] = useState(false);

  const outstandingAmount = loan ? loan.amount - loan.returnedAmount : 0;

  useEffect(() => {
    if (visible && loan) {
      const accountService = getAccountService();
      const profileId =
        selectedProfileId === "all" ? undefined : selectedProfileId;
      const availableAccounts = accountService.getAccounts(profileId);
      setAccounts(availableAccounts);

      // Reset form
      setAmount("");
      setSelectedAccountId(undefined);
    }
  }, [visible, loan, selectedProfileId]);

  const handleRecord = () => {
    if (!loan) return;
    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      Alert.alert("Error", "Please enter a valid payment amount.");
      return;
    }
    if (parseFloat(amount) > outstandingAmount) {
      Alert.alert(
        "Error",
        `Payment amount cannot exceed the outstanding balance of ${formatCurrency(outstandingAmount)}.`,
      );
      return;
    }

    try {
      const loanService = getLoanService();
      loanService.recordLoanPayment(
        loan.id,
        parseFloat(amount),
        new Date().toISOString().split("T")[0],
        selectedAccountId,
      );
      onPaymentRecorded();
    } catch (error: any) {
      console.error("Error recording payment:", error);
      Alert.alert("Error", error.message || "Failed to record payment.");
    }
  };

  const accountOptions = accounts.map((acc) => ({
    label: `${acc.name} (${formatCurrency(acc.balance)})`,
    value: acc.id.toString(),
    subtitle: acc.bankName || acc.type,
  }));

  const selectedAccountName =
    accounts.find((a) => a.id === selectedAccountId)?.name ||
    "Select Account (Optional)";

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContainer}>
          <Text style={styles.modalTitle}>Record Payment</Text>
          {loan && (
            <Text style={styles.loanInfo}>
              For loan to/from{" "}
              <Text style={{ fontWeight: "bold" }}>
                {loan.isLending ? loan.borrowerName : loan.lenderName}
              </Text>
            </Text>
          )}
          <Text style={styles.outstanding}>
            Outstanding: {formatCurrency(outstandingAmount)}
          </Text>

          <Text style={styles.label}>Payment Amount</Text>
          <TextInput
            style={styles.input}
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="decimal-pad"
          />

          <Text style={styles.label}>
            {loan?.isLending ? "Deposit to Account" : "Pay from Account"}
          </Text>
          <TouchableOpacity
            style={styles.selectorButton}
            onPress={() => setShowAccountPicker(true)}
          >
            <Text style={styles.selectorText}>{selectedAccountName}</Text>
          </TouchableOpacity>

          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={onClose}
            >
              <Text style={styles.buttonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.saveButton]}
              onPress={handleRecord}
            >
              <Text style={[styles.buttonText, { color: "#fff" }]}>Record</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      <OptionSelector
        visible={showAccountPicker}
        onClose={() => setShowAccountPicker(false)}
        title="Select Account"
        options={accountOptions}
        selectedValue={selectedAccountId?.toString()}
        onSelect={(value) => {
          setSelectedAccountId(parseInt(value, 10));
          setShowAccountPicker(false);
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
      marginBottom: 8,
      textAlign: "center",
    },
    loanInfo: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      textAlign: "center",
      marginBottom: 4,
    },
    outstanding: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.primary,
      textAlign: "center",
      marginBottom: 24,
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
