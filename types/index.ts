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

export interface AccountBalance {
  id: number;
  totalBalance: number;
  lastUpdated: string;
}

export interface Loan {
  id: number;
  borrowerName: string;
  borrowerContact?: string;
  amount: number;
  lentDate: string;
  expectedReturnDate?: string;
  actualReturnDate?: string;
  returnedAmount: number;
  status: 'active' | 'partially_paid' | 'fully_paid' | 'overdue';
  description?: string;
  accountId?: number;
  createdAt: string;
  updatedAt: string;
}

export interface LoanSummary {
  totalLoaned: number;
  totalReturned: number;
  totalOutstanding: number;
  activeLoans: number;
  overdueLoans: number;
}
