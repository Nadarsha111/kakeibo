import type { AccountBalanceRow } from '../types';
import { round2 } from './loanMath';

export interface LoanBalanceRow {
  accountId: number;
  name: string;
  /** What is still owed on the loan, always positive. */
  outstanding: number;
  /** A line of context: the monthly installment and its due date, or the date it is due back. */
  detail:
    | { kind: 'installment'; amount: number; dueDate: string | null }
    | { kind: 'dueBack'; dueDate: string }
    | null;
}

export type AccountCategory = Exclude<AccountBalanceRow['type'], 'loan'>;

export interface BalanceCategory {
  type: AccountCategory;
  label: string;
  /** The sum of exactly the rows in `accounts`; negative for credit cards, which are money owed. */
  total: number;
  /** The category's accounts, biggest balance first (whether positive or negative). */
  accounts: AccountBalanceRow[];
}

// The order categories appear in: money you can spend first, then what is set aside, then debt
const CATEGORIES: Array<{ type: AccountCategory; label: string }> = [
  { type: 'checking', label: 'Checking' },
  { type: 'cash', label: 'Cash' },
  { type: 'savings', label: 'Savings' },
  { type: 'investment', label: 'Investments' },
  { type: 'credit_card', label: 'Credit Cards' },
];

export interface GroupedBalances {
  /** Every account except loans, in the order given. */
  accounts: AccountBalanceRow[];
  /** The same accounts grouped by type; categories with no accounts are left out. */
  categories: BalanceCategory[];
  /** The sum of exactly the rows in `accounts`, so the list always adds up to it. */
  accountsTotal: number;
  /** Loans you borrowed and are still paying back. */
  youOwe: LoanBalanceRow[];
  /** Loans you lent that have not all come back. */
  owedToYou: LoanBalanceRow[];
  totalOwed: number;
  totalLent: number;
  /** Accounts total, plus what is owed to you, minus what you owe. */
  netWorth: number;
}

const toLoanRow = (row: AccountBalanceRow, lent: boolean): LoanBalanceRow => {
  const outstanding = round2((row.loanPrincipal || 0) - (row.loanReturnedAmount || 0));
  let detail: LoanBalanceRow['detail'] = null;

  if (row.loanTermMonths && (row.loanInstallmentAmount || 0) > 0) {
    // Only what you pay matters here; an installment on money you lent is the other person's
    if (!lent) detail = { kind: 'installment', amount: row.loanInstallmentAmount!, dueDate: row.loanNextDueDate ?? null };
  } else if (row.loanExpectedReturnDate) {
    detail = { kind: 'dueBack', dueDate: row.loanExpectedReturnDate };
  }

  return { accountId: row.accountId, name: row.name, outstanding, detail };
};

/**
 * Splits the balance rows into ordinary accounts and loans. Loans are not balances you can spend,
 * so they are kept out of the accounts total and listed on their own, with net worth as the line
 * that brings everything together.
 */
export function groupAccountBalances(rows: AccountBalanceRow[]): GroupedBalances {
  const accounts = rows.filter((row) => row.type !== 'loan');
  const activeLoans = rows.filter((row) => row.type === 'loan' && row.loanStatus !== 'fully_paid');

  const isLent = (row: AccountBalanceRow) => row.isLending === 1 || row.isLending === true;
  const stillOwed = (loan: LoanBalanceRow) => loan.outstanding > 0;

  const youOwe = activeLoans.filter((row) => !isLent(row)).map((row) => toLoanRow(row, false)).filter(stillOwed);
  const owedToYou = activeLoans.filter(isLent).map((row) => toLoanRow(row, true)).filter(stillOwed);

  const sum = (loans: LoanBalanceRow[]) => round2(loans.reduce((total, loan) => total + loan.outstanding, 0));
  const accountsTotal = round2(accounts.reduce((total, row) => total + row.closingBalance, 0));
  const totalOwed = sum(youOwe);
  const totalLent = sum(owedToYou);

  const categories = CATEGORIES.map(({ type, label }) => {
    const members = accounts
      .filter((row) => row.type === type)
      .sort((a, b) => Math.abs(b.closingBalance) - Math.abs(a.closingBalance));
    return { type, label, total: round2(members.reduce((total, row) => total + row.closingBalance, 0)), accounts: members };
  }).filter((category) => category.accounts.length > 0);

  return { accounts, categories, accountsTotal, youOwe, owedToYou, totalOwed, totalLent, netWorth: round2(accountsTotal + totalLent - totalOwed) };
}
