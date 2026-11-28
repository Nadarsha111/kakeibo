import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import { getAccountService, getCardService, getProfileService } from '../../database';
import {
  findGmailExpenses, findLocalExpenseCategory, getExpenseCategories, getLocalExpensesForAlerts,
  hasPossibleDuplicate, isExpenseAccount, receiverKey, saveGmailExpense,
  type GmailExpense,
} from '../../services/emailTransactions/importExpenses';
import { formatShortDate } from '../../utils/format';
import { expenseCategoryLabel, expensePresetIndex } from '../../utils/expenseCategoryPresets';
import CategoryPicker from '../CategoryPicker';
import ChipSelect from '../ChipSelect';
import GmailExpenseCard from '../GmailExpenseCard';

interface Props {
  profileId: number | 'all';
  onClose: () => void;
  onImported: () => void;
}

interface ExpenseDraft {
  accountId: number | null;
  cardId: number | null;
  category: string | null;
}

type ReadyDraft = ExpenseDraft & { accountId: number; category: string };

const EMPTY_DRAFT: ExpenseDraft = { accountId: null, cardId: null, category: null };
const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' });

function expenseKey({ mailboxId, messageId }: GmailExpense): string {
  return `${mailboxId}:${messageId}`;
}

function alertDetails(expense: GmailExpense): string {
  const bank = expense.provider === 'sbi' ? 'SBI' : 'Slice';
  const accountType = expense.accountKind === 'credit_card' ? 'credit card' : 'bank account';
  return `${formatShortDate(new Date(`${expense.date}T00:00:00`))} · ${bank} ${accountType} ••${expense.lastFour}`;
}

