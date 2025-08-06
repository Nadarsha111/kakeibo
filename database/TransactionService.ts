import DatabaseConnector from './DatabaseConnector';
import { Transaction } from '../types';
import AccountService from './AccountService';

/**
 * Service class for handling transactions, triggers, and derived data
 */
class TransactionService {
  private db: ReturnType<DatabaseConnector['getDatabase']>;
  private accountService: AccountService;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
    this.accountService = new AccountService();
  }

  /**
   * Add a new transaction with automatic account balance updates
   */
  addTransaction(transaction: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): number {
    try {
      return DatabaseConnector.getInstance().withTransaction(() => {
        const now = new Date().toISOString();
        
        // Insert transaction
        const result = this.db.runSync(
          `INSERT INTO transactions (amount, type, category, description, date, paymentMethod, accountId, priority, createdAt, updatedAt) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            transaction.amount,
            transaction.type,
            transaction.category,
            transaction.description,
            transaction.date,
            transaction.paymentMethod,
            transaction.accountId || null,
            transaction.priority || null,
            now,
            now
          ]
        );
        
        // Update account balance if account is specified
        if (transaction.accountId) {
          this.accountService.updateAccountBalanceForTransaction(
            transaction.accountId,
            transaction.amount,
            transaction.type
          );
        }
        
        console.log('Transaction added:', {
          id: result.lastInsertRowId,
          amount: transaction.amount,
          type: transaction.type,
          category: transaction.category,
          date: transaction.date,
          accountId: transaction.accountId
        });
        
        return result.lastInsertRowId;
      });
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
    }
  }

  /**
   * Get all transactions with pagination
   */
  getTransactions(limit?: number, offset?: number): Transaction[] {
    try {
      const query = limit 
        ? 'SELECT * FROM transactions ORDER BY date DESC, createdAt DESC LIMIT ? OFFSET ?'
        : 'SELECT * FROM transactions ORDER BY date DESC, createdAt DESC';
      const params = limit ? [limit, offset || 0] : [];

      return this.db.getAllSync(query, params) as Transaction[];
    } catch (error) {
      console.error('Error getting transactions:', error);
      return [];
    }
  }

  /**
   * Get transactions by date range
   */
  getTransactionsByDateRange(
    startDate: string, 
    endDate: string, 
    includeCategory: boolean = false
  ): Array<Transaction & { categoryName?: string }> {
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
          'SELECT * FROM transactions WHERE DATE(date) BETWEEN DATE(?) AND DATE(?) ORDER BY date DESC, createdAt DESC',
          [startDate, endDate]
        ) as Transaction[];
      }
    } catch (error) {
      console.error('Error getting transactions by date range:', error);
      return [];
    }
  }

  /**
   * Get transactions for a specific account
   */
  getTransactionsByAccount(accountId: number, limit?: number, offset?: number): Transaction[] {
    try {
      const query = limit
        ? 'SELECT * FROM transactions WHERE accountId = ? ORDER BY date DESC, createdAt DESC LIMIT ? OFFSET ?'
        : 'SELECT * FROM transactions WHERE accountId = ? ORDER BY date DESC, createdAt DESC';
      const params = limit ? [accountId, limit, offset || 0] : [accountId];

      return this.db.getAllSync(query, params) as Transaction[];
    } catch (error) {
      console.error('Error getting transactions by account:', error);
      return [];
    }
  }

  /**
   * Get transactions by category
   */
  getTransactionsByCategory(category: string, startDate?: string, endDate?: string): Transaction[] {
    try {
      let query = 'SELECT * FROM transactions WHERE category = ?';
      const params: any[] = [category];

      if (startDate && endDate) {
        query += ' AND DATE(date) BETWEEN DATE(?) AND DATE(?)';
        params.push(startDate, endDate);
      }

      query += ' ORDER BY date DESC, createdAt DESC';

      return this.db.getAllSync(query, params) as Transaction[];
    } catch (error) {
      console.error('Error getting transactions by category:', error);
      return [];
    }
  }

  /**
   * Update a transaction with automatic account balance adjustment
   */
  updateTransaction(id: number, updates: Partial<Omit<Transaction, 'id' | 'createdAt'>>): void {
    try {
      DatabaseConnector.getInstance().withTransaction(() => {
        // Get original transaction for balance reversal
        const originalTransaction = this.getTransactionById(id);
        if (!originalTransaction) {
          throw new Error('Transaction not found');
        }

        // Reverse original account balance effect
        if (originalTransaction.accountId) {
          const reverseType = originalTransaction.type === 'income' ? 'expense' : 'income';
          this.accountService.updateAccountBalanceForTransaction(
            originalTransaction.accountId,
            originalTransaction.amount,
            reverseType
          );
        }

        // Update transaction
        const now = new Date().toISOString();
        const fields = [];
        const values = [];

        if (updates.amount !== undefined) {
          fields.push('amount = ?');
          values.push(updates.amount);
        }
        if (updates.type !== undefined) {
          fields.push('type = ?');
          values.push(updates.type);
        }
        if (updates.category !== undefined) {
          fields.push('category = ?');
          values.push(updates.category);
        }
        if (updates.description !== undefined) {
          fields.push('description = ?');
          values.push(updates.description);
        }
        if (updates.date !== undefined) {
          fields.push('date = ?');
          values.push(updates.date);
        }
        if (updates.paymentMethod !== undefined) {
          fields.push('paymentMethod = ?');
          values.push(updates.paymentMethod);
        }
        if (updates.accountId !== undefined) {
          fields.push('accountId = ?');
          values.push(updates.accountId);
        }
        if (updates.priority !== undefined) {
          fields.push('priority = ?');
          values.push(updates.priority);
        }

        fields.push('updatedAt = ?');
        values.push(now);
        values.push(id);

        this.db.runSync(
          `UPDATE transactions SET ${fields.join(', ')} WHERE id = ?`,
          values
        );

        // Apply new account balance effect
        const updatedTransaction = { ...originalTransaction, ...updates };
        if (updatedTransaction.accountId) {
          this.accountService.updateAccountBalanceForTransaction(
            updatedTransaction.accountId,
            updatedTransaction.amount,
            updatedTransaction.type
          );
        }

        console.log('Transaction updated:', id);
      });
    } catch (error) {
      console.error('Error updating transaction:', error);
      throw error;
    }
  }

  /**
   * Delete a transaction with automatic account balance adjustment
   */
  deleteTransaction(id: number): void {
    try {
      DatabaseConnector.getInstance().withTransaction(() => {
        // Get transaction for balance reversal
        const transaction = this.getTransactionById(id);
        if (!transaction) {
          throw new Error('Transaction not found');
        }

        // Reverse account balance effect
        if (transaction.accountId) {
          const reverseType = transaction.type === 'income' ? 'expense' : 'income';
          this.accountService.updateAccountBalanceForTransaction(
            transaction.accountId,
            transaction.amount,
            reverseType
          );
        }

        // Delete transaction
        this.db.runSync('DELETE FROM transactions WHERE id = ?', [id]);

        console.log('Transaction deleted:', id);
      });
    } catch (error) {
      console.error('Error deleting transaction:', error);
      throw error;
    }
  }

  /**
   * Get transaction by ID
   */
  getTransactionById(id: number): Transaction | null {
    try {
      return this.db.getFirstSync('SELECT * FROM transactions WHERE id = ?', [id]) as Transaction | null;
    } catch (error) {
      console.error('Error getting transaction by id:', error);
      return null;
    }
  }

  /**
   * Get total expenses for a date range
   */
  getTotalExpenses(startDate: string, endDate: string): number {
    try {
      const result = this.db.getFirstSync(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'expense' AND DATE(date) BETWEEN DATE(?) AND DATE(?)",
        [startDate, endDate]
      ) as { total: number | null };
      return result?.total || 0;
    } catch (error) {
      console.error('Error getting total expenses:', error);
      return 0;
    }
  }

  /**
   * Get total income for a date range
   */
  getTotalIncome(startDate: string, endDate: string): number {
    try {
      const result = this.db.getFirstSync(
        "SELECT SUM(amount) as total FROM transactions WHERE type = 'income' AND DATE(date) BETWEEN DATE(?) AND DATE(?)",
        [startDate, endDate]
      ) as { total: number | null };
      return result?.total || 0;
    } catch (error) {
      console.error('Error getting total income:', error);
      return 0;
    }
  }

  /**
   * Get category summary for expenses in a date range
   */
  getCategorySummary(startDate: string, endDate: string): { category: string; amount: number; color: string }[] {
    try {
      return this.db.getAllSync(
        `SELECT t.category, SUM(t.amount) as amount, c.color 
         FROM transactions t 
         JOIN categories c ON t.category = c.name 
         WHERE t.type = 'expense' AND DATE(t.date) BETWEEN DATE(?) AND DATE(?) 
         GROUP BY t.category, c.color 
         ORDER BY amount DESC`,
        [startDate, endDate]
      ) as { category: string; amount: number; color: string }[];
    } catch (error) {
      console.error('Error getting category summary:', error);
      return [];
    }
  }

  /**
   * Get all transactions for export with category names
   */
  getAllTransactionsForExport(): Array<Transaction & { categoryName?: string }> {
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
  }

  /**
   * Get export summary statistics
   */
  getExportSummary() {
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
  }

  /**
   * Get Need/Want analysis summary
   */
  getNeedWantSummary(dateRange?: { startDate: string; endDate: string }) {
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
  }

  /**
   * Get Need/Want analysis by category
   */
  getNeedWantByCategory(dateRange?: { startDate: string; endDate: string }) {
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
  }

  /**
   * Get transaction statistics for a specific period
   */
  getTransactionStats(startDate: string, endDate: string): {
    totalTransactions: number;
    totalIncome: number;
    totalExpenses: number;
    netAmount: number;
    averageTransaction: number;
    expensesByPaymentMethod: Array<{ paymentMethod: string; amount: number; count: number }>;
  } {
    try {
      const totalCount = this.db.getFirstSync(
        'SELECT COUNT(*) as count FROM transactions WHERE DATE(date) BETWEEN DATE(?) AND DATE(?)',
        [startDate, endDate]
      ) as { count: number };

      const income = this.getTotalIncome(startDate, endDate);
      const expenses = this.getTotalExpenses(startDate, endDate);

      const paymentMethodStats = this.db.getAllSync(`
        SELECT 
          paymentMethod,
          SUM(amount) as amount,
          COUNT(*) as count
        FROM transactions 
        WHERE type = 'expense' AND DATE(date) BETWEEN DATE(?) AND DATE(?)
        GROUP BY paymentMethod
        ORDER BY amount DESC
      `, [startDate, endDate]) as Array<{ paymentMethod: string; amount: number; count: number }>;

      return {
        totalTransactions: totalCount.count,
        totalIncome: income,
        totalExpenses: expenses,
        netAmount: income - expenses,
        averageTransaction: totalCount.count > 0 ? (income + expenses) / totalCount.count : 0,
        expensesByPaymentMethod: paymentMethodStats,
      };
    } catch (error) {
      console.error('Error getting transaction stats:', error);
      return {
        totalTransactions: 0,
        totalIncome: 0,
        totalExpenses: 0,
        netAmount: 0,
        averageTransaction: 0,
        expensesByPaymentMethod: [],
      };
    }
  }

  /**
   * Get recent transactions
   */
  getRecentTransactions(limit: number = 10): Transaction[] {
    try {
      return this.db.getAllSync(
        'SELECT * FROM transactions ORDER BY createdAt DESC LIMIT ?',
        [limit]
      ) as Transaction[];
    } catch (error) {
      console.error('Error getting recent transactions:', error);
      return [];
    }
  }

  /**
   * Search transactions by description or category
   */
  searchTransactions(searchTerm: string, limit?: number): Transaction[] {
    try {
      const query = `
        SELECT * FROM transactions 
        WHERE (description LIKE ? OR category LIKE ?) 
        ORDER BY date DESC, createdAt DESC
        ${limit ? 'LIMIT ?' : ''}
      `;
      const params: any[] = [`%${searchTerm}%`, `%${searchTerm}%`];
      if (limit) params.push(limit);

      return this.db.getAllSync(query, params) as Transaction[];
    } catch (error) {
      console.error('Error searching transactions:', error);
      return [];
    }
  }
}

export default TransactionService;
