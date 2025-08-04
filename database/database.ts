import * as SQLite from 'expo-sqlite';
import { Transaction, Category, Budget, AccountBalance, Account } from '../types';

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

      // Create account_balance table
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS account_balance (
          id INTEGER PRIMARY KEY,
          totalBalance REAL NOT NULL,
          lastUpdated TEXT NOT NULL
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
      
      // Insert default accounts
      this.insertDefaultAccounts();
    } catch (error) {
      console.error('Error initializing database:', error);
    }
  };

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

    // Initialize account balance
    try {
      this.db.runSync(
        'INSERT OR IGNORE INTO account_balance (id, totalBalance, lastUpdated) VALUES (1, 8025.85, ?)',
        [new Date().toISOString()]
      );
    } catch (error) {
      console.log('Account balance already initialized');
    }

    // Add sample transactions for testing
    this.addSampleTransactions();
  };

  private insertDefaultAccounts = () => {
    const defaultAccounts = [
      { name: 'Cash Wallet', type: 'cash', balance: 500.00, currency: 'USD' },
      { name: 'Main Checking', type: 'checking', balance: 2500.85, currency: 'USD', bankName: 'Bank of America' },
      { name: 'Savings Account', type: 'savings', balance: 5000.00, currency: 'USD', bankName: 'Bank of America' },
      { name: 'Credit Card', type: 'credit_card', balance: -25.00, currency: 'USD', bankName: 'Chase' },
    ];

    defaultAccounts.forEach((account) => {
      try {
        const now = new Date().toISOString();
        this.db.runSync(
          'INSERT OR IGNORE INTO accounts (name, type, balance, currency, bankName, isActive, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 1, ?, ?)',
          [account.name, account.type, account.balance, account.currency, account.bankName || null, now, now]
        );
      } catch (error) {
        console.log('Account already exists:', account.name);
      }
    });
  };

  private addSampleTransactions = () => {
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const twoDaysAgo = new Date(today);
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 3);
    
    const sampleTransactions = [
      {
        amount: 3000,
        type: 'income' as const,
        category: 'Salary',
        description: 'Monthly salary',
        date: today.toISOString().split('T')[0],
        paymentMethod: 'credit_card' as const
      },
      {
        amount: 45.50,
        type: 'expense' as const,
        category: 'Food',
        description: 'Grocery shopping',
        date: yesterday.toISOString().split('T')[0],
        paymentMethod: 'cash' as const
      },
      {
        amount: 25.00,
        type: 'expense' as const,
        category: 'Transport',
        description: 'Gas',
        date: twoDaysAgo.toISOString().split('T')[0],
        paymentMethod: 'debit_card' as const
      },
      {
        amount: 80.00,
        type: 'expense' as const,
        category: 'Restaurant',
        description: 'Dinner with friends',
        date: thisWeek.toISOString().split('T')[0],
        paymentMethod: 'credit_card' as const
      }
    ];

    sampleTransactions.forEach((transaction) => {
      try {
        const existing = this.db.getFirstSync(
          'SELECT id FROM transactions WHERE description = ? AND date = ?',
          [transaction.description, transaction.date]
        );
        
        if (!existing) {
          const now = new Date().toISOString();
          this.db.runSync(
            `INSERT INTO transactions (amount, type, category, description, date, paymentMethod, createdAt, updatedAt) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [transaction.amount, transaction.type, transaction.category, transaction.description, 
             transaction.date, transaction.paymentMethod, now, now]
          );
        }
      } catch (error) {
        console.log('Sample transaction already exists:', transaction.description);
      }
    });
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
      const result = this.db.getFirstSync('SELECT * FROM account_balance WHERE id = 1') as AccountBalance | null;
      return result;
    } catch (error) {
      console.error('Error getting account balance:', error);
      return null;
    }
  };

  private updateAccountBalance = (amount: number, type: 'income' | 'expense') => {
    try {
      const balanceChange = type === 'income' ? amount : -amount;
      this.db.runSync(
        'UPDATE account_balance SET totalBalance = totalBalance + ?, lastUpdated = ? WHERE id = 1',
        [balanceChange, new Date().toISOString()]
      );
    } catch (error) {
      console.error('Error updating account balance:', error);
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
}

export default new DatabaseService();
