import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getCategoryService, getStatementService, getTransactionService } from '../../database';
import { Account, ReconciledLineItem, Transaction } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { formatShortDate } from '../../utils/format';
import ChipSelect from '../ChipSelect';
import { importStatement } from '../../services/StatementImportService';
import {
  downloadStatementPdf,
  findStatementEmails,
  getSavedMailQuery,
  saveMailQuery,
  StatementEmail,
} from '../../services/GmailStatementService';

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

function paymentMethodFor(account: Account): Transaction['paymentMethod'] {
  if (account.type === 'credit_card') return 'credit_card';
  if (account.type === 'cash') return 'cash';
  return 'debit_card';
}

/**
 * Import a statement PDF for an account/month and see how it lines up against what's already
 * logged. Line items are kept only for this comparison - nothing here is written into the
 * transactions table until you select unmatched items and add them.
 */
export default function StatementModal({ visible, account, onClose }: StatementModalProps) {
  const { theme } = useTheme();
  const { formatCurrency } = useSettings();
  const styles = createStyles(theme);

  const months = lastNMonths(6);
  const [selectedMonth, setSelectedMonth] = useState(months[0]);
  const [items, setItems] = useState<ReconciledLineItem[]>([]);
  const [importState, setImportState] = useState<ImportState>('idle');
  const [pendingFileUri, setPendingFileUri] = useState<string | null>(null);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [mailQuery, setMailQuery] = useState('');
  const [searchingMail, setSearchingMail] = useState(false);
  // null until searched, so "no emails found" can be told apart from "not searched yet"
  const [emails, setEmails] = useState<StatementEmail[] | null>(null);

  const expenseCategories = useMemo(() => (visible ? getCategoryService().getCategoriesByType('expense') : []), [visible]);
  const incomeCategories = useMemo(() => (visible ? getCategoryService().getCategoriesByType('income') : []), [visible]);
  const [expenseCategory, setExpenseCategory] = useState<string | null>(null);
  const [incomeCategory, setIncomeCategory] = useState<string | null>(null);

  const loadReconciliation = useCallback(
    (month: string) => {
      if (!account) return;
      setItems(getStatementService().getReconciliation(account.id, month));
      setSelectedIds(new Set());
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
      setMailQuery(getSavedMailQuery(account.id));
      setEmails(null);
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

  const handleFindEmails = async () => {
    if (!account || !mailQuery.trim()) return;
    saveMailQuery(account.id, mailQuery);
    setSearchingMail(true);
    const outcome = await findStatementEmails(mailQuery);
    setSearchingMail(false);
    if (outcome.status === 'no_access') {
      Alert.alert('Gmail not connected', 'Sign in to Google and allow Gmail access to fetch statements from your mail.');
    } else if (outcome.status === 'error') {
      Alert.alert('Gmail search failed', outcome.message);
    } else {
      setEmails(outcome.emails);
    }
  };

  const handleImportEmail = async (email: StatementEmail) => {
    setImportState('importing');
    try {
      const uri = await downloadStatementPdf(email);
      setPendingFileUri(uri);
      await runImport(uri);
    } catch (error) {
      setImportState('idle');
      Alert.alert('Download failed', error instanceof Error ? error.message : 'Could not download the statement from Gmail.');
    }
  };

  const handlePasswordSubmit = () => {
    if (!pendingFileUri || !passwordInput.trim()) return;
    runImport(pendingFileUri, passwordInput.trim());
  };

  const unmatchedItems = items.filter((i) => !i.matchedTransactionId);
  const selectedItems = unmatchedItems.filter((i) => selectedIds.has(i.id));
  const hasSelectedDebits = selectedItems.some((i) => i.direction === 'debit');
  const hasSelectedCredits = selectedItems.some((i) => i.direction === 'credit');
  // Lines with a possible (near-amount) match are probably already logged, so "select all" leaves
  // them out - they can still be ticked one by one if they really are separate spends.
  const bulkSelectableItems = unmatchedItems.filter((i) => !i.possibleMatchTransactionId);
  const allUnmatchedSelected =
    bulkSelectableItems.length > 0 && bulkSelectableItems.every((i) => selectedIds.has(i.id));
  // Fall back to each list's first category until the user picks one.
  const effectiveExpenseCategory = expenseCategory ?? expenseCategories[0]?.name ?? null;
  const effectiveIncomeCategory = incomeCategory ?? incomeCategories[0]?.name ?? null;

  const toggleSelected = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    setSelectedIds(allUnmatchedSelected ? new Set() : new Set(bulkSelectableItems.map((i) => i.id)));
  };

  const handleAddSelected = () => {
    if (!account || selectedItems.length === 0) return;
    if ((hasSelectedDebits && !effectiveExpenseCategory) || (hasSelectedCredits && !effectiveIncomeCategory)) {
      Alert.alert('Pick a category', 'Choose a category for the selected transactions first.');
      return;
    }
    try {
      getTransactionService().addTransactions(
        selectedItems.map((item) => ({
          profileId: item.profileId,
          amount: item.amount,
          type: item.direction === 'debit' ? 'expense' : 'income',
          category: (item.direction === 'debit' ? effectiveExpenseCategory : effectiveIncomeCategory)!,
          description: item.description ?? null,
          date: item.date,
          paymentMethod: paymentMethodFor(account),
          accountId: item.accountId,
        })),
      );
      const count = selectedItems.length;
      loadReconciliation(selectedMonth); // the new transactions now match, so their rows turn ✓
      Alert.alert('Added', `Added ${count} transaction${count === 1 ? '' : 's'}.`);
    } catch {
      Alert.alert('Error', 'Could not add the selected transactions.');
    }
  };

  const matchedCount = items.length - unmatchedItems.length;
  const possibleCount = unmatchedItems.length - bulkSelectableItems.length;

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

              <Text style={[styles.label, { marginTop: 20, marginBottom: 6 }]}>Or fetch it from Gmail</Text>
              <TextInput
                style={styles.textInput}
                value={mailQuery}
                onChangeText={setMailQuery}
                onSubmitEditing={handleFindEmails}
                placeholder="Sender, e.g. statements@yourbank.com"
                placeholderTextColor={theme.colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                returnKeyType="search"
              />
              <TouchableOpacity
                style={[styles.secondaryButton, !mailQuery.trim() && { opacity: 0.5 }]}
                onPress={handleFindEmails}
                disabled={searchingMail || importState === 'importing' || !mailQuery.trim()}
              >
                {searchingMail ? (
                  <ActivityIndicator color={theme.colors.primary} />
                ) : (
                  <Text style={styles.secondaryButtonText}>Find statement emails</Text>
                )}
              </TouchableOpacity>

              {emails && emails.length === 0 && (
                <Text style={styles.helperText}>
                  No emails with a PDF attachment matched in the last year. Some banks email a download link instead of
                  attaching the PDF - those have to be downloaded and imported by hand.
                </Text>
              )}
              {emails && emails.length > 0 && (
                <>
                  <Text style={styles.helperText}>Tap one to import it as the {monthLabel(selectedMonth)} statement.</Text>
                  {emails.map((email) => (
                    <TouchableOpacity
                      key={`${email.messageId}-${email.attachmentId}`}
                      style={styles.row}
                      onPress={() => handleImportEmail(email)}
                      disabled={importState === 'importing'}
                      activeOpacity={0.6}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.value} numberOfLines={1}>{email.subject}</Text>
                        <Text style={styles.label} numberOfLines={1}>
                          {formatShortDate(email.date)} · {email.attachmentName}
                        </Text>
                      </View>
                      <Text style={styles.linkText}>Import</Text>
                    </TouchableOpacity>
                  ))}
                </>
              )}
            </View>
          )}

          <View style={styles.section}>
            <View style={styles.listHeader}>
              <Text style={[styles.sectionTitle, { marginBottom: 0 }]}>
                {items.length === 0
                  ? 'No statement imported for this month yet'
                  : `${matchedCount} of ${items.length} matched${possibleCount > 0 ? ` · ${possibleCount} possible` : ''}`}
              </Text>
              {bulkSelectableItems.length > 0 && (
                <TouchableOpacity onPress={toggleSelectAll}>
                  <Text style={styles.linkText}>{allUnmatchedSelected ? 'Clear' : 'Select all unmatched'}</Text>
                </TouchableOpacity>
              )}
            </View>

            {selectedItems.length > 0 && (
              <View style={styles.addPanel}>
                {hasSelectedDebits && (
                  <>
                    <Text style={styles.label}>Expense category</Text>
                    <ChipSelect
                      options={expenseCategories.map((c) => ({ key: c.name, label: c.name }))}
                      selected={effectiveExpenseCategory}
                      onSelect={setExpenseCategory}
                    />
                  </>
                )}
                {hasSelectedCredits && (
                  <>
                    <Text style={styles.label}>Income category</Text>
                    <ChipSelect
                      options={incomeCategories.map((c) => ({ key: c.name, label: c.name }))}
                      selected={effectiveIncomeCategory}
                      onSelect={setIncomeCategory}
                    />
                  </>
                )}
                <TouchableOpacity style={[styles.primaryButton, { marginTop: 12 }]} onPress={handleAddSelected}>
                  <Text style={styles.primaryButtonText}>
                    Add {selectedItems.length} transaction{selectedItems.length === 1 ? '' : 's'}
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {items.map((item) => {
              const matched = !!item.matchedTransactionId;
              const possible = !matched && item.possibleMatchAmount != null;
              const selected = selectedIds.has(item.id);
              return (
                <TouchableOpacity
                  key={item.id}
                  style={styles.row}
                  onPress={() => toggleSelected(item.id)}
                  disabled={matched}
                  activeOpacity={0.6}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.value}>{item.description || '(no description)'}</Text>
                    <Text style={styles.label}>{formatShortDate(item.date)}</Text>
                    {possible && (
                      <Text style={styles.possibleText}>
                        Possibly logged as {formatCurrency(item.possibleMatchAmount!)}
                      </Text>
                    )}
                  </View>
                  <Text style={[styles.value, { marginRight: 12 }]}>
                    {item.direction === 'credit' ? '+' : '-'}
                    {formatCurrency(item.amount)}
                  </Text>
                  {matched ? (
                    <Text style={styles.matchedBadge}>✓</Text>
                  ) : (
                    <View style={styles.checkboxCell}>
                      <View style={[styles.checkbox, selected && styles.checkboxChecked]}>
                        {selected && <Text style={styles.checkboxMark}>✓</Text>}
                      </View>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
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
    secondaryButton: {
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.primary,
    },
    secondaryButtonText: { color: theme.colors.primary, fontSize: 16, fontWeight: '600' },
    helperText: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 8, fontStyle: 'italic' },
    errorText: { fontSize: 13, color: '#dc2626', marginBottom: 12 },
    matchedBadge: { fontSize: 18, color: '#15803d', fontWeight: '700', width: 44, textAlign: 'center' },
    possibleText: { fontSize: 12, color: '#b45309', marginTop: 2 },
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    linkText: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
    addPanel: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
      padding: 12,
      marginBottom: 8,
    },
    checkboxCell: { width: 44, alignItems: 'center' },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 2,
      borderColor: theme.colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    checkboxChecked: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
    checkboxMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  });
