import { DatabaseConnector, getAccountService, getCardService, getCategoryService, getSettingsService, getTransactionService } from '../../database';
import type { Account } from '../../types';
import { readGmailPage } from './gmail';
import { parseSliceExpense, SLICE_SENDER, type SliceExpense } from './slice';

export interface GmailExpense extends SliceExpense {
  mailboxId: string;
  messageId: string;
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
