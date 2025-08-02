import * as SQLite from 'expo-sqlite';
import { Transaction, Category, Budget, AccountBalance } from '../types';

class DatabaseService {
  private db: SQLite.SQLiteDatabase;

  constructor() {
    this.db = SQLite.openDatabaseSync('kakeibo.db');
    this.initDatabase();
  }

  private initDatabase = () => {
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
  };

  // Transaction methods
  addTransaction = (transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): number => {
    const now = new Date().toISOString();
    const result = this.db.runSync(
      `INSERT INTO transactions (amount, type, category, description, date, paymentMethod, createdAt, updatedAt) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [transaction.amount, transaction.type, transaction.category, transaction.description, 
       transaction.date, transaction.paymentMethod, now, now]
    );
    
    this.updateAccountBalance(transaction.amount, transaction.type);
    return result.lastInsertRowId;
  };

  getTransactions = (limit?: number, offset?: number): Transaction[] => {
    const query = limit 
      ? 'SELECT * FROM transactions ORDER BY date DESC LIMIT ? OFFSET ?'
      : 'SELECT * FROM transactions ORDER BY date DESC';
    const params = limit ? [limit, offset || 0] : [];

    return this.db.getAllSync(query, params) as Transaction[];
  };

  getTransactionsByDateRange = (startDate: string, endDate: string): Transaction[] => {
    return this.db.getAllSync(
      'SELECT * FROM transactions WHERE date BETWEEN ? AND ? ORDER BY date DESC',
      [startDate, endDate]
    ) as Transaction[];
  };

  // Category methods
  getCategories = (): Category[] => {
    return this.db.getAllSync('SELECT * FROM categories ORDER BY name') as Category[];
  };

  // Account balance methods
  getAccountBalance = (): AccountBalance | null => {
    const result = this.db.getFirstSync('SELECT * FROM account_balance WHERE id = 1') as AccountBalance | null;
    return result;
  };

  private updateAccountBalance = (amount: number, type: 'income' | 'expense') => {
    const balanceChange = type === 'income' ? amount : -amount;
    this.db.runSync(
      'UPDATE account_balance SET totalBalance = totalBalance + ?, lastUpdated = ? WHERE id = 1',
      [balanceChange, new Date().toISOString()]
    );
  };

  // Summary methods
  getCategorySummary = (startDate: string, endDate: string): {category: string, amount: number, color: string}[] => {
    return this.db.getAllSync(
      `SELECT t.category, SUM(t.amount) as amount, c.color 
       FROM transactions t 
       JOIN categories c ON t.category = c.name 
       WHERE t.type = 'expense' AND t.date BETWEEN ? AND ? 
       GROUP BY t.category, c.color 
       ORDER BY amount DESC`,
      [startDate, endDate]
    ) as {category: string, amount: number, color: string}[];
  };

  getTotalExpenses = (startDate: string, endDate: string): number => {
    const result = this.db.getFirstSync(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'expense' AND date BETWEEN ? AND ?",
      [startDate, endDate]
    ) as {total: number | null};
    return result?.total || 0;
  };

  getTotalIncome = (startDate: string, endDate: string): number => {
    const result = this.db.getFirstSync(
      "SELECT SUM(amount) as total FROM transactions WHERE type = 'income' AND date BETWEEN ? AND ?",
      [startDate, endDate]
    ) as {total: number | null};
    return result?.total || 0;
  };
}

export default new DatabaseService();
