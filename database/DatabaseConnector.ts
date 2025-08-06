import * as SQLite from 'expo-sqlite';

/**
 * Central database connector that provides a shared SQLite instance
 * This ensures all services use the same database connection
 */
class DatabaseConnector {
  private static instance: DatabaseConnector;
  private db: SQLite.SQLiteDatabase;

  private constructor() {
    this.db = SQLite.openDatabaseSync('kakeibo.db');
    this.initializeTables();
  }

  /**
   * Singleton pattern to ensure only one database connection exists
   */
  public static getInstance(): DatabaseConnector {
    if (!DatabaseConnector.instance) {
      DatabaseConnector.instance = new DatabaseConnector();
    }
    return DatabaseConnector.instance;
  }

  /**
   * Get the SQLite database instance
   */
  public getDatabase(): SQLite.SQLiteDatabase {
    return this.db;
  }

  /**
   * Initialize all database tables
   */
  private initializeTables(): void {
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

      // Add missing columns if they don't exist
      this.addMissingColumns();

      // Insert default categories if none exist
      this.insertDefaultCategories();

      console.log('Database tables initialized successfully');
    } catch (error) {
      console.error('Error initializing database tables:', error);
      throw error;
    }
  }

  /**
   * Add missing columns to existing tables for backward compatibility
   */
  private addMissingColumns(): void {
    try {
      // Check if accountId column exists in transactions
      const transactionTableInfo = this.db.getAllSync("PRAGMA table_info(transactions)");
      const hasAccountId = transactionTableInfo.some((row: any) => row.name === 'accountId');
      
      if (!hasAccountId) {
        this.db.execSync(`
          ALTER TABLE transactions 
          ADD COLUMN accountId INTEGER REFERENCES accounts(id)
        `);
        console.log('Added accountId column to transactions table');
      }

      // Check if priority column exists in transactions
      const hasPriority = transactionTableInfo.some((row: any) => row.name === 'priority');
      
      if (!hasPriority) {
        this.db.execSync(`
          ALTER TABLE transactions 
          ADD COLUMN priority TEXT CHECK (priority IN ('need', 'want'))
        `);
        console.log('Added priority column to transactions table');
      }
    } catch (error) {
      console.error('Error adding missing columns:', error);
    }
  }

  /**
   * Insert default categories if none exist
   */
  private insertDefaultCategories(): void {
    try {
      // Check if categories already exist
      const existingCategories = this.db.getAllSync('SELECT COUNT(*) as count FROM categories');
      if ((existingCategories[0] as any).count > 0) {
        return; // Categories already exist
      }

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
            'INSERT INTO categories (name, color, icon, type) VALUES (?, ?, ?, ?)',
            [category.name, category.color, category.icon, category.type]
          );
        } catch (error) {
          // Ignore if category already exists
          console.log('Category already exists:', category.name);
        }
      });

      console.log('Default categories inserted successfully');
    } catch (error) {
      console.error('Error inserting default categories:', error);
    }
  }

  /**
   * Execute a raw SQL query (use with caution)
   */
  public executeQuery(sql: string, params: any[] = []): any {
    try {
      return this.db.getAllSync(sql, params);
    } catch (error) {
      console.error('Error executing query:', error);
      throw error;
    }
  }

  /**
   * Execute a raw SQL statement (use with caution)
   */
  public executeStatement(sql: string, params: any[] = []): any {
    try {
      return this.db.runSync(sql, params);
    } catch (error) {
      console.error('Error executing statement:', error);
      throw error;
    }
  }

  /**
   * Get the first result from a query
   */
  public getFirst(sql: string, params: any[] = []): any {
    try {
      return this.db.getFirstSync(sql, params);
    } catch (error) {
      console.error('Error getting first result:', error);
      throw error;
    }
  }

  /**
   * Begin a database transaction
   */
  public beginTransaction(): void {
    this.db.execSync('BEGIN TRANSACTION');
  }

  /**
   * Commit a database transaction
   */
  public commitTransaction(): void {
    this.db.execSync('COMMIT');
  }

  /**
   * Rollback a database transaction
   */
  public rollbackTransaction(): void {
    this.db.execSync('ROLLBACK');
  }

  /**
   * Execute multiple operations in a transaction
   */
  public withTransaction<T>(callback: () => T): T {
    this.beginTransaction();
    try {
      const result = callback();
      this.commitTransaction();
      return result;
    } catch (error) {
      this.rollbackTransaction();
      throw error;
    }
  }
}

export default DatabaseConnector;
