import * as SQLite from 'expo-sqlite';
import { Transaction, Category, Budget, AccountBalance } from '../src/types';

class DatabaseService {
  private db: SQLite.SQLiteDatabase;

  constructor() {
    this.db = SQLite.openDatabaseSync('kakeibo.db');
    this.initDatabase();
  }

  private initDatabase = () => {
    try {
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
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
      `);

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

      // Insert default categories
      this.insertDefaultCategories();
    } catch (error) {
      console.error('Error initializing database:', error);
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
        `INSERT INTO transactions (amount, type, category, description, date, paymentMethod, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [transaction.amount, transaction.type, transaction.category, transaction.description, 
         transaction.date, transaction.paymentMethod, now, now]
      );
      
      this.updateAccountBalance(transaction.amount, transaction.type);
      
      console.log('Transaction added:', {
        id: result.lastInsertRowId,
        amount: transaction.amount,
        type: transaction.type,
        category: transaction.category,
        date: transaction.date
      });
      
      return result.lastInsertRowId;
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
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

  getTransactionsByDateRange = (startDate: string, endDate: string): Transaction[] => {
    try {
      return this.db.getAllSync(
        'SELECT * FROM transactions WHERE date BETWEEN ? AND ? ORDER BY date DESC',
        [startDate, endDate]
      ) as Transaction[];
    } catch (error) {
      console.error('Error getting transactions by date range:', error);
      return [];
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
}

export default new DatabaseService();
