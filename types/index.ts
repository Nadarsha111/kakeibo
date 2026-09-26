import type { RecurringFrequency } from "../utils/recurring";

/**
 * Profile for separating personal and business finances
 */
export interface Profile {
  id: number;
  name: string;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Represents a financial account (e.g., bank account, credit card, cash)
 */
export interface Account {
  id: number;
  profileId: number;
  name: string;
  type: "savings" | "checking" | "credit_card" | "loan" | "investment" | "cash";
  balance: number;
  currency: string;
  bankName?: string | null;
  accountNumber?: string | null;
  creditLimit?: number | null; // credit cards only
  billDay?: number | null; // credit cards only: day of the month the bill is due (1-31)
  // Credit cards and loans you owe: the bill falls due next month (grace period, early-month due
  // date) but is paid from the month-end salary, so it counts as money needed this month
  payAtMonthEnd?: boolean | number | null;
  isActive: boolean | number; // SQLite uses 1/0 for boolean
  // Loan-specific fields
  isLending?: boolean | number | null;
  loanPrincipal?: number | null;
  loanReturnedAmount?: number | null;
  loanStatus?: "active" | "partially_paid" | "fully_paid" | "overdue" | null;
  loanCounterpartyName?: string | null;
  loanCounterpartyContact?: string | null;
  loanLentDate?: string | null;
  loanExpectedReturnDate?: string | null;
  loanActualReturnDate?: string | null;
  // Installment-loan fields; a loan is an installment loan when loanTermMonths is set
  loanInterestRate?: number | null; // annual percentage, charged monthly on the outstanding principal
  loanTermMonths?: number | null;
  loanInstallmentAmount?: number | null;
  loanPaymentDay?: number | null; // day of month payments fall due
  loanNextDueDate?: string | null;
  loanInterestPaid?: number | null;
  description?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * One physical card on a credit card account. Most credit cards need nothing beyond the account
 * itself, but some banks issue two (or more) cards against one shared balance and credit limit,
 * each generating its own statement on its own day of the month. When an account has cards, its
 * own billDay/payAtMonthEnd are ignored in favor of each card's own settings, and transactions made
 * on that physical card are tagged with its id so its own bill can be worked out separately.
 */
export interface CreditCard {
  id: number;
  accountId: number;
  name: string;
  billDay?: number | null;
  payAtMonthEnd?: boolean | number | null;
  isActive: boolean | number;
  createdAt: string;
  updatedAt: string;
}

/**
 * A purchase on a credit card account converted to fixed monthly installments. The purchase itself
 * is recorded as a normal expense (so the shared balance reflects it right away, like any other
 * charge), and this plan says how much of it is billed each cycle instead of all at once: the
 * card's own bill line excludes its outstanding principal, and this shows up as its own "Needed
 * this month" line for just that month's installment, the same way a loan installment does.
 */
export interface CardEmi {
  id: number;
  accountId: number;
  /** Which physical card this was charged to, for an account that shares its balance across more than one. */
  cardId?: number | null;
  name: string;
  principal: number;
  returnedAmount: number;
  interestRate?: number | null; // annual percentage, charged monthly on the outstanding principal
  termMonths: number;
  installmentAmount: number;
  paymentDay?: number | null;
  nextDueDate?: string | null;
  interestPaid?: number | null;
  status: "active" | "fully_paid";
  isActive: boolean | number;
  createdAt: string;
  updatedAt: string;
}

/**
 * One account as shown in the balances card on Home, with the loan details it needs for loans.
 */
export interface AccountBalanceRow {
  accountId: number;
  name: string;
  type: Account["type"];
  closingBalance: number;
  isLending?: boolean | number | null;
  loanPrincipal?: number | null;
  loanReturnedAmount?: number | null;
  loanStatus?: Account["loanStatus"];
  loanTermMonths?: number | null;
  loanInstallmentAmount?: number | null;
  loanNextDueDate?: string | null;
  loanExpectedReturnDate?: string | null;
}

/**
 * One line of the assets-against-liabilities picture: an account, or a loan still being paid off.
 */
export interface NetWorthItem {
  id: number;
  name: string;
  type: Account["type"];
  amount: number; // always positive; which list it is in says whether it is owned or owed
}

export interface NetWorthSummary {
  assets: NetWorthItem[];
  liabilities: NetWorthItem[];
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

/**
 * Something that repeats on a schedule, like rent, a subscription or a salary. It is tracked as a
 * commitment and marked paid; the app does not post it automatically.
 */
export interface RecurringItem {
  id: number;
  profileId: number;
  name: string;
  amount: number;
  type: "income" | "expense" | "transfer"; // a transfer moves money between two of your accounts, e.g. into an FD
  category: string;
  frequency: RecurringFrequency;
  dueDay?: number | null; // day of the month it falls on, kept so a short month does not shift it
  nextDueDate: string;
  accountId?: number | null; // the account it is normally paid from (for a transfer, the one it leaves)
  toAccountId?: number | null; // for a transfer, the account the money goes into
  autoPost: boolean | number; // record it by itself when it falls due
  isActive: boolean | number;
  lastPaidDate?: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Represents a single income or expense transaction
 */
export interface Transaction {
  id: number;
  profileId: number;
  amount: number;
  type: "income" | "expense";
  category: string;
  description?: string | null;
  date: string;
  paymentMethod: "cash" | "credit_card" | "debit_card";
  accountId?: number | null;
  /** Which physical card this was charged to, for a credit card account that has more than one. */
  cardId?: number | null;
  priority?: "need" | "want" | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Represents a category for transactions
 */
export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string;
  type: "income" | "expense";
  budgetLimit?: number | null;
}

/**
 * Represents a budget for a specific category and period
 */
export interface Budget {
  id: number;
  categoryId: number;
  amount: number;
  period: "weekly" | "monthly" | "yearly";
  startDate: string;
  endDate: string;
}

/**
 * Budget information joined with its category details
 */
export interface BudgetWithCategory extends Budget {
  categoryName: string;
  categoryColor: string;
  categoryIcon: string;
}

/**
 * One line item extracted from an imported statement PDF, kept only to reconcile against what
 * you've already logged - it is never written into the transactions table by itself. Re-importing
 * the same account/month replaces its previous line items rather than duplicating them.
 */
export interface StatementLineItem {
  id: number;
  profileId: number;
  accountId: number;
  statementMonth: string; // "YYYY-MM", the month the statement covers
  date: string;
  description?: string | null;
  amount: number;
  direction: "debit" | "credit";
  createdAt: string;
}

/** A statement line item together with the local transaction it matches, if any. */
export interface ReconciledLineItem extends StatementLineItem {
  matchedTransactionId: number | null;
}
