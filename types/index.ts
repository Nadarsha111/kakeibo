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
  type: 'savings' | 'checking' | 'credit_card' | 'loan' | 'investment' | 'cash';
  balance: number;
  currency: string;
  bankName?: string | null;
  accountNumber?: string | null;
  isActive: boolean | number; // SQLite uses 1/0 for boolean
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
  type: 'income' | 'expense';
  category: string;
  description?: string | null;
  date: string;
  paymentMethod: 'cash' | 'credit_card' | 'debit_card';
  accountId?: number | null;
  priority?: 'need' | 'want' | null;
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
  type: 'income' | 'expense';
  budgetLimit?: number | null;
}

/**
 * Represents a loan or borrowing record
 */
export interface Loan {
  id: number;
  profileId: number;
  borrowerName: string;
  borrowerContact?: string | null;
  lenderName?: string | null;
  lenderContact?: string | null;
  amount: number;
  lentDate: string;
  expectedReturnDate?: string | null;
  actualReturnDate?: string | null;
  returnedAmount: number;
  status: 'active' | 'partially_paid' | 'fully_paid' | 'overdue';
  description?: string | null;
  accountId?: number | null;
  isLending: boolean | number; // SQLite uses 1/0 for boolean
  createdAt: string;
  updatedAt: string;
}

/**
 * Summary of all loan activities
 */
export interface LoanSummary {
  totalLoaned: number;
  totalBorrowed: number;
  totalLoanedReturned: number;
  totalBorrowedReturned: number;
  outstandingLoans: number;
  outstandingBorrowings: number;
  activeLoans: number;
  activeBorrowings: number;
  overdueLoans: number;
  overdueBorrowings: number;
}

/**
 * Represents a budget for a specific category and period
 */
export interface Budget {
  id: number;
  categoryId: number;
  amount: number;
  period: 'weekly' | 'monthly' | 'yearly';
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
 * Represents the total balance across all accounts at a point in time
 */
export interface AccountBalance {
  id: number;
  totalBalance: number;
  lastUpdated: string;
}