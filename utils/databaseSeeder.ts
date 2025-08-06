/**
 * Database Seeder Utility
 * This file helps create and manage pre-seeded database content
 */

import { getAccountService, getTransactionService, getLoanService } from '../database';

export class DatabaseSeeder {
  
  /**
   * Seeds the database with production-ready sample data
   * Use this for app store submissions or demos
   */
  static seedProductionData = (): boolean => {
    try {
      console.log('🌱 Seeding production data...');
      
      // Clear existing data first
      // DatabaseService.clearAllData();
      
      // Insert realistic sample data
      const accountService = getAccountService();
      const accounts = accountService.getAccounts();
      const cashAccount = accounts.find(acc => acc.type === 'cash');
      const checkingAccount = accounts.find(acc => acc.type === 'checking');
      
      // More realistic transaction patterns
      const productionTransactions = [
        // Monthly salary
        { amount: 4500, type: 'income' as const, category: 'Salary', description: 'Monthly salary', date: this.getDateDaysAgo(30), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: undefined },
        
        // Fixed expenses
        { amount: 1500, type: 'expense' as const, category: 'Family', description: 'Rent payment', date: this.getDateDaysAgo(29), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        { amount: 120, type: 'expense' as const, category: 'Transport', description: 'Monthly transit pass', date: this.getDateDaysAgo(28), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        
        // Weekly groceries
        { amount: 280, type: 'expense' as const, category: 'Food', description: 'Weekly groceries', date: this.getDateDaysAgo(25), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        { amount: 320, type: 'expense' as const, category: 'Food', description: 'Weekly groceries', date: this.getDateDaysAgo(18), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        { amount: 295, type: 'expense' as const, category: 'Food', description: 'Weekly groceries', date: this.getDateDaysAgo(11), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        { amount: 310, type: 'expense' as const, category: 'Food', description: 'Weekly groceries', date: this.getDateDaysAgo(4), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        
        // Dining out
        { amount: 65, type: 'expense' as const, category: 'Restaurant', description: 'Weekend dinner', date: this.getDateDaysAgo(22), paymentMethod: 'credit_card' as const, accountId: cashAccount?.id, priority: 'want' as const },
        { amount: 45, type: 'expense' as const, category: 'Restaurant', description: 'Lunch with colleagues', date: this.getDateDaysAgo(15), paymentMethod: 'credit_card' as const, accountId: cashAccount?.id, priority: 'want' as const },
        
        // Entertainment
        { amount: 89, type: 'expense' as const, category: 'Free time', description: 'Streaming subscriptions', date: this.getDateDaysAgo(20), paymentMethod: 'credit_card' as const, accountId: cashAccount?.id, priority: 'want' as const },
        { amount: 150, type: 'expense' as const, category: 'Shopping', description: 'New winter jacket', date: this.getDateDaysAgo(12), paymentMethod: 'credit_card' as const, accountId: cashAccount?.id, priority: 'need' as const },
        
        // Health & wellness
        { amount: 80, type: 'expense' as const, category: 'Health', description: 'Gym membership', date: this.getDateDaysAgo(27), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'want' as const },
        
        // Transportation
        { amount: 45, type: 'expense' as const, category: 'Transport', description: 'Gas refill', date: this.getDateDaysAgo(19), paymentMethod: 'credit_card' as const, accountId: cashAccount?.id, priority: 'need' as const },
        { amount: 25, type: 'expense' as const, category: 'Transport', description: 'Parking fee', date: this.getDateDaysAgo(8), paymentMethod: 'cash' as const, accountId: cashAccount?.id, priority: 'need' as const },
      ];
      
      // Insert transactions
      const transactionService = getTransactionService();
      productionTransactions.forEach(transaction => {
        if (transaction.accountId) {
          transactionService.addTransaction(transaction);
        }
      });
      
      // Add realistic loans
      const productionLoans = [
        {
          borrowerName: 'Alex Chen',
          borrowerContact: '+1 555-0123',
          amount: 800,
          lentDate: this.getDateDaysAgo(45),
          expectedReturnDate: this.getDateDaysAgo(-15), // 15 days from now
          description: 'Emergency medical expenses',
        },
      ];
      
      const loanService = getLoanService();
      productionLoans.forEach(loan => {
        loanService.addLoan(loan);
      });
      
      console.log('✅ Production data seeded successfully');
      return true;
    } catch (error) {
      console.error('❌ Error seeding production data:', error);
      return false;
    }
  };
  
  /**
   * Seeds with minimal essential data only
   * Use this for clean app installations
   */
  static seedMinimalData = (): boolean => {
    try {
      console.log('🌱 Seeding minimal data...');
      
      // Only add a basic account setup
      const now = new Date().toISOString();
      
      // Add one basic account of each type with zero balance
      const minimalAccounts = [
        { name: 'Wallet', type: 'cash' as const, balance: 0, currency: 'USD' },
        { name: 'Bank Account', type: 'checking' as const, balance: 0, currency: 'USD' },
      ];
      
      const accountService = getAccountService();
      minimalAccounts.forEach(account => {
        accountService.addAccount({
          ...account,
          isActive: true,
        });
      });
      
      console.log('✅ Minimal data seeded successfully');
      return true;
    } catch (error) {
      console.error('❌ Error seeding minimal data:', error);
      return false;
    }
  };
  
  private static getDateDaysAgo = (daysAgo: number): string => {
    const date = new Date();
    date.setDate(date.getDate() - daysAgo);
    return date.toISOString().split('T')[0];
  };
}

export default DatabaseSeeder;
