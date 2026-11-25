import { DatabaseConnector, getAccountService, getCardService, getCategoryService, getSettingsService, getTransactionService } from '../../database';
import type { Account, Transaction } from '../../types';
import { readGmailPage } from './gmail';
import { parseSliceExpense, SLICE_SENDER, type SliceExpense } from './slice';

export interface GmailExpense extends SliceExpense {
  mailboxId: string;
  messageId: string;
}

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

/** Prefer the same receiver, then the same account. Ambiguous matches only supply a category if they agree. */
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
  const candidates = matches.get(dateAmountKey(expense.date, expense.amount))?.filter((item) => {
    if (profileId !== undefined && item.profileId !== profileId) return false;
    if (item.accountId == null) return profileId !== undefined && sameReceiver(item);
    if (target) return item.accountId === target.id;
    if (!sameReceiver(item)) return false;
    return accounts.some((account) => {
      if (account.id !== item.accountId || !isExpenseAccount(expense, account)) return false;
      const digits = account.accountNumber?.replace(/\D/g, '').slice(-4);
      return !digits || digits.length < 4 || digits === expense.lastFour;
    });
  }) ?? [];

  const samePayee = candidates.filter(sameReceiver);
  const preferred = samePayee.length ? samePayee : candidates;
  const sameAccount = target ? preferred.filter((item) => item.accountId === target.id) : [];
  const best = sameAccount.length ? sameAccount : preferred;
  const first = best[0];
  if (first && best.every((item) => item.category === first.category && item.profileId === first.profileId)) {
    return first.category;
  }
}

function importKey({ mailboxId, messageId }: GmailExpense): string {
  return `gmail.imported.${mailboxId}.${messageId}`;
}

export async function findSliceExpenses(page?: { mailboxId: string; token: string }) {
  const result = await readGmailPage(SLICE_SENDER, (bodies) => {
    for (const { text, mimeType } of bodies) {
      const expense = parseSliceExpense(text, mimeType);
      if (expense) return expense;
    }
    return null;
  }, page);
  const settings = getSettingsService();
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

export function saveGmailExpense(
  expense: GmailExpense,
  accountId: number,
  cardId: number | null,
  category: string,
  confirmDuplicate: boolean,
): 'imported' | 'already_imported' | 'possible_duplicate' {
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
