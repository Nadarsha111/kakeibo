import React, { useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { getAccountService, getCardService, getProfileService } from '../../database';
import {
  findSliceExpenses, getExpenseCategories, hasPossibleDuplicate, isExpenseAccount, saveGmailExpense,
  type GmailExpense,
} from '../../services/emailTransactions/importExpenses';
import { formatShortDate } from '../../utils/format';
import { expensePresetIndex } from '../../utils/expenseCategoryPresets';
import CategoryPicker from '../CategoryPicker';
import ChipSelect from '../ChipSelect';

interface Props {
  profileId: number | 'all';
  onClose: () => void;
  onImported: () => void;
}

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

function alertDetails(expense: GmailExpense): string {
  const source = expense.accountKind === 'credit_card' ? 'Slice credit card' : 'Slice bank account';
  return `${formatShortDate(new Date(`${expense.date}T00:00:00`))} · ${source} ••${expense.lastFour}`;
}

export default function GmailExpenseImportModal({ profileId, onClose, onImported }: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [expenses, setExpenses] = useState<GmailExpense[]>([]);
  const [nextPage, setNextPage] = useState<{ mailboxId: string; token: string }>();
  const [scanned, setScanned] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const [feedback, setFeedback] = useState<string>();
  const [selected, setSelected] = useState<GmailExpense>();
  const [accountId, setAccountId] = useState<number | null>(null);
  const [cardId, setCardId] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);

  const accounts = selected
    ? getAccountService().getAccounts(profileId === 'all' ? undefined : profileId)
      .filter((account) => isExpenseAccount(selected, account))
    : [];
  const account = accounts.find(({ id }) => id === accountId);
  const cards = account?.type === 'credit_card' ? getCardService().getCardsForAccount(account.id) : [];
  const profiles = selected && profileId === 'all' ? getProfileService().getProfiles() : [];
  const categories = selected
    ? getExpenseCategories().sort((a, b) => expensePresetIndex(a.name) - expensePresetIndex(b.name))
    : [];
  const possibleDuplicate = selected && account && hasPossibleDuplicate(selected, account);
  const canImport = !!account && !!category && (!cards.length || cardId !== null);

  const search = async (older = false) => {
    if (searching) return;
    setSearching(true);
    setSearchError(undefined);
    setFeedback(undefined);
    try {
      const result = await findSliceExpenses(older ? nextPage : undefined);
      setExpenses((previous) => older
        ? [...previous, ...result.expenses.filter((expense) => !previous.some(({ messageId }) => messageId === expense.messageId))]
        : result.expenses);
      setNextPage(result.nextPage);
      setScanned(true);
    } catch (error) {
      setSearchError(error instanceof Error ? error.message : 'Gmail search failed. Try again.');
    } finally {
      setSearching(false);
    }
  };

  const review = (expense: GmailExpense) => {
    const matches = getAccountService().getAccounts(profileId === 'all' ? undefined : profileId)
      .filter((candidate) => isExpenseAccount(expense, candidate) &&
        candidate.accountNumber?.replace(/\D/g, '').slice(-4) === expense.lastFour);
    setSelected(expense);
    setAccountId(matches.length === 1 ? matches[0].id : null);
    setCardId(null);
    setCategory(null);
  };

  const save = (confirmDuplicate = false) => {
    if (!selected || !account || !category) return;
    try {
      const result = saveGmailExpense(selected, account.id, cardId, category, confirmDuplicate);
      if (result === 'possible_duplicate') {
        Alert.alert('Possible duplicate', 'An expense with this date and amount already exists. Import this alert anyway?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Import anyway', onPress: () => save(true) },
        ]);
        return;
      }
      setExpenses((previous) => previous.filter(({ messageId }) => messageId !== selected.messageId));
      setSelected(undefined);
      setFeedback(result === 'imported' ? 'Expense imported.' : 'This email was already imported.');
      if (result === 'imported') onImported();
    } catch (error) {
      Alert.alert('Could not import expense', error instanceof Error ? error.message : 'Try again.');
    }
  };

  const close = () => selected ? setSelected(undefined) : onClose();

  return (
    <Modal visible animationType="slide" onRequestClose={close}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={close} accessibilityRole="button" accessibilityLabel={selected ? 'Back to alerts' : 'Close Gmail import'} hitSlop={8}>
            <MaterialCommunityIcons name={selected ? 'arrow-left' : 'close'} color={theme.colors.text} size={24} />
          </TouchableOpacity>
          <Text style={styles.title}>{selected ? 'Review expense' : 'Import from Gmail'}</Text>
        </View>
        {selected ? (
          <ScrollView contentContainerStyle={styles.content} key="review">
            <View style={styles.preview}>
              <Text style={styles.amount}>{rupees.format(selected.amount)}</Text>
              <Text style={styles.label}>{selected.payee}</Text>
              <Text style={styles.muted}>{alertDetails(selected)}</Text>
              {selected.reference && <Text style={styles.muted}>RRN {selected.reference}</Text>}
            </View>
            <Text style={styles.label}>Account</Text>
            {accounts.length ? (
              <ChipSelect
                options={accounts.map(({ id, name, profileId: owner }) => ({
                  key: id, label: [name, profiles.find((profile) => profile.id === owner)?.name].filter(Boolean).join(' · '),
                }))}
                selected={accountId}
                onSelect={(id) => { setAccountId(id); setCardId(null); }}
              />
            ) : <Text style={styles.muted}>Add a matching account in Accounts before importing this alert.</Text>}
            {!!cards.length && (
              <>
                <Text style={styles.label}>Card</Text>
                <ChipSelect options={cards.map(({ id, name }) => ({ key: id, label: name }))} selected={cardId} onSelect={setCardId} />
              </>
            )}
            <CategoryPicker categories={categories} selected={category} onSelect={setCategory} />
            {possibleDuplicate && (
              <Text style={styles.muted}>Possible duplicate. An expense with the same date and amount already exists.</Text>
            )}
            <TouchableOpacity accessibilityRole="button" style={[styles.primary, !canImport && styles.disabled]} onPress={() => save()} disabled={!canImport}>
              <Text style={styles.primaryText}>Import expense</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.content} key="alerts">
            {!scanned && <Text style={styles.muted}>Find Slice UPI debit and credit card alerts from the last 30 days.</Text>}
            <TouchableOpacity accessibilityRole="button" style={[styles.primary, searching && styles.disabled]} onPress={() => search()} disabled={searching}>
              <Text style={styles.primaryText}>{scanned ? 'Search again' : 'Find Slice alerts'}</Text>
            </TouchableOpacity>
            {searching && <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Searching Gmail" />}
            {searchError && <Text accessibilityLiveRegion="polite" style={styles.muted}>{searchError}</Text>}
            {feedback && <Text accessibilityLiveRegion="polite" style={styles.muted}>{feedback}</Text>}
            {scanned && !searching && !expenses.length && (
              <Text style={styles.muted}>{nextPage ? 'No new supported alerts on this page.' : 'No new supported Slice alerts found.'}</Text>
            )}
            {expenses.map((expense) => (
              <TouchableOpacity accessibilityRole="button" key={expense.messageId} style={styles.row} onPress={() => review(expense)} disabled={searching}>
                <View style={styles.rowDetails}>
                  <Text style={styles.label}>{expense.payee}</Text>
                  <Text style={styles.muted}>{alertDetails(expense)}</Text>
                </View>
                <Text style={styles.label}>{rupees.format(expense.amount)}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            ))}
            {nextPage && (
              <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={() => search(true)} disabled={searching}>
                <Text style={styles.secondaryText}>Load older alerts</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: { flexDirection: 'row', alignItems: 'center', gap: 16, padding: 18, borderBottomWidth: 1, borderBottomColor: theme.colors.border },
  title: { color: theme.colors.text, fontWeight: '700', fontSize: 22 },
  content: { padding: 16, paddingBottom: 28, gap: 14 },
  preview: { padding: 16, gap: 6, backgroundColor: theme.colors.surface, borderRadius: 12 },
  amount: { color: theme.colors.text, fontSize: 28, fontWeight: '700' },
  label: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  muted: { color: theme.colors.textSecondary, fontSize: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 10, backgroundColor: theme.colors.surface },
  rowDetails: { flex: 1, gap: 4 },
  primary: { padding: 14, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
  secondary: { alignItems: 'center', padding: 12 },
  secondaryText: { color: theme.colors.primary, fontWeight: '600', fontSize: 15 },
});
