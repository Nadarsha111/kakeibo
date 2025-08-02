export interface Transaction {
  id: number;
  amount: number;
  type: 'income' | 'expense';
  category: string;
  description: string;
  date: string;
  paymentMethod: 'cash' | 'credit_card' | 'debit_card';
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
