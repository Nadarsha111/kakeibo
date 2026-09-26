import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  Modal,
  ActivityIndicator,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { getStatementService } from '../../database';
import { Account, ReconciledLineItem } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { useTransactionModal } from '../../context/TransactionModalContext';
import { formatShortDate } from '../../utils/format';
import ChipSelect from '../ChipSelect';
import { importStatement } from '../../services/StatementImportService';

interface StatementModalProps {
  visible: boolean;
  account: Account | null;
  onClose: () => void;
}

/** "2026-09" -> "Sep 2026" */
function monthLabel(month: string): string {
  const [year, m] = month.split('-');
  const date = new Date(Number(year), Number(m) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

function lastNMonths(n: number): string[] {
  const months: string[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return months;
}

type ImportState = 'idle' | 'importing' | 'needs_password';

/**
 * Import a statement PDF for an account/month and see how it lines up against what's already
 * logged. Line items are kept only for this comparison - nothing here is written into the
 * transactions table until you explicitly add an unmatched item.
 */
export default function StatementModal({ visible, account, onClose }: StatementModalProps) {
  const { theme } = useTheme();
  const { formatCurrency } = useSettings();
  const { openModal: openTransactionModal } = useTransactionModal();
  const styles = createStyles(theme);

  const months = lastNMonths(6);
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [items, setItems] = useState<ReconciledLineItem[]>([]);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [pendingFileUri, setPendingFileUri] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);

  const loadReconciliation = useCallback(
    (month: string) => {
      if (!account) return;
      setItems(getStatementService().getReconciliation(account.id, month));
    },
    [account],
  );

  useEffect(() => {
    if (visible && account) {
      setSelectedMonth(months[0]);
      loadReconciliation(months[0]);
      setImportState('idle');
      setPasswordInput('');
      setPasswordError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, account?.id]);

  const handleSelectMonth = (month: string) => {
    setSelectedMonth(month);
    loadReconciliation(month);
  };

  const runImport = async (fileUri: string, password?: string) => {
    if (!account) return;
    setImportState('importing');
    const outcome = await importStatement(fileUri, account.profileId, account.id, selectedMonth, password);

    switch (outcome.status) {
      case 'needs_password':
        setPendingFileUri(fileUri);
        setPasswordError(null);
        setImportState('needs_password');
        return;
      case 'wrong_password':
        setPendingFileUri(fileUri);
        setPasswordError('Wrong password - try again.');
        setImportState('needs_password');
        return;
      case 'no_transactions_found':
        setImportState('idle');
        Alert.alert('Nothing found', "Couldn't find any transactions in that PDF - it may be in a layout this app doesn't recognize yet.");
        return;
      case 'error':
        setImportState('idle');
        Alert.alert('Import failed', outcome.message);
        return;
      case 'success':
        setImportState('idle');
        setPendingFileUri(null);
        setPasswordInput('');
        loadReconciliation(selectedMonth);
        Alert.alert('Imported', `Found ${outcome.count} transaction${outcome.count === 1 ? '' : 's'}.`);
        return;
    }
  };

  const handlePickFile = async () => {
    const result = await DocumentPicker.getDocumentAsync({ type: 'application/pdf' });
    if (result.canceled || !result.assets?.[0]) return;
    setPendingFileUri(result.assets[0].uri);
    runImport(result.assets[0].uri);
  };

  const handlePasswordSubmit = () => {
    if (!pendingFileUri || !passwordInput.trim()) return;
    runImport(pendingFileUri, passwordInput.trim());
  };

  const handleAddItem = (item: ReconciledLineItem) => {
    onClose(); // avoid stacking two modals - reopen this one afterward to see it matched
    openTransactionModal({
      prefill: {
        amount: item.amount,
        description: item.description ?? undefined,
        date: item.date,
        type: item.direction === 'debit' ? 'expense' : 'income',
        accountId: item.accountId,
      },
    });
  };

  const matchedCount = items.filter((i) => i.matchedTransactionId).length;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Close</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Statement</Text>
          <View style={styles.cancelButton} />
        </View>

        <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
          {account && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{account.name}</Text>
              <ChipSelect
                options={months.map((m) => ({ key: m, label: monthLabel(m) }))}
                selected={selectedMonth}
                onSelect={handleSelectMonth}
              />
            </View>
          )}

          {importState === 'needs_password' ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Password protected</Text>
              <TextInput
                style={styles.textInput}
                value={passwordInput}
                onChangeText={setPasswordInput}
                placeholder="Statement password"
                placeholderTextColor={theme.colors.textSecondary}
                secureTextEntry
                autoFocus
              />
              {passwordError && <Text style={styles.errorText}>{passwordError}</Text>}
              <TouchableOpacity style={styles.primaryButton} onPress={handlePasswordSubmit}>
                <Text style={styles.primaryButtonText}>Unlock</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.section}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handlePickFile}
                disabled={importState === 'importing'}
              >
                {importState === 'importing' ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryButtonText}>Import statement PDF</Text>
                )}
              </TouchableOpacity>
              <Text style={styles.helperText}>
                Saved once unlocked - you won't need to enter this account's statement password again next month.
              </Text>
            </View>
          )}

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>
              {items.length === 0
                ? 'No statement imported for this month yet'
                : `${matchedCount} of ${items.length} matched`}
            </Text>
            {items.map((item) => (
              <View key={item.id} style={styles.row}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.value}>{item.description || '(no description)'}</Text>
                  <Text style={styles.label}>{formatShortDate(item.date)}</Text>
                </View>
                <Text style={[styles.value, { marginRight: 12 }]}>
                  {item.direction === 'credit' ? '+' : '-'}
                  {formatCurrency(item.amount)}
                </Text>
                {item.matchedTransactionId ? (
                  <Text style={styles.matchedBadge}>✓</Text>
                ) : (
                  <TouchableOpacity style={styles.addButton} onPress={() => handleAddItem(item)}>
                    <Text style={styles.addButtonText}>Add</Text>
                  </TouchableOpacity>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
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
    cancelButton: { paddingHorizontal: 16, paddingVertical: 8, minWidth: 60 },
    cancelButtonText: { color: theme.colors.textSecondary, fontSize: 16 },
    headerTitle: { fontSize: 18, fontWeight: '600', color: theme.colors.text },
    content: { flex: 1, paddingHorizontal: 16 },
    section: { marginTop: 24 },
    sectionTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 12 },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    label: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
    value: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
    textInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 16,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
      marginBottom: 12,
    },
    primaryButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
    helperText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 8, fontStyle: 'italic' },
    errorText: { fontSize: 13, color: '#dc2626', marginBottom: 12 },
    matchedBadge: { fontSize: 18, color: '#15803d', fontWeight: '700', width: 44, textAlign: 'center' },
    addButton: {
      backgroundColor: theme.colors.primary,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    addButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  });
