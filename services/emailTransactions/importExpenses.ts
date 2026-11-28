import { DatabaseConnector, getAccountService, getCardEmiService, getCardService, getCategoryService, getSettingsService, getTransactionService } from '../../database';
import type { Account, Transaction } from '../../types';
import type { ExpenseAlert } from './expenseAlert';
import { readGmailPage } from './gmail';
import { parseSbiCardEmi, parseSbiCardExpense, SBI_CARD_DOMAIN, SBI_CARD_SENDER } from './sbiCard';
import { parseSliceExpense, SLICE_SENDER } from './slice';

export interface GmailExpense extends ExpenseAlert {
  mailboxId: string;
  messageId: string;
}

export const NEW_EMI_PURCHASE = 0;

export function receiverKey(payee: string): string {
  return payee.normalize('NFC').trim().replace(/\s+/g, ' ').toLowerCase();
}

function dateAmountKey(date: string, amount: number): string {
  return `${date.slice(0, 10)}:${Math.round(amount * 100)}`;
}

export function getLocalExpensesForAlerts(expenses: GmailExpense[], profileId?: number): Map<string, Transaction[]> {
  const matches = new Map<string, Transaction[]>();
  if (!expenses.length) return matches;

  const dates = expenses.map(({ date }) => date).sort();
  const keys = new Set(expenses.map(({ date, amount }) => dateAmountKey(date, amount)));
  const local = getTransactionService().getTransactionsByDateRange(dates[0], dates[dates.length - 1], profileId);
  for (const transaction of local) {
    const key = dateAmountKey(transaction.date, transaction.amount);
    if (transaction.type !== 'expense' || !keys.has(key)) continue;
    const bucket = matches.get(key) ?? [];
    bucket.push(transaction);
    matches.set(key, bucket);
  }
  return matches;
}

export function findLocalExpenseCategory(
  expense: GmailExpense,
  matches: Map<string, Transaction[]>,
  accounts: Account[],
  target?: Account,
  viewProfileId?: number,
): string | undefined {
  const receiver = receiverKey(expense.payee);
  const profileId = target?.profileId ?? viewProfileId;
  const sameReceiver = ({ description }: Transaction) => !!receiver && receiverKey(description ?? '') === receiver;
  const candidates = (matches.get(dateAmountKey(expense.date, expense.amount)) ?? []).filter((item) =>
    item.category !== 'Transfer Out' && (profileId === undefined || item.profileId === profileId));

  const matchingAccounts = target ? [target.id] : accounts.filter((account) => {
    if (!isExpenseAccount(expense, account)) return false;
    const digits = account.accountNumber?.replace(/\D/g, '').slice(-4);
    return !digits || digits.length < 4 || digits === expense.lastFour;
  }).map(({ id }) => id);
  const onMatchingAccount = candidates.filter(({ accountId }) => accountId != null && matchingAccounts.includes(accountId));

  // Use the strongest group with evidence. A conflict in that group leaves the suggestion blank.
  const matchesByPriority = [onMatchingAccount.filter(sameReceiver)];
  if (profileId !== undefined) {
    matchesByPriority.push(candidates.filter(sameReceiver), onMatchingAccount);
  }
  const best = matchesByPriority.find((group) => group.length > 0) ?? [];
  const first = best[0];
  if (first && best.every((item) => item.category === first.category && item.profileId === first.profileId)) {
    return first.category;
  }
}

function importKey({ mailboxId, messageId }: Pick<GmailExpense, 'mailboxId' | 'messageId'>): string {
  return `gmail.imported.${mailboxId}.${messageId}`;
}

const gmailAlertSearch = {
  query: `{from:${SLICE_SENDER} from:${SBI_CARD_SENDER} (from:${SBI_CARD_DOMAIN} "Merchant EMI")} newer_than:30d`,
  acceptsSender: (sender: string) => sender === SLICE_SENDER || sender.endsWith(`@${SBI_CARD_DOMAIN}`),
};

export async function findGmailExpenses(page?: { mailboxId: string; token: string }) {
  const settings = getSettingsService();
  const search = {
    ...gmailAlertSearch,
    excludeMessage: (mailboxId: string, messageId: string) => settings.settingExists(importKey({ mailboxId, messageId })),
  };
  const result = await readGmailPage(search, (sender, bodies) => {
    for (const { text, mimeType } of bodies) {
      const expense = sender === SLICE_SENDER
        ? parseSliceExpense(text, mimeType)
        : parseSbiCardEmi(text, mimeType) ?? (sender === SBI_CARD_SENDER ? parseSbiCardExpense(text, mimeType) : null);
      if (expense) return expense;
    }
    return null;
  }, page);
  const expenses = result.items
    .map(({ messageId, value }) => ({ ...value, mailboxId: result.mailboxId, messageId }))
    .filter((expense) => !settings.settingExists(importKey(expense)));
  return { expenses, nextPage: result.nextPageToken ? { mailboxId: result.mailboxId, token: result.nextPageToken } : undefined };
}

