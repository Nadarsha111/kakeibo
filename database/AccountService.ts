import DatabaseConnector from './DatabaseConnector';
import { Account, AccountBalance } from '../types';

/**
 * Service class for managing accounts and account balances
 */
class AccountService {
  private db: ReturnType<DatabaseConnector['getDatabase']>;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
  }

  /**
   * Get all active accounts
   */
  getAccounts(): Account[] {
    try {
      const accounts = this.db.getAllSync('SELECT * FROM accounts WHERE isActive = 1 ORDER BY name');
      return accounts as Account[];
    } catch (error) {
      console.error('Error getting accounts:', error);
      return [];
    }
  }

  /**
   * Get account by ID
   */
  getAccountById(id: number): Account | null {
    try {
      const account = this.db.getFirstSync('SELECT * FROM accounts WHERE id = ? AND isActive = 1', [id]);
      return account as Account || null;
    } catch (error) {
      console.error('Error getting account by id:', error);
      return null;
    }
  }

  /**
   * Add a new account
   */
  addAccount(account: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): number {
    try {
      const now = new Date().toISOString();
      const result = this.db.runSync(
        `INSERT INTO accounts (name, type, balance, currency, bankName, accountNumber, isActive, createdAt, updatedAt) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          account.name,
          account.type,
          account.balance,
          account.currency,
          account.bankName || null,
          account.accountNumber || null,
          account.isActive ? 1 : 0,
          now,
          now
        ]
      );
      
      console.log('Account added:', { id: result.lastInsertRowId, name: account.name });
      return result.lastInsertRowId;
    } catch (error) {
      console.error('Error adding account:', error);
      throw error;
    }
  }

  /**
   * Update an existing account
   */
  updateAccount(id: number, account: Partial<Omit<Account, 'id' | 'createdAt'>>): void {
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
  }

  /**
   * Soft delete an account (mark as inactive)
   */
  deleteAccount(id: number): void {
    try {
      this.db.runSync('UPDATE accounts SET isActive = 0 WHERE id = ?', [id]);
      console.log('Account deleted (marked inactive):', id);
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  }

  /**
   * Get total balance across all active accounts
   */
  getTotalAccountsBalance(): number {
    try {
      const result = this.db.getFirstSync('SELECT SUM(balance) as total FROM accounts WHERE isActive = 1');
      return (result as any)?.total || 0;
    } catch (error) {
      console.error('Error getting total accounts balance:', error);
      return 0;
    }
  }

  /**
   * Update account balance for a transaction
   */
  updateAccountBalanceForTransaction(accountId: number, amount: number, type: 'income' | 'expense'): void {
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
  }

  /**
   * Get current account balance summary
   */
  getAccountBalance(): AccountBalance | null {
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
  }

  /**
   * Update or insert monthly account balance for a specific account
   */
  updateMonthlyAccountBalance(accountId: number, year: number, month: number, closingBalance: number): void {
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
  }

  /**
   * Get monthly account balances for a specific year/month
   */
  getMonthlyAccountBalances(year: number, month: number): Array<{ accountId: number, name: string, closingBalance: number }> {
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
  }

  /**
   * Get accounts by type
   */
  getAccountsByType(type: Account['type']): Account[] {
    try {
      const accounts = this.db.getAllSync(
        'SELECT * FROM accounts WHERE type = ? AND isActive = 1 ORDER BY name',
        [type]
      );
      return accounts as Account[];
    } catch (error) {
      console.error('Error getting accounts by type:', error);
      return [];
    }
  }

  /**
   * Get account balance history for a specific account
   */
  getAccountBalanceHistory(accountId: number, startYear?: number, endYear?: number): Array<{
    year: number;
    month: number;
    closingBalance: number;
    lastUpdated: string;
  }> {
    try {
      let query = 'SELECT year, month, closingBalance, lastUpdated FROM account_balance WHERE accountId = ?';
      const params: any[] = [accountId];

      if (startYear && endYear) {
        query += ' AND (year BETWEEN ? AND ?)';
        params.push(startYear, endYear);
      } else if (startYear) {
        query += ' AND year >= ?';
        params.push(startYear);
      } else if (endYear) {
        query += ' AND year <= ?';
        params.push(endYear);
      }

      query += ' ORDER BY year DESC, month DESC';

      return this.db.getAllSync(query, params) as Array<{
        year: number;
        month: number;
        closingBalance: number;
        lastUpdated: string;
      }>;
    } catch (error) {
      console.error('Error getting account balance history:', error);
      return [];
    }
  }

  /**
   * Initialize default accounts if none exist
   */
  initializeDefaultAccounts(): void {
    try {
      // Only insert default accounts if none exist
      const existingAccounts = this.db.getAllSync('SELECT id FROM accounts');
      if (existingAccounts.length === 0) {
        const defaultAccounts = [
          { name: 'Cash Wallet', type: 'cash' as const, balance: 0, currency: 'USD', isActive: true },
          { name: 'Main Checking', type: 'checking' as const, balance: 0, currency: 'USD', bankName: 'Bank of America', isActive: true },
          { name: 'Savings Account', type: 'savings' as const, balance: 0, currency: 'USD', bankName: 'Bank of America', isActive: true },
          { name: 'Credit Card', type: 'credit_card' as const, balance: 0, currency: 'USD', bankName: 'Chase', isActive: true },
        ];

        defaultAccounts.forEach((account) => {
          try {
            this.addAccount(account);
          } catch (error) {
            console.log('Account already exists:', account.name);
          }
        });

        console.log('Default accounts initialized');
      }
    } catch (error) {
      console.error('Error initializing default accounts:', error);
    }
  }

  /**
   * Get account summary with transaction counts
   */
  getAccountSummary(): Array<{
    id: number;
    name: string;
    type: string;
    balance: number;
    currency: string;
    transactionCount: number;
    lastTransactionDate: string | null;
  }> {
    try {
      return this.db.getAllSync(`
        SELECT 
          a.id,
          a.name,
          a.type,
          a.balance,
          a.currency,
          COUNT(t.id) as transactionCount,
          MAX(t.date) as lastTransactionDate
        FROM accounts a
        LEFT JOIN transactions t ON a.id = t.accountId
        WHERE a.isActive = 1
        GROUP BY a.id, a.name, a.type, a.balance, a.currency
        ORDER BY a.name
      `) as Array<{
        id: number;
        name: string;
        type: string;
        balance: number;
        currency: string;
        transactionCount: number;
        lastTransactionDate: string | null;
      }>;
    } catch (error) {
      console.error('Error getting account summary:', error);
      return [];
    }
  }
}

export default AccountService;
