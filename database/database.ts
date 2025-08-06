import * as SQLite from 'expo-sqlite';
import { Transaction, Category, Budget, AccountBalance, Account, Loan, LoanSummary } from '../types';
import DatabaseSeeder from '../utils/databaseSeeder';

class DatabaseService {
  private db: SQLite.SQLiteDatabase;

  constructor() {
    this.db = SQLite.openDatabaseSync('kakeibo.db');
    this.initDatabase();
  }

  private initDatabase = () => {
    try {
      // Create accounts table
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('savings', 'checking', 'credit_card', 'loan', 'investment', 'cash')),
          balance REAL NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'USD',
          bankName TEXT,
          accountNumber TEXT,
          isActive INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
      `);

      // Create transactions table
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          amount REAL NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          category TEXT NOT NULL,
          description TEXT,
          date TEXT NOT NULL,
          paymentMethod TEXT NOT NULL CHECK (paymentMethod IN ('cash', 'credit_card', 'debit_card')),
          accountId INTEGER,
          priority TEXT CHECK (priority IN ('need', 'want')),
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (accountId) REFERENCES accounts (id)
        );
      `);

      // Add priority and accountId columns to existing transactions if they don't exist
      this.addPriorityColumnIfNotExists();
      this.addAccountIdColumnIfNotExists();

