import DatabaseConnector from './DatabaseConnector';
import { Loan, LoanSummary } from '../types';
import AccountService from './AccountService';
import TransactionService from './TransactionService';

/**
 * Service class for loan CRUD operations and business logic
 */
class LoanService {
  private db: ReturnType<DatabaseConnector['getDatabase']>;
  private accountService: AccountService;
  private transactionService: TransactionService;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
    this.accountService = new AccountService();
    this.transactionService = new TransactionService();
  }

  /**
   * Add a new loan
   */
  addLoan(loan: {
    borrowerName: string;
    borrowerContact?: string;
    amount: number;
    lentDate: string;
    expectedReturnDate?: string;
    description?: string;
    accountId?: number;
  }): number {
    try {
      return DatabaseConnector.getInstance().withTransaction(() => {
        const now = new Date().toISOString();
        
        // Insert loan record
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
          this.accountService.updateAccountBalanceForTransaction(loan.accountId, loan.amount, 'expense');
        }

        console.log('Loan added:', { id: result.lastInsertRowId, borrower: loan.borrowerName, amount: loan.amount });
        return result.lastInsertRowId;
      });
    } catch (error) {
      console.error('Error adding loan:', error);
      throw error;
    }
  }

  /**
   * Get all loans with optional status filter
   */
  getLoans(status?: 'active' | 'partially_paid' | 'fully_paid' | 'overdue'): Loan[] {
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
  }

  /**
   * Get loan by ID
   */
  getLoanById(id: number): Loan | null {
    try {
      return this.db.getFirstSync('SELECT * FROM loans WHERE id = ?', [id]) as Loan | null;
    } catch (error) {
      console.error('Error getting loan by id:', error);
      return null;
    }
  }

  /**
   * Get loans by borrower name
   */
  getLoansByBorrower(borrowerName: string): Loan[] {
    try {
      return this.db.getAllSync(
        'SELECT * FROM loans WHERE borrowerName LIKE ? ORDER BY lentDate DESC',
        [`%${borrowerName}%`]
      ) as Loan[];
    } catch (error) {
      console.error('Error getting loans by borrower:', error);
      return [];
    }
  }

  /**
   * Get loans for a specific account
   */
  getLoansByAccount(accountId: number): Loan[] {
    try {
      return this.db.getAllSync(
        'SELECT * FROM loans WHERE accountId = ? ORDER BY lentDate DESC',
        [accountId]
      ) as Loan[];
    } catch (error) {
      console.error('Error getting loans by account:', error);
      return [];
    }
  }

  /**
   * Record a loan payment
   */
  recordLoanPayment(loanId: number, paymentAmount: number, paymentDate: string): void {
    try {
      DatabaseConnector.getInstance().withTransaction(() => {
        const loan = this.getLoanById(loanId);
        if (!loan) {
          throw new Error('Loan not found');
        }

        if (paymentAmount <= 0) {
          throw new Error('Payment amount must be positive');
        }

        const newReturnedAmount = loan.returnedAmount + paymentAmount;
        
        // Validate that total returned doesn't exceed loan amount
        if (newReturnedAmount > loan.amount) {
          throw new Error(`Payment amount would exceed loan balance. Maximum payment: ${loan.amount - loan.returnedAmount}`);
        }

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
          this.transactionService.addTransaction({
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
      });
    } catch (error) {
      console.error('Error recording loan payment:', error);
      throw error;
    }
  }

  /**
   * Update loan details
   */
  updateLoan(id: number, updates: {
    borrowerName?: string;
    borrowerContact?: string;
    expectedReturnDate?: string;
    description?: string;
    status?: 'active' | 'partially_paid' | 'fully_paid' | 'overdue';
  }): void {
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

      if (fields.length === 0) {
        console.warn('No fields to update for loan:', id);
        return;
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
  }

  /**
   * Delete a loan
   */
  deleteLoan(id: number): void {
    try {
      DatabaseConnector.getInstance().withTransaction(() => {
        // Get loan details before deletion
        const loan = this.getLoanById(id);
        if (!loan) {
          throw new Error('Loan not found');
        }

        // If loan had payments, we might want to create a compensating transaction
        // For now, we'll just log the deletion
        if (loan.returnedAmount > 0) {
          console.warn(`Deleting loan with ${loan.returnedAmount} already returned out of ${loan.amount}`);
        }

        this.db.runSync('DELETE FROM loans WHERE id = ?', [id]);
        
        console.log('Loan deleted:', id);
      });
    } catch (error) {
      console.error('Error deleting loan:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive loan summary
   */
  getLoanSummary(): LoanSummary {
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
  }

  /**
   * Mark overdue loans based on expected return date
   */
  markOverdueLoans(): number {
    try {
      const today = new Date().toISOString().split('T')[0];
      const result = this.db.runSync(
        `UPDATE loans 
         SET status = 'overdue', updatedAt = ? 
         WHERE status IN ('active', 'partially_paid') 
         AND expectedReturnDate IS NOT NULL 
         AND DATE(expectedReturnDate) < DATE(?)`,
        [new Date().toISOString(), today]
      );
      
      const updatedCount = result.changes || 0;
      console.log(`Marked ${updatedCount} loans as overdue`);
      return updatedCount;
    } catch (error) {
      console.error('Error marking overdue loans:', error);
      return 0;
    }
  }

  /**
   * Get loans that are due soon (within specified days)
   */
  getUpcomingDueLoans(daysAhead: number = 7): Loan[] {
    try {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + daysAhead);
      const futureDateStr = futureDate.toISOString().split('T')[0];
      const today = new Date().toISOString().split('T')[0];

      return this.db.getAllSync(
        `SELECT * FROM loans 
         WHERE status IN ('active', 'partially_paid') 
         AND expectedReturnDate IS NOT NULL 
         AND DATE(expectedReturnDate) BETWEEN DATE(?) AND DATE(?)
         ORDER BY expectedReturnDate ASC`,
        [today, futureDateStr]
      ) as Loan[];
    } catch (error) {
      console.error('Error getting upcoming due loans:', error);
      return [];
    }
  }

  /**
   * Get loan statistics
   */
  getLoanStatistics(): {
    totalBorrowers: number;
    averageLoanAmount: number;
    averageRepaymentTime: number; // in days
    repaymentRate: number; // percentage of fully paid loans
    mostReliableBorrower: string | null;
    largestOutstandingLoan: number;
  } {
    try {
      const stats = this.db.getFirstSync(`
        SELECT 
          COUNT(DISTINCT borrowerName) as totalBorrowers,
          AVG(amount) as averageLoanAmount,
          COUNT(CASE WHEN status = 'fully_paid' THEN 1 END) as fullyPaidCount,
          COUNT(*) as totalLoans,
          MAX(amount - returnedAmount) as largestOutstanding
        FROM loans
      `) as any;

      // Get average repayment time for fully paid loans
      const repaymentTimeResult = this.db.getFirstSync(`
        SELECT AVG(
          CASE 
            WHEN actualReturnDate IS NOT NULL 
            THEN julianday(actualReturnDate) - julianday(lentDate)
            ELSE NULL
          END
        ) as averageRepaymentTime
        FROM loans 
        WHERE status = 'fully_paid' AND actualReturnDate IS NOT NULL
      `) as { averageRepaymentTime: number | null };

      // Get most reliable borrower (highest full repayment rate)
      const reliableBorrowerResult = this.db.getFirstSync(`
        SELECT borrowerName
        FROM loans
        GROUP BY borrowerName
        HAVING COUNT(*) > 1
        ORDER BY 
          CAST(SUM(CASE WHEN status = 'fully_paid' THEN 1 ELSE 0 END) AS REAL) / COUNT(*) DESC,
          COUNT(*) DESC
        LIMIT 1
      `) as { borrowerName: string } | null;

      const repaymentRate = stats.totalLoans > 0 ? (stats.fullyPaidCount / stats.totalLoans) * 100 : 0;

      return {
        totalBorrowers: stats.totalBorrowers || 0,
        averageLoanAmount: stats.averageLoanAmount || 0,
        averageRepaymentTime: repaymentTimeResult.averageRepaymentTime || 0,
        repaymentRate,
        mostReliableBorrower: reliableBorrowerResult?.borrowerName || null,
        largestOutstandingLoan: stats.largestOutstanding || 0,
      };
    } catch (error) {
      console.error('Error getting loan statistics:', error);
      return {
        totalBorrowers: 0,
        averageLoanAmount: 0,
        averageRepaymentTime: 0,
        repaymentRate: 0,
        mostReliableBorrower: null,
        largestOutstandingLoan: 0,
      };
    }
  }

  /**
   * Get borrower summary with their loan history
   */
  getBorrowerSummary(): Array<{
    borrowerName: string;
    borrowerContact: string | null;
    totalLoaned: number;
    totalReturned: number;
    outstandingAmount: number;
    loanCount: number;
    fullyPaidCount: number;
    repaymentRate: number;
    lastLoanDate: string;
    status: 'good' | 'warning' | 'poor';
  }> {
    try {
      const borrowers = this.db.getAllSync(`
        SELECT 
          borrowerName,
          borrowerContact,
          SUM(amount) as totalLoaned,
          SUM(returnedAmount) as totalReturned,
          SUM(amount - returnedAmount) as outstandingAmount,
          COUNT(*) as loanCount,
          COUNT(CASE WHEN status = 'fully_paid' THEN 1 END) as fullyPaidCount,
          MAX(lentDate) as lastLoanDate
        FROM loans
        GROUP BY borrowerName, borrowerContact
        ORDER BY outstandingAmount DESC, totalLoaned DESC
      `) as Array<{
        borrowerName: string;
        borrowerContact: string | null;
        totalLoaned: number;
        totalReturned: number;
        outstandingAmount: number;
        loanCount: number;
        fullyPaidCount: number;
        lastLoanDate: string;
      }>;

      return borrowers.map(borrower => {
        const repaymentRate = borrower.loanCount > 0 ? (borrower.fullyPaidCount / borrower.loanCount) * 100 : 0;
        
        let status: 'good' | 'warning' | 'poor' = 'good';
        if (repaymentRate < 50) {
          status = 'poor';
        } else if (repaymentRate < 80 || borrower.outstandingAmount > borrower.totalReturned) {
          status = 'warning';
        }

        return {
          ...borrower,
          repaymentRate,
          status
        };
      });
    } catch (error) {
      console.error('Error getting borrower summary:', error);
      return [];
    }
  }

  /**
   * Get loans with their payment history
   */
  getLoansWithPaymentHistory(): Array<Loan & {
    paymentHistory: Array<{ date: string; amount: number; runningTotal: number }>;
    remainingBalance: number;
  }> {
    try {
      const loans = this.getLoans();
      
      // For this implementation, we'll simulate payment history based on returnedAmount
      // In a real application, you might want a separate payments table
      return loans.map(loan => {
        const paymentHistory = [];
        
        if (loan.returnedAmount > 0) {
          // This is a simplified approach - in reality you'd track individual payments
          paymentHistory.push({
            date: loan.actualReturnDate || loan.lentDate,
            amount: loan.returnedAmount,
            runningTotal: loan.returnedAmount
          });
        }

        return {
          ...loan,
          paymentHistory,
          remainingBalance: loan.amount - loan.returnedAmount
        };
      });
    } catch (error) {
      console.error('Error getting loans with payment history:', error);
      return [];
    }
  }

  /**
   * Calculate interest if applicable (for future enhancement)
   */
  calculateInterest(loanId: number, interestRate: number, compoundingPeriod: 'daily' | 'monthly' | 'yearly' = 'yearly'): number {
    try {
      const loan = this.getLoanById(loanId);
      if (!loan) {
        throw new Error('Loan not found');
      }

      const principal = loan.amount - loan.returnedAmount;
      if (principal <= 0) {
        return 0;
      }

      const lentDate = new Date(loan.lentDate);
      const currentDate = new Date();
      const timeDiff = currentDate.getTime() - lentDate.getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));

      let periods: number;
      switch (compoundingPeriod) {
        case 'daily':
          periods = daysDiff;
          break;
        case 'monthly':
          periods = daysDiff / 30.44; // Average days per month
          break;
        case 'yearly':
          periods = daysDiff / 365.25; // Account for leap years
          break;
      }

      const interestAmount = principal * (interestRate / 100) * periods;
      return Math.round(interestAmount * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      console.error('Error calculating interest:', error);
      return 0;
    }
  }
}

export default LoanService;
