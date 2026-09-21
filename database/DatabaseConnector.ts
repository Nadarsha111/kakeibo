import * as SQLite from "expo-sqlite";

/**
 * Central database connector that provides a shared SQLite instance
 * This ensures all services use the same database connection
 */
class DatabaseConnector {
  private static instance: DatabaseConnector;
  private db: SQLite.SQLiteDatabase;

  private constructor() {
    this.db = SQLite.openDatabaseSync("kakeibo.db");
    // Enable foreign key constraint enforcement
    this.db.execSync("PRAGMA foreign_keys = ON;");
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

      this.db.execAsync(`
        CREATE TABLE IF NOT EXISTS profiles (
         id INTEGER PRIMARY KEY AUTOINCREMENT ,
         name TEXT NOT NULL,
         description TEXT,
         createdAt TEXT NOT NULL,
         updatedAt TEXT NOT NULL
        );
    `);

      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profileId INTEGER REFERENCES profiles(id) NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('savings', 'checking', 'credit_card', 'loan', 'investment', 'cash')),
          balance REAL NOT NULL DEFAULT 0,
          currency TEXT NOT NULL DEFAULT 'USD',

          -- Loan-specific fields
          isLending BOOLEAN, -- True if we lent money (asset), False if we borrowed (liability)
          loanPrincipal REAL,
          loanReturnedAmount REAL,
          loanStatus TEXT CHECK (loanStatus IN ('active', 'partially_paid', 'fully_paid', 'overdue')),
          loanCounterpartyName TEXT,
          loanCounterpartyContact TEXT,
          loanLentDate TEXT,
          loanExpectedReturnDate TEXT,
          loanActualReturnDate TEXT,
          loanInterestRate REAL,
          loanTermMonths INTEGER,
          loanInstallmentAmount REAL,
          loanPaymentDay INTEGER,
          loanNextDueDate TEXT,
          loanInterestPaid REAL,
          description TEXT,