export default function GmailExpenseImportModal({ profileId, onClose, onImported }: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [expenses, setExpenses] = useState<GmailExpense[]>([]);
  const [nextPage, setNextPage] = useState<{ mailboxId: string; token: string }>();
  const [scanned, setScanned] = useState(false);
  const [pendingSearch, setPendingSearch] = useState<'search' | 'older' | null>(null);
  const [searchError, setSearchError] = useState<{ message: string; older: boolean }>();
  const [feedback, setFeedback] = useState<string>();
  const [categorizedCount, setCategorizedCount] = useState(0);
  const [selected, setSelected] = useState<GmailExpense>();
  const [drafts, setDrafts] = useState<Record<string, ExpenseDraft>>({});
  const searching = pendingSearch !== null;
  const loadingOlder = pendingSearch === 'older';

  const allAccounts = expenses.length
    ? getAccountService().getAccounts(profileId === 'all' ? undefined : profileId)
    : [];
  const accountById = new Map(allAccounts.map((item) => [item.id, item]));
  const accountProfiles = new Set(allAccounts.map((item) => item.profileId));
  const onlyAccountProfile = accountProfiles.size === 1 ? allAccounts[0].profileId : undefined;
  const viewProfile = profileId === 'all' ? onlyAccountProfile : profileId;
  const cardsByAccount = getCardService().getCardsForAccounts(
    allAccounts.filter(({ type }) => type === 'credit_card').map(({ id }) => id),
  );
  const { accountId, cardId, category } = (selected && drafts[expenseKey(selected)]) || EMPTY_DRAFT;
  const accounts = selected ? allAccounts.filter((account) => isExpenseAccount(selected, account)) : [];
  const account = accounts.find(({ id }) => id === accountId);
  const cards = account ? cardsByAccount.get(account.id) ?? [] : [];
  const profiles = selected && profileId === 'all' ? getProfileService().getProfiles() : [];
  const categories = expenses.length
    ? getExpenseCategories().sort((a, b) => expensePresetIndex(a.name) - expensePresetIndex(b.name))
    : [];
  const categoriesByName = new Map(categories.map((item) => [item.name, item]));
  const possibleDuplicate = selected && account && hasPossibleDuplicate(selected, account);
  const localMatches = useMemo(
    () => getLocalExpensesForAlerts(expenses, profileId === 'all' ? undefined : profileId),
    [expenses, profileId],
  );
  const reviewedLocalCategory = selected
    ? findLocalExpenseCategory(selected, localMatches, allAccounts, account, viewProfile)
    : undefined;

  const matchedAccount = (expense: GmailExpense) => {
    const matches = allAccounts.filter((candidate) => isExpenseAccount(expense, candidate) &&
      candidate.accountNumber?.replace(/\D/g, '').slice(-4) === expense.lastFour);
    return matches.length === 1 ? matches[0] : undefined;
  };

  const isReady = (expense: GmailExpense, draft: ExpenseDraft): draft is ReadyDraft => {
    if (draft.accountId === null || draft.category === null || !categoriesByName.has(draft.category)) return false;
    const target = accountById.get(draft.accountId);
    if (!target || !isExpenseAccount(expense, target)) return false;
    const targetCards = cardsByAccount.get(target.id) ?? [];
    return targetCards.length ? targetCards.some(({ id }) => id === draft.cardId) : draft.cardId === null;
  };
  const canImport = selected && isReady(selected, { accountId, cardId, category });

  const sourceProfile = account?.profileId ?? viewProfile;
  const selectedReceiver = selected ? receiverKey(selected.payee) : '';
  const matchingUncategorized = selected && category && selectedReceiver ? expenses.flatMap((expense) => {
    const key = expenseKey(expense);
    if (key === expenseKey(selected) || expense.mailboxId !== selected.mailboxId ||
        receiverKey(expense.payee) !== selectedReceiver || drafts[key]?.category) return [];

    const existing = drafts[key];
    const target = existing?.accountId != null ? accountById.get(existing.accountId) : matchedAccount(expense);
    const targetProfile = target?.profileId ?? viewProfile;
    const sameInstrument = expense.provider === selected.provider && expense.accountKind === selected.accountKind &&
      expense.lastFour === selected.lastFour;
    const sameProfile = targetProfile !== undefined && targetProfile === sourceProfile;
    if (!sameProfile && !(targetProfile === undefined && sameInstrument)) return [];

    return [{ key, accountId: target?.id ?? null }];
  }) : [];

  const search = async (older = false) => {
    if (searching || (older && !nextPage)) return;
    setPendingSearch(older ? 'older' : 'search');
    setSearchError(undefined);
    setFeedback(undefined);
    try {
      const result = await findGmailExpenses(older ? nextPage : undefined);
      setExpenses((previous) => older
        ? [...previous, ...result.expenses.filter((expense) => !previous.some((item) => expenseKey(item) === expenseKey(expense)))]
        : result.expenses);
      setNextPage(result.nextPage);
      setScanned(true);
    } catch (error) {
      setSearchError({ message: error instanceof Error ? error.message : 'Gmail search failed. Try again.', older });
    } finally {
      setPendingSearch(null);
    }
  };

  const review = (expense: GmailExpense) => {
    const key = expenseKey(expense);
    if (!drafts[key]) {
      const target = matchedAccount(expense);
      setDrafts((previous) => ({
        ...previous,
        [key]: { ...EMPTY_DRAFT, accountId: target?.id ?? null },
      }));
    }
    setCategorizedCount(0);
    setSelected(expense);
  };

  const updateDraft = (changes: Partial<ExpenseDraft>) => {
    if (!selected) return;
    const key = expenseKey(selected);
    setDrafts((previous) => ({ ...previous, [key]: { ...(previous[key] ?? EMPTY_DRAFT), ...changes } }));
  };

  const applyCategoryToMatches = () => {
    if (!category || !matchingUncategorized.length) return;
    setDrafts((previous) => {
      const updated = { ...previous };
      for (const { key, accountId: matchedId } of matchingUncategorized) {
        const draft = previous[key] ?? { ...EMPTY_DRAFT, accountId: matchedId };
        if (!draft.category) updated[key] = { ...draft, category };
      }
      return updated;
    });
    setCategorizedCount(matchingUncategorized.length);
  };

  const save = (expense: GmailExpense, draft: ReadyDraft, confirmDuplicate = false) => {
    try {
      const result = saveGmailExpense(expense, draft.accountId, draft.cardId, draft.category, confirmDuplicate);
      if (result === 'possible_duplicate') {
        Alert.alert('Possible duplicate', 'An expense with this date and amount already exists. Import this alert anyway?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Import anyway', onPress: () => save(expense, draft, true) },
        ]);
        return;
      }
      const key = expenseKey(expense);
      setExpenses((previous) => previous.filter((item) => expenseKey(item) !== key));
      setDrafts((previous) => {
        const remaining = { ...previous };
        delete remaining[key];
        return remaining;
      });
      setSelected((current) => current && expenseKey(current) === key ? undefined : current);
      setFeedback(result === 'imported' ? 'Expense imported.' : 'This email was already imported.');
      if (result === 'imported') onImported();
    } catch (error) {
      Alert.alert('Could not import expense', error instanceof Error ? error.message : 'Try again.');
    }
  };

  const importOrReview = (expense: GmailExpense) => {
    const draft = drafts[expenseKey(expense)] ?? EMPTY_DRAFT;
    if (isReady(expense, draft)) {
      save(expense, draft);
    } else {
      review(expense);
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
                onSelect={(id) => {
                  if (id !== accountId) updateDraft({ accountId: id, cardId: null });
                }}
              />
            ) : <Text style={styles.muted}>Add a matching account in Accounts before importing this alert.</Text>}
            {!!cards.length && (
              <>
                <Text style={styles.label}>Card</Text>
                <ChipSelect options={cards.map(({ id, name }) => ({ key: id, label: name }))} selected={cardId} onSelect={(id) => updateDraft({ cardId: id })} />
              </>
            )}
            {reviewedLocalCategory && (
              <View style={styles.localMatch}>
                <Text style={styles.muted}>Possible local match · {expenseCategoryLabel(reviewedLocalCategory)}</Text>
                {category !== reviewedLocalCategory && categoriesByName.has(reviewedLocalCategory) && (
                  <TouchableOpacity accessibilityRole="button" onPress={() => {
                    setCategorizedCount(0);
                    updateDraft({ category: reviewedLocalCategory });
                  }}>
                    <Text style={styles.secondaryText}>Use {expenseCategoryLabel(reviewedLocalCategory)}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
            <CategoryPicker
              categories={categories}
              selected={category}
              onSelect={(name) => {
                setCategorizedCount(0);
                updateDraft({ category: name });
              }}
            />
            {!!matchingUncategorized.length && (
              <TouchableOpacity accessibilityRole="button" style={styles.secondary} onPress={applyCategoryToMatches}>
                <Text style={styles.secondaryText}>
                  Apply to {matchingUncategorized.length} other {matchingUncategorized.length === 1 ? 'alert' : 'alerts'} from this receiver
                </Text>
              </TouchableOpacity>
            )}
            {categorizedCount > 0 && (
              <Text accessibilityLiveRegion="polite" style={styles.muted}>
                Category applied to {categorizedCount} other {categorizedCount === 1 ? 'alert' : 'alerts'}.
              </Text>
            )}
            {possibleDuplicate && (
              <Text style={styles.muted}>Possible duplicate. An expense with the same date and amount already exists.</Text>
            )}
            <TouchableOpacity accessibilityRole="button" style={[styles.primary, !canImport && styles.disabled]} onPress={() => importOrReview(selected)} disabled={!canImport}>
              <Text style={styles.primaryText}>Import expense</Text>
            </TouchableOpacity>
          </ScrollView>
        ) : (
          <ScrollView contentContainerStyle={styles.content} key="alerts">
            {!scanned && <Text style={styles.muted}>Find Slice UPI and SBI credit card purchase alerts from the last 30 days.</Text>}
            <TouchableOpacity accessibilityRole="button" style={[styles.primary, searching && styles.disabled]} onPress={() => search()} disabled={searching}>
              <Text style={styles.primaryText}>{scanned ? 'Search again' : 'Find transaction alerts'}</Text>
            </TouchableOpacity>
            {pendingSearch === 'search' && <ActivityIndicator color={theme.colors.primary} accessibilityLabel="Searching Gmail" />}
            {searchError && !searchError.older && <Text accessibilityLiveRegion="polite" style={styles.muted}>{searchError.message}</Text>}
            {feedback && <Text accessibilityLiveRegion="polite" style={styles.muted}>{feedback}</Text>}
            {scanned && !searching && !expenses.length && (
              <Text style={styles.muted}>{nextPage ? 'No new supported alerts on this page.' : 'No new supported alerts found.'}</Text>
            )}
            {!!expenses.length && <Text style={styles.muted}>Tap to review. Swipe left to import a ready expense.</Text>}
            {expenses.map((expense) => {
              const key = expenseKey(expense);
              const draft = drafts[key] ?? EMPTY_DRAFT;
              const chosen = draft.category === null ? undefined : categoriesByName.get(draft.category);
              const target = draft.accountId === null ? matchedAccount(expense) : accountById.get(draft.accountId);
              const localCategory = !chosen
                ? findLocalExpenseCategory(expense, localMatches, allAccounts, target, viewProfile)
                : undefined;
              return (
                <GmailExpenseCard
                  key={key}
                  payee={expense.payee}
                  details={alertDetails(expense)}
                  amount={rupees.format(expense.amount)}
                  category={chosen && { label: expenseCategoryLabel(chosen.name), color: chosen.color }}
                  localCategory={localCategory ? {
                    label: expenseCategoryLabel(localCategory),
                    color: categoriesByName.get(localCategory)?.color ?? theme.colors.textSecondary,
                  } : undefined}
                  ready={isReady(expense, draft)}
                  disabled={searching}
                  onReview={() => review(expense)}
                  onSwipe={() => importOrReview(expense)}
                />
              );
            })}
            {nextPage && (
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityState={{ busy: loadingOlder, disabled: searching }}
                style={[styles.secondary, styles.pagination]}
                onPress={() => search(true)}
                disabled={searching}
              >
                {loadingOlder && <ActivityIndicator size="small" color={theme.colors.primary} />}
                <Text accessibilityLiveRegion="polite" style={styles.secondaryText}>
                  {loadingOlder ? 'Loading older alerts…' : 'Load older alerts'}
                </Text>
              </TouchableOpacity>
            )}
            {searchError?.older && <Text accessibilityLiveRegion="polite" style={styles.muted}>{searchError.message}</Text>}
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
  localMatch: { gap: 6 },
  amount: { color: theme.colors.text, fontSize: 28, fontWeight: '700' },
  label: { color: theme.colors.text, fontSize: 16, fontWeight: '600' },
  muted: { color: theme.colors.textSecondary, fontSize: 14 },
  primary: { padding: 14, borderRadius: 10, backgroundColor: theme.colors.primary, alignItems: 'center' },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.5 },
  secondary: { alignItems: 'center', padding: 12 },
  pagination: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
  secondaryText: { color: theme.colors.primary, fontWeight: '600', fontSize: 15 },
});
