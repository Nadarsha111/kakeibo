export interface Account {
  id: number;
  name: string;
  type: 'savings' | 'checking' | 'credit_card' | 'loan' | 'investment' | 'cash';
  balance: number;
  currency: string;
  bankName?: string;
  accountNumber?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Transaction {
  id: number;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  date: string;
  paymentMethod: 'cash' | 'credit_card' | 'debit_card';
  accountId?: number;
  priority?: 'need' | 'want';
  createdAt: string;
  updatedAt: string;
}

export interface Category {
  id: number;
  name: string;
  color: string;
  icon: string;
  type: 'income' | 'expense';
  budgetLimit?: number;
}

export interface Budget {
  id: number;
  categoryId: number;
  amount: number;
  period: 'weekly' | 'monthly' | 'yearly';
  startDate: string;
  endDate: string;
}

// Extended Budget type with category information from JOIN queries
export interface BudgetWithCategory extends Budget {
  categoryName: string;
  categoryColor: string;
}

export interface AccountBalance {
  id: number;
  totalBalance: number;
  lastUpdated: string;
}

export interface Loan {
  id: number;
  borrowerName: string; // Person who borrowed the money when isLending = true
  borrowerContact?: string;
  lenderName?: string; // Person who lent the money when isLending = false
  lenderContact?: string;
  amount: number;
  lentDate: string;
  expectedReturnDate?: string;
  actualReturnDate?: string;
  returnedAmount: number;
  status: 'active' | 'partially_paid' | 'fully_paid' | 'overdue';
  description?: string;
  accountId?: number;
  isLending: boolean; // true for money lent out, false for borrowings
  createdAt: string;
  updatedAt: string;
}

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