          bankName TEXT,
          accountNumber TEXT,
          creditLimit REAL,
          billDay INTEGER,
          payAtMonthEnd INTEGER NOT NULL DEFAULT 0,
          isActive INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
      `);

      // Credit cards: most credit_card accounts need nothing beyond the account itself, but this
      // holds the extra physical cards for one that shares its balance and limit across two (or
      // more) cards, each with its own bill generation day.
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS credit_cards (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          accountId INTEGER NOT NULL REFERENCES accounts(id),
          name TEXT NOT NULL,
          billDay INTEGER,
          payAtMonthEnd INTEGER NOT NULL DEFAULT 0,
          isActive INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
      `);

      // Credit card EMIs: a purchase on the card converted to fixed monthly installments. The
      // purchase itself is a normal expense transaction (below), so the shared balance already
      // reflects it; this plan just says how much of it bills each cycle instead of all at once.
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS card_emis (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          accountId INTEGER NOT NULL REFERENCES accounts(id),
          cardId INTEGER REFERENCES credit_cards(id),
          name TEXT NOT NULL,
          principal REAL NOT NULL,
          returnedAmount REAL NOT NULL DEFAULT 0,
          interestRate REAL,
          termMonths INTEGER NOT NULL,
          installmentAmount REAL NOT NULL,
          paymentDay INTEGER,
          nextDueDate TEXT,
          interestPaid REAL NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fully_paid')),
          isActive INTEGER NOT NULL DEFAULT 1,
          createdAt TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
      `);

      // Create transactions table
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          profileId INTEGER REFERENCES profiles(id) NOT NULL,
          amount REAL NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
          category TEXT NOT NULL,
          description TEXT,
          date TEXT NOT NULL,
          paymentMethod TEXT NOT NULL CHECK (paymentMethod IN ('cash', 'credit_card', 'debit_card')),
          accountId INTEGER,
          cardId INTEGER REFERENCES credit_cards (id),
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

      // Create app_settings table for persistent user preferences
      this.db.execSync(`
        CREATE TABLE IF NOT EXISTS app_settings (
          id INTEGER PRIMARY KEY,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          updatedAt TEXT NOT NULL
        );
      `);

      // Recurring items (rent, subscriptions, salary, savings deposits...)
      this.db.execSync(DatabaseConnector.recurringItemsSql(true));

      this.runMigrations();

      // Insert default categories if none exist
      this.insertDefaultCategories();
      this.insertDefaultProfiles();
      
      console.log("Database tables initialized successfully");
    } catch (error) {
      console.error("Error initializing database tables:", error);
      throw error;
    }
  }
 
  

  /** The recurring_items table. Shared by first-time creation and by the migration that rebuilds an older shape. */
  private static recurringItemsSql(ifNotExists: boolean): string {
    return `
      CREATE TABLE ${ifNotExists ? 'IF NOT EXISTS ' : ''}recurring_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        profileId INTEGER REFERENCES profiles(id) NOT NULL,
        name TEXT NOT NULL,
        amount REAL NOT NULL,
        type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
        category TEXT NOT NULL,
        frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'quarterly', 'yearly')),
        dueDay INTEGER,
        nextDueDate TEXT NOT NULL,
        accountId INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        toAccountId INTEGER REFERENCES accounts(id) ON DELETE SET NULL,
        autoPost INTEGER NOT NULL DEFAULT 0,
        isActive INTEGER NOT NULL DEFAULT 1,
        lastPaidDate TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );
    `;
  }

  /**
   * Schema changes for existing installs. CREATE TABLE IF NOT EXISTS never alters a table that
   * already exists, so every new column on an existing table must also be added here or upgraded
   * users lose access to it. (A brand new table needs nothing here: CREATE TABLE IF NOT EXISTS
   * creates it on upgraded installs too.) Append a new entry per schema change; never edit or
   * reorder existing ones.
   * PRAGMA user_version records how many have run. Fresh installs (version 0) run them all too,
   * so each must be safe on a schema that already has the change, e.g.:
   *   (db) => {
   *     if (!DatabaseConnector.hasColumn(db, 'accounts', 'notes')) {
   *       db.execSync('ALTER TABLE accounts ADD COLUMN notes TEXT');
   *     }
   *   }
   */
  private static readonly MIGRATIONS: Array<(db: SQLite.SQLiteDatabase) => void> = [
    // 1: installment-loan fields (interest rate, term, monthly payment, due dates)
    (db) => {
      const columns: Array<[string, string]> = [
        ['loanInterestRate', 'REAL'],
        ['loanTermMonths', 'INTEGER'],
        ['loanInstallmentAmount', 'REAL'],
        ['loanPaymentDay', 'INTEGER'],
        ['loanNextDueDate', 'TEXT'],
        ['loanInterestPaid', 'REAL'],
      ];
      columns.forEach(([name, sqlType]) => {
        if (!DatabaseConnector.hasColumn(db, 'accounts', name)) {
          db.execSync(`ALTER TABLE accounts ADD COLUMN ${name} ${sqlType}`);
        }
      });
    },
    // 2: a credit card is money owed, so a positive starting balance was entered the wrong way
    // round. The starting balance is the current balance minus the net of the card's transactions;
    // flipping only that part keeps every later purchase and payment correctly applied.
    (db) => {
      const netOfTransactions = `COALESCE((SELECT SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END)
        FROM transactions t WHERE t.accountId = accounts.id), 0)`;
      db.runSync(
        `UPDATE accounts
         SET balance = ROUND(balance - 2 * (balance - ${netOfTransactions}), 2), updatedAt = ?
         WHERE type = 'credit_card' AND balance - ${netOfTransactions} > 0.005`,
        [new Date().toISOString()],
      );
    },
    // 3: credit card limit
    (db) => {
      if (!DatabaseConnector.hasColumn(db, 'accounts', 'creditLimit')) {
        db.execSync('ALTER TABLE accounts ADD COLUMN creditLimit REAL');
      }
    },
    // 4: recurring items gain daily repeats, transfers between accounts and automatic posting.
    // SQLite cannot change the allowed values of a column in place, so a table made with the older
    // shape is rebuilt, keeping every row.
    (db) => {
      if (!DatabaseConnector.hasColumn(db, 'recurring_items', 'id') || DatabaseConnector.hasColumn(db, 'recurring_items', 'toAccountId')) return;
      db.execSync('ALTER TABLE recurring_items RENAME TO recurring_items_old');
      db.execSync(DatabaseConnector.recurringItemsSql(false));
      db.execSync(`
        INSERT INTO recurring_items (id, profileId, name, amount, type, category, frequency, dueDay, nextDueDate, accountId, isActive, lastPaidDate, createdAt, updatedAt)
        SELECT id, profileId, name, amount, type, category, frequency, dueDay, nextDueDate, accountId, isActive, lastPaidDate, createdAt, updatedAt
        FROM recurring_items_old
      `);
      db.execSync('DROP TABLE recurring_items_old');
    },
    // 5: credit card bill day, the day of the month the card's bill is due
    (db) => {
      if (!DatabaseConnector.hasColumn(db, 'accounts', 'billDay')) {
        db.execSync('ALTER TABLE accounts ADD COLUMN billDay INTEGER');
      }
    },
    // 6: bills paid from the month-end salary count as money needed this month even when they fall due early next month
    (db) => {
      if (!DatabaseConnector.hasColumn(db, 'accounts', 'payAtMonthEnd')) {
        db.execSync('ALTER TABLE accounts ADD COLUMN payAtMonthEnd INTEGER NOT NULL DEFAULT 0');
      }
    },
    // 7: which physical card (of an account that shares its balance across more than one) a
    // transaction was charged to. The credit_cards table itself is created unconditionally above,
    // since CREATE TABLE IF NOT EXISTS already reaches upgraded installs.
    (db) => {
      if (!DatabaseConnector.hasColumn(db, 'transactions', 'cardId')) {
        db.execSync('ALTER TABLE transactions ADD COLUMN cardId INTEGER REFERENCES credit_cards(id)');
      }
    },
  ];

  private static hasColumn(db: SQLite.SQLiteDatabase, table: string, column: string): boolean {
    const columns = db.getAllSync(`PRAGMA table_info(${table})`) as Array<{ name: string }>;
    return columns.some((c) => c.name === column);
  }

  private runMigrations(): void {
    const row = this.db.getFirstSync("PRAGMA user_version") as { user_version: number } | null;
    const applied = row?.user_version ?? 0;

    DatabaseConnector.MIGRATIONS.slice(applied).forEach((migrate, index) => {
      this.withTransaction(() => {
        migrate(this.db);
        this.db.execSync(`PRAGMA user_version = ${applied + index + 1}`);
      });
    });
  }

  private insertDefaultCategories(): void {
    try {
      // Check if categories already exist
      const existingCategories = this.db.getAllSync(
        "SELECT COUNT(*) as count FROM categories",
      );
      if ((existingCategories[0] as any).count > 0) {
        return; // Categories already exist
      }

      const defaultCategories = [
        { name: "Transport", color: "#10b981", icon: "🚗", type: "expense" },
        { name: "Restaurant", color: "#ef4444", icon: "🍽️", type: "expense" },
        { name: "Shopping", color: "#f97316", icon: "🛍️", type: "expense" },
        { name: "Food", color: "#3b82f6", icon: "🍎", type: "expense" },
        { name: "Gift", color: "#06b6d4", icon: "🎁", type: "expense" },
        { name: "Free time", color: "#8b5cf6", icon: "🎮", type: "expense" },
        { name: "Family", color: "#ec4899", icon: "👨‍👩‍👧‍👦", type: "expense" },
        { name: "Health", color: "#14b8a6", icon: "🏥", type: "expense" },
        { name: "Salary", color: "#22c55e", icon: "💰", type: "income" },
        { name: "Investment", color: "#6366f1", icon: "📈", type: "income" },
        {
          name: "Transfer In", color: "#6b7280", icon: "➡️", type: "income"
        },
        { name: "Transfer Out", color: "#6b7280", icon: "⬅️", type: "expense" }
      ];

      defaultCategories.forEach((category) => {
        try {
          this.db.runSync(
            "INSERT INTO categories (name, color, icon, type) VALUES (?, ?, ?, ?)",
            [category.name, category.color, category.icon, category.type],
          );
        } catch (error) {
          // Ignore if category already exists
          console.log("Category already exists:", category.name);
        }
      });

      console.log("Default categories inserted successfully");
    } catch (error) {
      console.error("Error inserting default categories:", error);
    }
  }

  private insertDefaultProfiles(): void {
    try {
      const existingProfile = this.db.getFirstSync(
        "SELECT COUNT(*) as count FROM profiles",
      ) as { count: number } | undefined;

      if (existingProfile && existingProfile.count > 0) {
        return; // Profiles already exist
      }

      const now = new Date().toISOString();
      this.db.runSync(
        "INSERT INTO profiles (name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?)",
        ["Personal", "Personal accounts", now, now],
      );
      console.log("Default profile inserted successfully.");
    } catch (error) {
      console.error("Error inserting default profiles:", error);
    }
  }

  /**
   * Execute a raw SQL query (use with caution)
   */
  public executeQuery(sql: string, params: any[] = []): any {
    try {
      return this.db.getAllSync(sql, params);
    } catch (error) {
      console.error("Error executing query:", error);
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
      console.error("Error executing statement:", error);
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
      console.error("Error getting first result:", error);
      throw error;
    }
  }

  /**
   * Begin a database transaction
   */
  public beginTransaction(): void {
    this.db.execSync("BEGIN TRANSACTION");
  }

  /**
   * Commit a database transaction
   */
  public commitTransaction(): void {
    this.db.execSync("COMMIT");
  }

  /**
   * Rollback a database transaction
   */
  public rollbackTransaction(): void {
    this.db.execSync("ROLLBACK");
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
