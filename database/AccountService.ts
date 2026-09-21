import DatabaseConnector from './DatabaseConnector';
import { Account, AccountBalanceRow, NetWorthItem, NetWorthSummary } from '../types';
import { round2 } from '../utils/loanMath';

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
  getAccounts(profileId?: number): Account[] {
    try {
      let query = 'SELECT * FROM accounts WHERE isActive = 1';
      const params: any[] = [];

      if (profileId) {
        query += ' AND profileId = ?';
        params.push(profileId);
      }

      query += ' ORDER BY name';

      const accounts = this.db.getAllSync(query, params);
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
      // For loans, the balance should reflect the liability/asset status
      if (account.type === 'loan') {
        if (account.isLending) { // Money lent (asset)
          account.balance = account.loanPrincipal || 0;
        } else { // Money borrowed (liability)
          account.balance = -(account.loanPrincipal || 0);
        }
        account.loanReturnedAmount = 0;
        account.loanStatus = 'active';
        account.loanInterestPaid = 0;
      }

      const now = new Date().toISOString();
      const result = this.db.runSync(
        `INSERT INTO accounts (profileId, name, type, balance, currency, bankName, accountNumber, isActive, createdAt, updatedAt,
          isLending, loanPrincipal, loanReturnedAmount, loanStatus, loanCounterpartyName, loanCounterpartyContact, loanLentDate, loanExpectedReturnDate, description,
          loanInterestRate, loanTermMonths, loanInstallmentAmount, loanPaymentDay, loanNextDueDate, loanInterestPaid, creditLimit, billDay, payAtMonthEnd)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          account.profileId,
          account.name,
          account.type,
          account.balance,
          account.currency,
          account.bankName || null,
          account.accountNumber || null,
          account.isActive ? 1 : 0,
          now,
          now,
          account.isLending,
          account.loanPrincipal,
          account.loanReturnedAmount,
          account.loanStatus,
          account.loanCounterpartyName,
          account.loanCounterpartyContact,
          account.loanLentDate,
          account.loanExpectedReturnDate,
          account.description,
          account.loanInterestRate ?? null,
          account.loanTermMonths ?? null,
          account.loanInstallmentAmount ?? null,
          account.loanPaymentDay ?? null,
          account.loanNextDueDate ?? null,
          account.loanInterestPaid ?? null,
          account.creditLimit ?? null,
          account.billDay ?? null,
          account.payAtMonthEnd ? 1 : 0,
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
      // Loan fields
      if (account.loanPrincipal !== undefined) {
        fields.push('loanPrincipal = ?');
        values.push(account.loanPrincipal);
      }
      if (account.loanReturnedAmount !== undefined) {
        fields.push('loanReturnedAmount = ?');
        values.push(account.loanReturnedAmount);
      }
      if (account.loanStatus !== undefined) {
        fields.push('loanStatus = ?');
        values.push(account.loanStatus);
      }
      if (account.loanCounterpartyName !== undefined) {
        fields.push('loanCounterpartyName = ?');
        values.push(account.loanCounterpartyName);
      }
      if (account.loanCounterpartyContact !== undefined) {
        fields.push('loanCounterpartyContact = ?');
        values.push(account.loanCounterpartyContact);
      }
      if (account.loanExpectedReturnDate !== undefined) {
        fields.push('loanExpectedReturnDate = ?');
        values.push(account.loanExpectedReturnDate);
      }
      if (account.creditLimit !== undefined) {
        fields.push('creditLimit = ?');
        values.push(account.creditLimit);
      }
      if (account.billDay !== undefined) {
        fields.push('billDay = ?');
        values.push(account.billDay);
      }
      if (account.payAtMonthEnd !== undefined) {
        fields.push('payAtMonthEnd = ?');
        values.push(account.payAtMonthEnd ? 1 : 0);
      }
      if (account.loanInterestPaid !== undefined) {
        fields.push('loanInterestPaid = ?');
        values.push(account.loanInterestPaid);
      }
      if (account.loanNextDueDate !== undefined) {
        fields.push('loanNextDueDate = ?');
        values.push(account.loanNextDueDate);
      }
      if (account.description !== undefined) {
        fields.push('description = ?');
        values.push(account.description);
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

  /** How many transactions are recorded against an account. */
  getTransactionCount(id: number): number {
    const row = this.db.getFirstSync('SELECT COUNT(*) as count FROM transactions WHERE accountId = ?', [id]) as { count: number } | null;
    return row?.count ?? 0;
  }

  /**
   * Permanently delete an account. transactions.accountId is a foreign key, so an account that
   * still has transactions cannot be deleted until they are dealt with: by default they are kept
   * for spending history and reports but no longer belong to any account, or with
   * `deleteTransactions` they are deleted along with it. Recurring items pointing at the account
   * are detached by the database itself (ON DELETE SET NULL).
   */
  deleteAccount(id: number, { deleteTransactions = false }: { deleteTransactions?: boolean } = {}): void {
    try {
      DatabaseConnector.getInstance().withTransaction(() => {
        // Cards and EMI plans belong to the account; clear their tag on any transaction being kept
        // before they (and then the account) are deleted, so no dangling references remain.
        this.db.runSync(
          'UPDATE transactions SET cardId = NULL WHERE accountId = ?',
          [id],
        );
        this.db.runSync('DELETE FROM credit_cards WHERE accountId = ?', [id]);
        this.db.runSync('DELETE FROM card_emis WHERE accountId = ?', [id]);
        this.db.runSync(
          deleteTransactions
            ? 'DELETE FROM transactions WHERE accountId = ?'
            : 'UPDATE transactions SET accountId = NULL WHERE accountId = ?',
          [id],
        );
        this.db.runSync('DELETE FROM accounts WHERE id = ?', [id]);
      });
      console.log('Account deleted:', id);
    } catch (error) {
      console.error('Error deleting account:', error);
      throw error;
    }
  }

  /**
   * Get total balance across all active accounts
   */
  getTotalAccountsBalance(profileId?: number): number {
    try {
      let query = "SELECT SUM(balance) as total FROM accounts WHERE isActive = 1 AND type != 'loan'";
      const params: any[] = [];

      if (profileId) {
        query += ' AND profileId = ?';
        params.push(profileId);
      }

      const result = this.db.getFirstSync(query, params);
      return (result as any)?.total || 0;
    } catch (error) {
      console.error('Error getting total accounts balance:', error);
      return 0;
    }
  }

  /**
   * What you own against what you owe. Assets are the positive balances of bank, cash, savings and
   * investment accounts plus money others still owe you. Liabilities are what you owe on credit
   * cards, on money you borrowed, and any account that is overdrawn.
   */
  getNetWorthSummary(profileId?: number): NetWorthSummary {
    const assets: NetWorthItem[] = [];
    const liabilities: NetWorthItem[] = [];

    this.getAccounts(profileId).forEach((account) => {
      const item = { id: account.id, name: account.name, type: account.type };
      if (account.type === 'loan') {
        const outstanding = account.loanStatus === 'fully_paid' ? 0 : round2((account.loanPrincipal || 0) - (account.loanReturnedAmount || 0));
        if (outstanding > 0) (account.isLending ? assets : liabilities).push({ ...item, amount: outstanding });
      } else if (account.balance > 0) {
        assets.push({ ...item, amount: account.balance });
      } else if (account.balance < 0) {
        liabilities.push({ ...item, amount: -account.balance });
      }
    });

    const byAmount = (a: NetWorthItem, b: NetWorthItem) => b.amount - a.amount;
    assets.sort(byAmount);
    liabilities.sort(byAmount);
    const total = (items: NetWorthItem[]) => round2(items.reduce((sum, i) => sum + i.amount, 0));
    const totalAssets = total(assets);
    const totalLiabilities = total(liabilities);

    return { assets, liabilities, totalAssets, totalLiabilities, netWorth: round2(totalAssets - totalLiabilities) };
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
   * Get monthly account balances for a specific year/month
   */
  getMonthlyAccountBalances(profileId?: number): AccountBalanceRow[] {
    try {
      let query = `SELECT id as accountId, name, type, balance as closingBalance,
          isLending, loanPrincipal, loanReturnedAmount, loanStatus, loanTermMonths,
          loanInstallmentAmount, loanNextDueDate, loanExpectedReturnDate
        FROM accounts WHERE isActive = 1`;
      const params: any[] = [];

      if (profileId) {
        query += ' AND profileId = ?';
        params.push(profileId);
      }

      query += ' ORDER BY name';

      return this.db.getAllSync(query, params) as AccountBalanceRow[];
    } catch (error) {
      console.error('Error getting monthly account balances:', error);
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
        // Get the default "Personal" profile, or the first profile available
        const profile = this.db.getFirstSync(
          'SELECT id FROM profiles WHERE name = ? OR id = 1 ORDER BY id LIMIT 1',
          ['Personal']
        ) as { id: number } | null;

        const profileId = profile?.id;

        if (!profileId) {
          console.warn('No default profile found. Cannot initialize default accounts.');
          return;
        }

        const defaultAccounts = [
          { profileId, name: 'Cash Wallet', type: 'cash' as const, balance: 0, currency: 'USD', isActive: true },
          { profileId, name: 'Main Checking', type: 'checking' as const, balance: 0, currency: 'USD', bankName: 'Bank of America', isActive: true },
          { profileId, name: 'Savings Account', type: 'savings' as const, balance: 0, currency: 'USD', bankName: 'Bank of America', isActive: true },
          { profileId, name: 'Credit Card', type: 'credit_card' as const, balance: 0, currency: 'USD', bankName: 'Chase', isActive: true },
        ];

        defaultAccounts.forEach((account) => {
          try {
            this.addAccount(account);
          } catch (error) {
            console.log('Account already exists:', account.name);
          }
        });

        console.log('Default accounts initialized for profile:', profileId);
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

  // --- Loan-related methods now part of AccountService ---

  /**
   * Get loan summary
   */
  getLoanSummary(profileId?: number): any {
    try {
      let whereClause = "WHERE type = 'loan' AND isActive = 1";
      const params: any[] = [];
      if (profileId) {
        whereClause += ' AND profileId = ?';
        params.push(profileId);
      }

      const summary = this.db.getFirstSync(`
        SELECT 
          COALESCE(SUM(CASE WHEN isLending THEN loanPrincipal ELSE 0 END), 0) as totalLoaned,
          COALESCE(SUM(CASE WHEN NOT isLending THEN loanPrincipal ELSE 0 END), 0) as totalBorrowed,
          COALESCE(SUM(CASE WHEN isLending THEN loanReturnedAmount ELSE 0 END), 0) as totalLoanedReturned,
          COALESCE(SUM(CASE WHEN NOT isLending THEN loanReturnedAmount ELSE 0 END), 0) as totalBorrowedReturned,
          COALESCE(SUM(CASE WHEN isLending AND loanStatus != 'fully_paid' THEN loanPrincipal - loanReturnedAmount ELSE 0 END), 0) as outstandingLoans,
          COALESCE(SUM(CASE WHEN NOT isLending AND loanStatus != 'fully_paid' THEN loanPrincipal - loanReturnedAmount ELSE 0 END), 0) as outstandingBorrowings,
          COUNT(CASE WHEN isLending AND loanStatus IN ('active', 'partially_paid') THEN 1 END) as activeLoans,
          COUNT(CASE WHEN NOT isLending AND loanStatus IN ('active', 'partially_paid') THEN 1 END) as activeBorrowings,
          COUNT(CASE WHEN isLending AND loanStatus = 'overdue' THEN 1 END) as overdueLoans,
          COUNT(CASE WHEN NOT isLending AND loanStatus = 'overdue' THEN 1 END) as overdueBorrowings
        FROM accounts
        ${whereClause}
      `, params) as any;

      return {
        totalLoaned: summary.totalLoaned || 0,
        totalBorrowed: summary.totalBorrowed || 0,
        totalLoanedReturned: summary.totalLoanedReturned || 0,
        totalBorrowedReturned: summary.totalBorrowedReturned || 0,
        outstandingLoans: summary.outstandingLoans || 0,
        outstandingBorrowings: summary.outstandingBorrowings || 0,
        activeLoans: summary.activeLoans || 0,
        activeBorrowings: summary.activeBorrowings || 0,
        overdueLoans: summary.overdueLoans || 0,
        overdueBorrowings: summary.overdueBorrowings || 0,
      };
    } catch (error) {
      console.error('Error getting loan summary:', error);
      return {
        totalLoaned: 0,
        totalBorrowed: 0,
        totalLoanedReturned: 0,
        totalBorrowedReturned: 0,
        outstandingLoans: 0,
        outstandingBorrowings: 0,
        activeLoans: 0,
        activeBorrowings: 0,
        overdueLoans: 0,
        overdueBorrowings: 0,
      };
    }
  }

  /**
   * Mark overdue loans based on expected return date
   */
  markOverdueLoans(): number {
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = this.db.runSync(
        `UPDATE accounts 
         SET loanStatus = 'overdue', updatedAt = ? 
         WHERE type = 'loan' 
         AND loanStatus IN ('active', 'partially_paid') 
         AND (
           (loanExpectedReturnDate IS NOT NULL AND DATE(loanExpectedReturnDate) < DATE(?))
           OR (loanNextDueDate IS NOT NULL AND DATE(loanNextDueDate) < DATE(?))
         )`,
        [new Date().toISOString(), today, today]
      );
      
      const updatedCount = result.changes || 0;
      if (updatedCount > 0) {
        console.log(`Marked ${updatedCount} loans as overdue`);
      }
      return updatedCount;
    } catch (error) {
      console.error('Error marking overdue loans:', error);
      return 0;
    }
  }

  /**
   * Records a repayment on a loan account. This is now handled by the TransactionService's addTransfer method,
   * but this helper can update the loan-specific fields.
   */
  recordRepaymentOnLoanAccount(loanAccountId: number, paymentAmount: number): void {
    const loanAccount = this.getAccountById(loanAccountId);
    if (!loanAccount || loanAccount.type !== 'loan') {
      throw new Error('Invalid loan account specified.');
    }

    // Half a cent of tolerance so floating-point drift cannot block or miss a final payoff
    const principal = loanAccount.loanPrincipal || 0;
    let newReturnedAmount = (loanAccount.loanReturnedAmount || 0) + paymentAmount;
    if (newReturnedAmount > principal + 0.005) {
      throw new Error('Payment exceeds outstanding loan amount.');
    }

    let newStatus: Account['loanStatus'] = 'partially_paid';
    if (newReturnedAmount >= principal - 0.005) {
      newReturnedAmount = principal;
      newStatus = 'fully_paid';
    }

    this.updateAccount(loanAccountId, {
      loanReturnedAmount: newReturnedAmount,
      loanStatus: newStatus as any,
      loanActualReturnDate: newStatus === 'fully_paid' ? new Date().toISOString().split('T')[0] : loanAccount.loanActualReturnDate,
    });
  }

  /**
   * Increases the principal of an existing loan account.
   */
  increaseLoanPrincipal(loanAccountId: number, increaseAmount: number): void {
    const loanAccount = this.getAccountById(loanAccountId);
    if (!loanAccount || loanAccount.type !== 'loan') {
      throw new Error('Invalid loan account specified.');
    }

    const newPrincipal = (loanAccount.loanPrincipal || 0) + increaseAmount;
    
    // Also update the main balance of the account
    const newBalance = loanAccount.isLending ? loanAccount.balance + increaseAmount : loanAccount.balance - increaseAmount;

    this.updateAccount(loanAccountId, {
      loanPrincipal: newPrincipal,
      balance: newBalance,
      // If it was fully paid, it's now active again
      loanStatus: loanAccount.loanStatus === 'fully_paid' ? 'active' : loanAccount.loanStatus,
    });
  }
}

export default AccountService;