      // Create categories table
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE,
          color TEXT NOT NULL,
          icon TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          budgetLimit REAL
        );
      `);

      // Create budgets table
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS budgets (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          categoryId INTEGER NOT NULL,
          amount REAL NOT NULL,
          period TEXT NOT NULL CHECK (period IN ('weekly', 'monthly', 'yearly')),
          startDate TEXT NOT NULL,
          endDate TEXT NOT NULL,
          FOREIGN KEY (categoryId) REFERENCES categories (id)
        );
      `);

      // Create account_balance table for monthly balances per account
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS account_balance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          accountId INTEGER NOT NULL,
          year INTEGER NOT NULL,
          month INTEGER NOT NULL,
          closingBalance REAL NOT NULL,
          lastUpdated TEXT NOT NULL,
          UNIQUE(accountId, year, month),
          FOREIGN KEY (accountId) REFERENCES accounts (id)
        );
      `);

      // Create loans table for tracking money lent to others
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS loans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          borrowerName TEXT NOT NULL,
          borrowerContact TEXT,
          amount REAL NOT NULL,
          lentDate TEXT NOT NULL,
          expectedReturnDate TEXT,
          actualReturnDate TEXT,
          returnedAmount REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL CHECK (status IN ('active', 'partially_paid', 'fully_paid', 'overdue')) DEFAULT 'active',
          description TEXT,
          accountId INTEGER,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL,
          FOREIGN KEY (accountId) REFERENCES accounts (id)
        );
      `);

      // Create app_settings table for persistent user preferences
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id INTEGER PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
      `);

      // Insert default categories
      this.insertDefaultCategories();
      // DatabaseSeeder.seedProductionData();
      // Insert default accounts
      // this.insertDefaultAccounts();
    } catch (error) {
      console.error('Error initializing database:', error);
    }
  };
 getDatabaseInstance() {
    return this.db;
  }
  private addAccountIdColumnIfNotExists = () => {
    try {
      // Check if accountId column exists
      const tableInfo = this.db.getAllSync("PRAGMA table_info(transactions)");
      const hasColumn = tableInfo.some((row: any) => row.name === 'accountId');
      
      if (!hasColumn) {
        this.db.execSync(`
          ALTER TABLE transactions 
          ADD COLUMN accountId INTEGER REFERENCES accounts(id)
        `);
        console.log('Added accountId column to transactions table');
      }
    } catch (error) {
      console.error('Error adding accountId column:', error);
    }
  };

  private addPriorityColumnIfNotExists = () => {
    try {
      // Check if priority column exists
      const tableInfo = this.db.getAllSync("PRAGMA table_info(transactions)");
      const hasColumn = tableInfo.some((row: any) => row.name === 'priority');
      
      if (!hasColumn) {
        this.db.execSync(`
          ALTER TABLE transactions 
          ADD COLUMN priority TEXT CHECK (priority IN ('need', 'want'))
        `);
        console.log('Added priority column to transactions table');
      }
    } catch (error) {
      console.error('Error adding priority column:', error);
    }
  };

  private insertDefaultCategories = () => {
    const defaultCategories = [
      { name: 'Transport', color: '#10b981', icon: '🚗', type: 'expense' },
      { name: 'Restaurant', color: '#ef4444', icon: '🍽️', type: 'expense' },
      { name: 'Shopping', color: '#f97316', icon: '🛍️', type: 'expense' },
      { name: 'Food', color: '#3b82f6', icon: '🍎', type: 'expense' },
      { name: 'Gift', color: '#06b6d4', icon: '🎁', type: 'expense' },
      { name: 'Free time', color: '#8b5cf6', icon: '🎮', type: 'expense' },
      { name: 'Family', color: '#ec4899', icon: '👨‍👩‍👧‍👦', type: 'expense' },
      { name: 'Health', color: '#14b8a6', icon: '🏥', type: 'expense' },
      { name: 'Salary', color: '#22c55e', icon: '💰', type: 'income' },
      { name: 'Investment', color: '#6366f1', icon: '📈', type: 'income' },
      { name: 'Loan Repayment', color: '#059669', icon: '💸', type: 'income' },
    ];

    defaultCategories.forEach((category) => {
      try {
        this.db.runSync(
          'INSERT OR IGNORE INTO categories (name, color, icon, type) VALUES (?, ?, ?, ?)',
          [category.name, category.color, category.icon, category.type]
        );
      } catch (error) {
        console.log('Category already exists:', category.name);
      }
    });

    // Add sample transactions for testing
  };

  private insertDefaultAccounts = () => {
    // Only insert default accounts if none exist
    const existingAccounts = this.db.getAllSync('SELECT id FROM accounts');
    if (existingAccounts.length === 0) {
      const defaultAccounts = [
        { name: 'Cash Wallet', type: 'cash', balance: 0, currency: 'USD' },
        { name: 'Main Checking', type: 'checking', balance: 0, currency: 'USD', bankName: 'Bank of America' },
        { name: 'Savings Account', type: 'savings', balance: 0, currency: 'USD', bankName: 'Bank of America' },
        { name: 'Credit Card', type: 'credit_card', balance: 0, currency: 'USD', bankName: 'Chase' },
      ];

      defaultAccounts.forEach((account) => {
        try {
          const now = new Date().toISOString();
          this.db.runSync(
            'INSERT INTO accounts (name, type, balance, currency, bankName, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
            [account.name, account.type, account.balance, account.currency, account.bankName || null, now, now]
          );
        } catch (error) {
          console.log('Account already exists:', account.name);
        }
      });
    }
  };

  

  // Transaction methods
  addTransaction = (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): number => {
    try {
      const now = new Date().toISOString();
      const result = this.db.runSync(
        `INSERT INTO transactions (amount, type, category, description, date, paymentMethod, accountId, priority, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [transaction.amount, transaction.type, transaction.category, transaction.description, 
         transaction.date, transaction.paymentMethod, transaction.accountId || null, transaction.priority || null, now, now]
      );
      
      // Update account balance if account is specified
      if (transaction.accountId) {
        this.updateAccountBalanceForTransaction(transaction.accountId, transaction.amount, transaction.type);
      }
      
      this.updateAccountBalance(transaction.amount, transaction.type);
      
      console.log('Transaction added:', {
        id: result.lastInsertRowId,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        date: transaction.date,
        accountId: transaction.accountId
      });
      
      return result.lastInsertRowId;
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
    }
  };

  private updateAccountBalanceForTransaction = (accountId: number, amount: number, type: 'income' | 'expense'): void => {
    try {
      const account = this.getAccountById(accountId);
      if (account) {
        const balanceChange = type === 'income' ? amount : -amount;
        const newBalance = account.balance + balanceChange;
        
        this.updateAccount(accountId, { balance: newBalance });
      }
    } catch (error) {
      console.error('Error updating account balance for transaction:', error);
    }
  };

  getTransactions = (limit?: number, offset?: number): Transaction[] => {
    try {
      const query = limit 
        ? 'SELECT * FROM transactions ORDER BY date DESC LIMIT ? OFFSET ?'
        : 'SELECT * FROM transactions ORDER BY date DESC';
      const params = limit ? [limit, offset || 0] : [];

      return this.db.getAllSync(query, params) as Transaction[];
    } catch (error) {
      console.error('Error getting transactions:', error);
      return [];
    }
  };

  getTransactionsByDateRange = (startDate: string, endDate: string, includeCategory: boolean = false): Array<Transaction & { categoryName?: string }> => {
    try {
      if (includeCategory) {
        const query = `
          SELECT 
            t.*,
            c.name as categoryName
          FROM transactions t
          LEFT JOIN categories c ON t.category = c.name
          WHERE DATE(t.date) BETWEEN DATE(?) AND DATE(?)
          ORDER BY t.date DESC, t.createdAt DESC
        `;
        return this.db.getAllSync(query, [startDate, endDate]) as Array<Transaction & { categoryName?: string }>;
      } else {
        return this.db.getAllSync(
          'SELECT * FROM transactions WHERE date BETWEEN ? AND ? ORDER BY date DESC',
          [startDate, endDate]
        ) as Transaction[];
      }
    } catch (error) {
      console.error('Error getting transactions by date range:', error);
      return [];
    }
  };

  // Account methods
  getAccounts = (): Account[] => {
    try {
      const accounts = this.db.getAllSync('SELECT * FROM accounts WHERE isActive = 1 ORDER BY name');
      return accounts as Account[];
    } catch (error) {
      console.error('Error getting accounts:', error);
      return [];
    }
  };

  addAccount = (account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): number => {
    try {
      const now = new Date().toISOString();
      const result = this.db.runSync(
        `INSERT INTO accounts (name, type, balance, currency, bankName, accountNumber, isActive, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [account.name, account.type, account.balance, account.currency, 
         account.bankName || null, account.accountNumber || null, account.isActive ? 1 : 0, now, now]
      );
      
      console.log('Account added:', { id: result.lastInsertRowId, name: account.name });
      return result.lastInsertRowId;
    } catch (error) {
      console.error('Error adding account:', error);
      throw error;
    }
  };

  updateAccount = (id: number, account: Partial<Omit<Account, 'id' | 'createdAt'>>): void => {
    try {
      const now = new Date().toISOString();
      const fields = [];
      const values = [];
      
      if (account.name !== undefined) {
        fields.push('name = ?');
        values.push(account.name);
      }
      if (account.type !== undefined) {
        fields.push('type = ?');
        values.push(account.type);
      }
      if (account.balance !== undefined) {
        fields.push('balance = ?');
        values.push(account.balance);
      }
      if (account.currency !== undefined) {
        fields.push('currency = ?');
        values.push(account.currency);
      }
      if (account.bankName !== undefined) {
        fields.push('bankName = ?');
        values.push(account.bankName);
      }
      if (account.accountNumber !== undefined) {
        fields.push('accountNumber = ?');
        values.push(account.accountNumber);
      }
      if (account.isActive !== undefined) {
        fields.push('isActive = ?');
        values.push(account.isActive ? 1 : 0);
      }
      
      fields.push('updatedAt = ?');
      values.push(now);
      values.push(id);
      
      this.db.runSync(
        `UPDATE accounts SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
      
      console.log('Account updated:', id);
    } catch (error) {
      console.error('Error updating account:', error);
      throw error;
    }
  };

  deleteAccount = (id: number): void => {
    try {
      // Soft delete - mark as inactive
      this.db.runSync('UPDATE accounts SET isActive = 0 WHERE id = ?', [id]);
      console.log('Account deleted (marked inactive):', id);
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  };

  getAccountById = (id: number): Account | null => {
    try {
      const account = this.db.getFirstSync('SELECT * FROM accounts WHERE id = ? AND isActive = 1', [id]);
      return account as Account || null;
    } catch (error) {
      console.error('Error getting account by id:', error);
      return null;
    }
  };

  getTotalAccountsBalance = (): number => {
    try {
      const result = this.db.getFirstSync('SELECT SUM(balance) as total FROM accounts WHERE isActive = 1');
      return (result as any)?.total || 0;
    } catch (error) {
      console.error('Error getting total accounts balance:', error);
      return 0;
    }
  };

  // Category methods
  getCategories = (): Category[] => {
    try {
      return this.db.getAllSync('SELECT * FROM categories ORDER BY name') as Category[];
    } catch (error) {
      console.error('Error getting categories:', error);
      return [];
    }
  };

  // Account balance methods
  getAccountBalance = (): AccountBalance | null => {
    try {
      // Get total balance from current month's account balances
      const now = new Date();
      const currentYear = now.getFullYear();
      const currentMonth = now.getMonth() + 1;
      
      const result = this.db.getFirstSync(
        'SELECT SUM(closingBalance) as totalBalance FROM account_balance WHERE year = ? AND month = ?',
        [currentYear, currentMonth]
      ) as { totalBalance: number | null };
      
      if (result && result.totalBalance !== null) {
        return {
          id: 1,
          totalBalance: result.totalBalance,
          lastUpdated: new Date().toISOString()
        } as AccountBalance;
      }
      
      // Fallback to sum of current account balances if no monthly data
      const fallbackResult = this.db.getFirstSync(
        'SELECT SUM(balance) as totalBalance FROM accounts WHERE isActive = 1'
      ) as { totalBalance: number | null };
      
      return {
        id: 1,
        totalBalance: fallbackResult?.totalBalance || 0,
        lastUpdated: new Date().toISOString()
      } as AccountBalance;
    } catch (error) {
      console.error('Error getting account balance:', error);
      return null;
    }
  };

  private updateAccountBalance = (amount: number, type: 'income' | 'expense') => {
    try {
      // This method is now deprecated as we use per-account balances
      // Individual account balances are updated in updateAccountBalanceForTransaction
      console.log('Global account balance update skipped - using per-account tracking');
    } catch (error) {
      console.error('Error updating account balance:', error);
    }
  };

  // Update or insert monthly account balance for a specific account
  updateMonthlyAccountBalance = (accountId: number, year: number, month: number, closingBalance: number): void => {
    try {
      const now = new Date().toISOString();
      this.db.runSync(
        `INSERT OR REPLACE INTO account_balance (accountId, year, month, closingBalance, lastUpdated)
         VALUES (?, ?, ?, ?, ?)`,
        [accountId, year, month, closingBalance, now]
      );
    } catch (error) {
      console.error('Error updating monthly account balance:', error);
    }
  };

  // Summary methods
  getCategorySummary = (startDate: string, endDate: string): {category: string, amount: number, color: string}[] => {
    try {
      return this.db.getAllSync(
        `SELECT t.category, SUM(t.amount) as amount, c.color 
         FROM transactions t 
         JOIN categories c ON t.category = c.name 
         WHERE t.type = 'expense' AND t.date BETWEEN ? AND ? 
         GROUP BY t.category, c.color 
         ORDER BY amount DESC`,
        [startDate, endDate]
      ) as {category: string, amount: number, color: string}[];
    } catch (error) {
      console.error('Error getting category summary:', error);
      return [];
    }
  };

  getTotalExpenses = (startDate: string, endDate: string): number => {
    try {
      const result = this.db.getFirstSync(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'expense' AND date BETWEEN ? AND ?",
        [startDate, endDate]
      ) as {total: number | null};
      return result?.total || 0;
    } catch (error) {
      console.error('Error getting total expenses:', error);
      return 0;
    }
  };

  getTotalIncome = (startDate: string, endDate: string): number => {
    try {
      const result = this.db.getFirstSync(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'income' AND date BETWEEN ? AND ?",
        [startDate, endDate]
      ) as {total: number | null};
      return result?.total || 0;
    } catch (error) {
      console.error('Error getting total income:', error);
      return 0;
    }
  };

  // Settings methods for persistent user preferences
  getSetting = (key: string): string | null => {
    try {
      const result = this.db.getFirstSync(
        'SELECT value FROM app_settings WHERE key = ?',
        [key]
      ) as {value: string} | null;
      return result?.value || null;
    } catch (error) {
      console.error('Error getting setting:', error);
      return null;
    }
  };

  setSetting = (key: string, value: string): void => {
    try {
      const now = new Date().toISOString();
      this.db.runSync(
        'INSERT OR REPLACE INTO app_settings (key, value, updatedAt) VALUES (?, ?, ?)',
        [key, value, now]
      );
    } catch (error) {
      console.error('Error setting preference:', error);
    }
  };

  getAllSettings = (): Record<string, string> => {
    try {
      const results = this.db.getAllSync(
        'SELECT key, value FROM app_settings'
      ) as {key: string, value: string}[];
      
      const settings: Record<string, string> = {};
      results.forEach(row => {
        settings[row.key] = row.value;
      });
      return settings;
    } catch (error) {
      console.error('Error getting all settings:', error);
      return {};
    }
  };

  deleteSetting = (key: string): void => {
    try {
      this.db.runSync('DELETE FROM app_settings WHERE key = ?', [key]);
    } catch (error) {
      console.error('Error deleting setting:', error);
    }
  };

  // Category management methods
  addCategory = (category: Omit<Category, 'id'>): boolean => {
    try {
      this.db.runSync(
        'INSERT INTO categories (name, color, icon, type, budgetLimit) VALUES (?, ?, ?, ?, ?)',
        [category.name, category.color, category.icon, category.type, category.budgetLimit || null]
      );
      return true;
    } catch (error) {
      console.error('Error adding category:', error);
      return false;
    }
  };

  updateCategory = (id: number, category: Partial<Omit<Category, 'id'>>): boolean => {
    try {
      const fields = [];
      const values = [];
      
      if (category.name !== undefined) {
        fields.push('name = ?');
        values.push(category.name);
      }
      if (category.color !== undefined) {
        fields.push('color = ?');
        values.push(category.color);
      }
      if (category.icon !== undefined) {
        fields.push('icon = ?');
        values.push(category.icon);
      }
      if (category.type !== undefined) {
        fields.push('type = ?');
        values.push(category.type);
      }
      if (category.budgetLimit !== undefined) {
        fields.push('budgetLimit = ?');
        values.push(category.budgetLimit);
      }

      if (fields.length === 0) return false;

      values.push(id);
      this.db.runSync(
        `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
      return true;
    } catch (error) {
      console.error('Error updating category:', error);
      return false;
    }
  };

  deleteCategory = (id: number): boolean => {
    try {
      // Check if category is being used in transactions
      const usageCount = this.db.getFirstSync(
        'SELECT COUNT(*) as count FROM transactions WHERE category = (SELECT name FROM categories WHERE id = ?)',
        [id]
      ) as { count: number };

      if (usageCount.count > 0) {
        throw new Error('Cannot delete category that is being used in transactions');
      }

      this.db.runSync('DELETE FROM categories WHERE id = ?', [id]);
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      return false;
    }
  };

  getCategoryById = (id: number): Category | null => {
    try {
      return this.db.getFirstSync('SELECT * FROM categories WHERE id = ?', [id]) as Category | null;
    } catch (error) {
      console.error('Error getting category by id:', error);
      return null;
    }
  };

  getCategoriesByType = (type: 'income' | 'expense'): Category[] => {
    try {
      return this.db.getAllSync('SELECT * FROM categories WHERE type = ? ORDER BY name', [type]) as Category[];
    } catch (error) {
      console.error('Error getting categories by type:', error);
      return [];
    }
  };

  // Data export methods
  getAllTransactionsForExport = (): Array<Transaction & { categoryName?: string }> => {
    try {
      const query = `
        SELECT 
          t.*,
          c.name as categoryName
        FROM transactions t
        LEFT JOIN categories c ON t.category = c.name
        ORDER BY t.date DESC, t.createdAt DESC
      `;
      return this.db.getAllSync(query) as Array<Transaction & { categoryName?: string }>;
    } catch (error) {
      console.error('Error getting transactions for export:', error);
      return [];
    }
  };

  getExportSummary = () => {
    try {
      const totalTransactions = this.db.getFirstSync('SELECT COUNT(*) as count FROM transactions') as { count: number };
      const totalIncome = this.db.getFirstSync('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = "income"') as { total: number };
      const totalExpense = this.db.getFirstSync('SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = "expense"') as { total: number };
      const dateRange = this.db.getFirstSync(`
        SELECT 
          MIN(date) as earliestDate,
          MAX(date) as latestDate
        FROM transactions
      `) as { earliestDate: string; latestDate: string };
      
      return {
        totalTransactions: totalTransactions.count,
        totalIncome: totalIncome.total,
        totalExpense: totalExpense.total,
        earliestDate: dateRange.earliestDate,
        latestDate: dateRange.latestDate,
      };
    } catch (error) {
      console.error('Error getting export summary:', error);
      return {
        totalTransactions: 0,
        totalIncome: 0,
        totalExpense: 0,
        earliestDate: null,
        latestDate: null,
      };
    }
  };

  // Need/Want analysis methods
  getNeedWantSummary = (dateRange?: { startDate: string; endDate: string }) => {
    try {
      let baseQuery = `
        SELECT 
          priority,
          COALESCE(SUM(amount), 0) as total,
          COUNT(*) as count
        FROM transactions 
        WHERE type = 'expense' AND priority IS NOT NULL
      `;
      
      let params: string[] = [];
      if (dateRange) {
        baseQuery += ` AND DATE(date) BETWEEN DATE(?) AND DATE(?)`;
        params = [dateRange.startDate, dateRange.endDate];
      }
      
      baseQuery += ` GROUP BY priority`;
      
      const results = this.db.getAllSync(baseQuery, params) as Array<{
        priority: 'need' | 'want';
        total: number;
        count: number;
      }>;
      
      const summary = {
        needs: { total: 0, count: 0 },
        wants: { total: 0, count: 0 }
      };
      
      results.forEach(row => {
        if (row.priority === 'need') {
          summary.needs = { total: row.total, count: row.count };
        } else if (row.priority === 'want') {
          summary.wants = { total: row.total, count: row.count };
        }
      });
      
      return summary;
    } catch (error) {
      console.error('Error getting need/want summary:', error);
      return {
        needs: { total: 0, count: 0 },
        wants: { total: 0, count: 0 }
      };
    }
  };

  getNeedWantByCategory = (dateRange?: { startDate: string; endDate: string }) => {
    try {
      let baseQuery = `
        SELECT 
          category,
          priority,
          COALESCE(SUM(amount), 0) as total,
          COUNT(*) as count
        FROM transactions 
        WHERE type = 'expense' AND priority IS NOT NULL
      `;
      
      let params: string[] = [];
      if (dateRange) {
        baseQuery += ` AND DATE(date) BETWEEN DATE(?) AND DATE(?)`;
        params = [dateRange.startDate, dateRange.endDate];
      }
      
      baseQuery += ` GROUP BY category, priority ORDER BY total DESC`;
      
      return this.db.getAllSync(baseQuery, params) as Array<{
        category: string;
        priority: 'need' | 'want';
        total: number;
        count: number;
      }>;
    } catch (error) {
      console.error('Error getting need/want by category:', error);
      return [];
    }
  };

  // Returns array of { accountId, name, closingBalance } for the given year/month
  getMonthlyAccountBalances = (year: number, month: number): Array<{ accountId: number, name: string, closingBalance: number }> => {
    try {
      return this.db.getAllSync(
        `SELECT a.id as accountId, a.name, COALESCE(ab.closingBalance, a.balance) as closingBalance
         FROM accounts a
         LEFT JOIN account_balance ab ON a.id = ab.accountId AND ab.year = ? AND ab.month = ?
         WHERE a.isActive = 1
         ORDER BY a.name`,
        [year, month]
      ) as Array<{ accountId: number, name: string, closingBalance: number }>;
    } catch (error) {
      console.error('Error getting monthly account balances:', error);
      return [];
    }
  };

  // Loan management methods
  addLoan = (loan: {
    borrowerName: string;
    borrowerContact?: string;
    amount: number;
    lentDate: string;
    expectedReturnDate?: string;
    description?: string;
    accountId?: number;
  }): number => {
    try {
      const now = new Date().toISOString();
      const result = this.db.runSync(
        `INSERT INTO loans (borrowerName, borrowerContact, amount, lentDate, expectedReturnDate, description, accountId, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          loan.borrowerName,
          loan.borrowerContact || null,
          loan.amount,
          loan.lentDate,
          loan.expectedReturnDate || null,
          loan.description || null,
          loan.accountId || null,
          now,
          now
        ]
      );

      // Update account balance if account is specified (subtract the lent amount)
      if (loan.accountId) {
        this.updateAccountBalanceForTransaction(loan.accountId, loan.amount, 'expense');
      }

      console.log('Loan added:', { id: result.lastInsertRowId, borrower: loan.borrowerName, amount: loan.amount });
      return result.lastInsertRowId;
    } catch (error) {
      console.error('Error adding loan:', error);
      throw error;
    }
  };

  getLoans = (status?: 'active' | 'partially_paid' | 'fully_paid' | 'overdue'): Loan[] => {
    try {
      let query = 'SELECT * FROM loans';
      const params: any[] = [];
      
      if (status) {
        query += ' WHERE status = ?';
        params.push(status);
      }
      
      query += ' ORDER BY lentDate DESC';
      
      return this.db.getAllSync(query, params) as Loan[];
    } catch (error) {
      console.error('Error getting loans:', error);
      return [];
    }
  };

  getLoanById = (id: number): Loan | null => {
    try {
      return this.db.getFirstSync('SELECT * FROM loans WHERE id = ?', [id]) as Loan | null;
    } catch (error) {
      console.error('Error getting loan by id:', error);
      return null;
    }
  };

  recordLoanPayment = (loanId: number, paymentAmount: number, paymentDate: string): void => {
    try {
      const loan = this.getLoanById(loanId);
      if (!loan) {
        throw new Error('Loan not found');
      }

      const newReturnedAmount = loan.returnedAmount + paymentAmount;
      const now = new Date().toISOString();
      
      // Determine new status
      let newStatus = 'active';
      if (newReturnedAmount >= loan.amount) {
        newStatus = 'fully_paid';
      } else if (newReturnedAmount > 0) {
        newStatus = 'partially_paid';
      }

      // Update loan
      this.db.runSync(
        `UPDATE loans SET 
         returnedAmount = ?, 
         status = ?, 
         actualReturnDate = ?, 
         updatedAt = ? 
         WHERE id = ?`,
        [
          newReturnedAmount,
          newStatus,
          newStatus === 'fully_paid' ? paymentDate : (loan.actualReturnDate || null),
          now,
          loanId
        ]
      );

      // Add income transaction if account is specified
      if (loan.accountId) {
        this.addTransaction({
          amount: paymentAmount,
          type: 'income',
          category: 'Loan Repayment',
          description: `Loan repayment from ${loan.borrowerName}`,
          date: paymentDate,
          paymentMethod: 'cash',
          accountId: loan.accountId
        });
      }

      console.log('Loan payment recorded:', { loanId, paymentAmount, newStatus });
    } catch (error) {
      console.error('Error recording loan payment:', error);
      throw error;
    }
  };

  updateLoan = (id: number, updates: {
    borrowerName?: string;
    borrowerContact?: string;
    expectedReturnDate?: string;
    description?: string;
    status?: 'active' | 'partially_paid' | 'fully_paid' | 'overdue';
  }): void => {
    try {
      const fields = [];
      const values = [];
      
      if (updates.borrowerName !== undefined) {
        fields.push('borrowerName = ?');
        values.push(updates.borrowerName);
      }
      if (updates.borrowerContact !== undefined) {
        fields.push('borrowerContact = ?');
        values.push(updates.borrowerContact);
      }
      if (updates.expectedReturnDate !== undefined) {
        fields.push('expectedReturnDate = ?');
        values.push(updates.expectedReturnDate);
      }
      if (updates.description !== undefined) {
        fields.push('description = ?');
        values.push(updates.description);
      }
      if (updates.status !== undefined) {
        fields.push('status = ?');
        values.push(updates.status);
      }

      fields.push('updatedAt = ?');
      values.push(new Date().toISOString());
      values.push(id);

      this.db.runSync(
        `UPDATE loans SET ${fields.join(', ')} WHERE id = ?`,
        values
      );

      console.log('Loan updated:', id);
    } catch (error) {
      console.error('Error updating loan:', error);
      throw error;
    }
  };

  deleteLoan = (id: number): void => {
    try {
      // Get loan details before deletion
      const loan = this.getLoanById(id);
      if (!loan) {
        throw new Error('Loan not found');
      }

      // If loan had payments, we might want to reverse the account balance
      // For now, we'll just delete the loan record
      this.db.runSync('DELETE FROM loans WHERE id = ?', [id]);
      
      console.log('Loan deleted:', id);
    } catch (error) {
      console.error('Error deleting loan:', error);
      throw error;
    }
  };

  getLoanSummary = (): LoanSummary => {
    try {
      const summary = this.db.getFirstSync(`
        SELECT 
          COALESCE(SUM(amount), 0) as totalLoaned,
          COALESCE(SUM(returnedAmount), 0) as totalReturned,
          COALESCE(SUM(amount - returnedAmount), 0) as totalOutstanding,
          COUNT(CASE WHEN status IN ('active', 'partially_paid') THEN 1 END) as activeLoans,
          COUNT(CASE WHEN status = 'overdue' THEN 1 END) as overdueLoans
        FROM loans
      `) as any;

      return {
        totalLoaned: summary.totalLoaned || 0,
        totalReturned: summary.totalReturned || 0,
        totalOutstanding: summary.totalOutstanding || 0,
        activeLoans: summary.activeLoans || 0,
        overdueLoans: summary.overdueLoans || 0,
      };
    } catch (error) {
      console.error('Error getting loan summary:', error);
      return {
        totalLoaned: 0,
        totalReturned: 0,
        totalOutstanding: 0,
        activeLoans: 0,
        overdueLoans: 0,
      };
    }
  };

  markOverdueLoans = (): void => {
    try {
      const today = new Date().toISOString().split('T')[0];
      this.db.runSync(
        `UPDATE loans 
         SET status = 'overdue', updatedAt = ? 
         WHERE status IN ('active', 'partially_paid') 
         AND expectedReturnDate IS NOT NULL 
         AND DATE(expectedReturnDate) < DATE(?)`,
        [new Date().toISOString(), today]
      );
      
      console.log('Overdue loans marked');
    } catch (error) {
      console.error('Error marking overdue loans:', error);
    }
  };
}

export default new DatabaseService();