export function isExpenseAccount(expense: GmailExpense, account: Account): boolean {
  return expense.accountKind === 'credit_card'
    ? account.type === 'credit_card'
    : account.type === 'checking' || account.type === 'savings';
}

export function getExpenseCategories() {
  return getCategoryService().getCategoriesByType('expense').filter(({ name }) => name !== 'Transfer Out');
}

export function hasPossibleDuplicate(expense: GmailExpense, account: Account): boolean {
  return getTransactionService().getTransactionsByDateRange(expense.date, expense.date, account.profileId)
    .some((transaction) => (transaction.accountId == null || transaction.accountId === account.id) &&
      transaction.type === 'expense' && Math.round(transaction.amount * 100) === Math.round(expense.amount * 100));
}

export function getMatchingEmiPurchases(expense: GmailExpense, account: Account): Transaction[] {
  return getTransactionService().getTransactionsByDateRange(expense.date, expense.date, account.profileId)
    .filter((transaction) => transaction.accountId === account.id &&
      transaction.type === 'expense' && transaction.category !== 'Transfer Out' &&
      Math.round(transaction.amount * 100) === Math.round(expense.amount * 100));
}

export function saveGmailEmi(
  expense: GmailExpense,
  accountId: number,
  cardId: number | null,
  category: string | null,
  purchaseId: number | null,
): 'imported' | 'already_imported' {
  const emi = expense.emi;
  if (!emi) throw new Error('Choose an EMI booking email.');
  return DatabaseConnector.getInstance().withTransaction(() => {
    const settings = getSettingsService();
    const key = importKey(expense);
    if (settings.settingExists(key)) return 'already_imported';
    const account = getAccountService().getAccountById(accountId);
    if (account?.type !== 'credit_card') throw new Error('Choose the credit card account used for the purchase.');
    const candidates = getMatchingEmiPurchases(expense, account);
    const purchase = candidates.find(({ id }) => id === purchaseId);
    if (!purchase && purchaseId !== NEW_EMI_PURCHASE && (purchaseId !== null || candidates.length)) {
      throw new Error('Choose an existing purchase or record a new purchase.');
    }
    if (!purchase && cardId !== null && !getCardService().getCardsForAccount(account.id).some(({ id }) => id === cardId)) {
      throw new Error('Choose a card on the selected account.');
    }
    const expenseCategory = purchase?.category ?? category;
    if (!expenseCategory || (!purchase && !getExpenseCategories().some(({ name }) => name === expenseCategory))) {
      throw new Error('Choose an expense category.');
    }

    const id = getCardEmiService().addEmiUnsafe({
      accountId, cardId: purchase ? purchase.cardId ?? null : cardId, profileId: account.profileId,
      name: purchase?.description?.trim() || expense.payee,
      category: expenseCategory,
      principal: emi.principal,
      interestRate: emi.interestRate,
      termMonths: emi.termMonths,
      installmentAmount: emi.installmentAmount,
      firstDueDate: emi.firstDueDate,
      date: expense.date,
      purchaseAmount: expense.amount,
      purchaseTransactionId: purchase?.id,
      remainingInstallments: emi.termMonths,
    });
    settings.setSetting(key, String(id));
    return 'imported';
  });
}

export function saveGmailExpense(
  expense: GmailExpense,
  accountId: number,
  cardId: number | null,
  category: string,
  confirmDuplicate: boolean,
): 'imported' | 'already_imported' | 'possible_duplicate' {
  if (expense.emi) throw new Error('Review the EMI plan before importing.');
  return DatabaseConnector.getInstance().withTransaction(() => {
    const settings = getSettingsService();
    const key = importKey(expense);
    if (settings.settingExists(key)) return 'already_imported';
    const account = getAccountService().getAccountById(accountId);
    if (!account || !isExpenseAccount(expense, account)) throw new Error('Choose a matching active account.');
    const cards = account.type === 'credit_card' ? getCardService().getCardsForAccount(account.id) : [];
    if (cards.length ? !cards.some((card) => card.id === cardId) : cardId !== null) {
      throw new Error('Choose the card used for this transaction.');
    }
    if (!getExpenseCategories().some(({ name }) => name === category)) throw new Error('Choose an expense category.');
    if (!confirmDuplicate && hasPossibleDuplicate(expense, account)) return 'possible_duplicate';

    const id = getTransactionService().addTransactionUnsafe({
      amount: expense.amount,
      date: expense.date,
      description: expense.payee,
      type: 'expense',
      profileId: account.profileId,
      accountId,
      cardId,
      category,
      paymentMethod: expense.accountKind === 'credit_card' ? 'credit_card' : 'debit_card',
    });
    settings.setSetting(key, String(id));
    return 'imported';
  });
}
