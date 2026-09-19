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
