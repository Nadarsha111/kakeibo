/**
 * Database Seeder Utility
 * This file helps create and manage pre-seeded database content
 */

import { getAccountService, getProfileService, getTransactionService, DatabaseUtils } from '../database';

export class DatabaseSeeder {
  
  /**
   * Seeds the database with production-ready sample data
   * Use this for app store submissions or demos
   */
  static seedProductionData = (): boolean => {
    try {
      console.log('🌱 Seeding production data...');
      
      // Make sure the default profile and accounts exist before we look them up
      const accountService = getAccountService();
      accountService.initializeDefaultAccounts();

      // Don't stack duplicate sample data on a database that already has transactions
      const existing = DatabaseUtils.getDatabase().getFirstSync('SELECT COUNT(*) as count FROM transactions') as { count: number } | null;
      if (existing && existing.count > 0) {
        console.log('⏭️ Transactions already exist, skipping production seed');
        return false;
      }

      const accounts = accountService.getAccounts();
      const cashAccount = accounts.find(acc => acc.type === 'cash');
      const checkingAccount = accounts.find(acc => acc.type === 'checking');
      const profileId = checkingAccount?.profileId ?? getProfileService().getProfiles()[0]?.id;
      if (!profileId) {
        throw new Error('No profile exists to seed data into.');
      }

      // More realistic transaction patterns
      const productionTransactions = [
        // Monthly salary
        { profileId, amount: 4500, type: 'income' as const, category: 'Salary', description: 'Monthly salary', date: this.getDateDaysAgo(30), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: undefined },
        
        // Fixed expenses
        { profileId, amount: 1500, type: 'expense' as const, category: 'Family', description: 'Rent payment', date: this.getDateDaysAgo(29), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        { profileId, amount: 120, type: 'expense' as const, category: 'Transport', description: 'Monthly transit pass', date: this.getDateDaysAgo(28), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        
        // Weekly groceries
        { profileId, amount: 280, type: 'expense' as const, category: 'Food', description: 'Weekly groceries', date: this.getDateDaysAgo(25), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        { profileId, amount: 320, type: 'expense' as const, category: 'Food', description: 'Weekly groceries', date: this.getDateDaysAgo(18), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        { profileId, amount: 295, type: 'expense' as const, category: 'Food', description: 'Weekly groceries', date: this.getDateDaysAgo(11), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        { profileId, amount: 310, type: 'expense' as const, category: 'Food', description: 'Weekly groceries', date: this.getDateDaysAgo(4), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'need' as const },
        
        // Dining out
        { profileId, amount: 65, type: 'expense' as const, category: 'Restaurant', description: 'Weekend dinner', date: this.getDateDaysAgo(22), paymentMethod: 'credit_card' as const, accountId: cashAccount?.id, priority: 'want' as const },
        { profileId, amount: 45, type: 'expense' as const, category: 'Restaurant', description: 'Lunch with colleagues', date: this.getDateDaysAgo(15), paymentMethod: 'credit_card' as const, accountId: cashAccount?.id, priority: 'want' as const },
        
        // Entertainment
        { profileId, amount: 89, type: 'expense' as const, category: 'Free time', description: 'Streaming subscriptions', date: this.getDateDaysAgo(20), paymentMethod: 'credit_card' as const, accountId: cashAccount?.id, priority: 'want' as const },
        { profileId, amount: 150, type: 'expense' as const, category: 'Shopping', description: 'New winter jacket', date: this.getDateDaysAgo(12), paymentMethod: 'credit_card' as const, accountId: cashAccount?.id, priority: 'need' as const },
        
        // Health & wellness
        { profileId, amount: 80, type: 'expense' as const, category: 'Health', description: 'Gym membership', date: this.getDateDaysAgo(27), paymentMethod: 'debit_card' as const, accountId: checkingAccount?.id, priority: 'want' as const },
        
        // Transportation
        { profileId, amount: 45, type: 'expense' as const, category: 'Transport', description: 'Gas refill', date: this.getDateDaysAgo(19), paymentMethod: 'credit_card' as const, accountId: cashAccount?.id, priority: 'need' as const },
        { profileId, amount: 25, type: 'expense' as const, category: 'Transport', description: 'Parking fee', date: this.getDateDaysAgo(8), paymentMethod: 'cash' as const, accountId: cashAccount?.id, priority: 'need' as const },
      ];
      // Insert transactions
      const transactionService = getTransactionService();
      productionTransactions.forEach(transaction => {
        if (transaction.accountId) {
          transactionService.addTransaction(transaction);
        }
      });
      
      // Add a realistic loan (loans are accounts with type 'loan')
      accountService.addAccount({
        profileId,
        name: 'Loan to Alex Chen',
        type: 'loan',
        balance: 0,
        currency: 'USD',
        isActive: true,
        isLending: true,
        loanPrincipal: 800,
        loanCounterpartyName: 'Alex Chen',
        loanCounterpartyContact: '+1 555-0123',
        loanLentDate: this.getDateDaysAgo(45),
        loanExpectedReturnDate: this.getDateDaysAgo(-15), // 15 days from now
        description: 'Emergency medical expenses',
      });

      console.log('✅ Production data seeded successfully');
      return true;
    } catch (error) {
      console.error('❌ Error seeding production data:', error);
      return false;
    }
  };
  
  /**
   * Seeds extra profiles (Business, Family, Vacation), each with its own accounts and
   * transactions. A profile whose name already exists is skipped, so this is safe to re-run.
   */
  static seedSampleProfiles = (): boolean => {
    try {
      console.log('🌱 Seeding sample profiles...');

      const profileService = getProfileService();
      const accountService = getAccountService();
      const transactionService = getTransactionService();

      type AccountType = 'cash' | 'checking' | 'savings' | 'credit_card';
      const paymentMethodFor = {
        cash: 'cash',
        checking: 'debit_card',
        savings: 'debit_card',
        credit_card: 'credit_card',
      } as const;

      const profileSpecs = [
        {
          name: 'Business',
          description: 'Freelance and small business finances',
          accounts: [
            { key: 'main', name: 'Business Checking', type: 'checking' as AccountType, balance: 8000, bankName: 'Chase' },
            { key: 'card', name: 'Business Credit Card', type: 'credit_card' as AccountType, balance: 0, bankName: 'Amex' },
            { key: 'cash', name: 'Petty Cash', type: 'cash' as AccountType, balance: 300 },
          ],
          transactions: [
            { account: 'main', amount: 3200, type: 'income' as const, category: 'Salary', description: 'Client invoice - website redesign', daysAgo: 34 },
            { account: 'main', amount: 2400, type: 'income' as const, category: 'Salary', description: 'Client invoice - monthly retainer', daysAgo: 21 },
            { account: 'main', amount: 1800, type: 'income' as const, category: 'Salary', description: 'Client invoice - consulting', daysAgo: 9 },
            { account: 'main', amount: 600, type: 'income' as const, category: 'Investment', description: 'Business savings interest', daysAgo: 3 },
            { account: 'main', amount: 750, type: 'expense' as const, category: 'Shopping', description: 'Co-working space membership', daysAgo: 31, priority: 'need' as const },
            { account: 'card', amount: 129, type: 'expense' as const, category: 'Shopping', description: 'Design software subscription', daysAgo: 26, priority: 'need' as const },
            { account: 'card', amount: 899, type: 'expense' as const, category: 'Shopping', description: 'Monitor for home office', daysAgo: 17, priority: 'want' as const },
            { account: 'card', amount: 84, type: 'expense' as const, category: 'Restaurant', description: 'Client lunch', daysAgo: 13, priority: 'want' as const },
            { account: 'card', amount: 210, type: 'expense' as const, category: 'Transport', description: 'Train tickets to client site', daysAgo: 12, priority: 'need' as const },
            { account: 'cash', amount: 35, type: 'expense' as const, category: 'Transport', description: 'Taxi to meeting', daysAgo: 7, priority: 'need' as const },
            { account: 'main', amount: 120, type: 'expense' as const, category: 'Gift', description: 'Holiday gifts for clients', daysAgo: 5, priority: 'want' as const },
          ],
        },
        {
          name: 'Family',
          description: 'Shared household budget',
          accounts: [
            { key: 'main', name: 'Household Checking', type: 'checking' as AccountType, balance: 3500, bankName: 'Wells Fargo' },
            { key: 'savings', name: 'Family Savings', type: 'savings' as AccountType, balance: 12000, bankName: 'Wells Fargo' },
            { key: 'cash', name: 'Grocery Cash', type: 'cash' as AccountType, balance: 200 },
          ],
          transactions: [
            { account: 'main', amount: 3800, type: 'income' as const, category: 'Salary', description: 'Partner salary', daysAgo: 30 },
            { account: 'savings', amount: 150, type: 'income' as const, category: 'Investment', description: 'Savings interest', daysAgo: 28 },
            { account: 'main', amount: 900, type: 'expense' as const, category: 'Family', description: 'Childcare', daysAgo: 29, priority: 'need' as const },
            { account: 'main', amount: 350, type: 'expense' as const, category: 'Family', description: 'School activities and supplies', daysAgo: 20, priority: 'need' as const },
            { account: 'cash', amount: 95, type: 'expense' as const, category: 'Food', description: 'Farmers market', daysAgo: 16, priority: 'need' as const },
            { account: 'main', amount: 240, type: 'expense' as const, category: 'Food', description: 'Supermarket shop', daysAgo: 10, priority: 'need' as const },
            { account: 'main', amount: 62, type: 'expense' as const, category: 'Health', description: 'Pharmacy', daysAgo: 14, priority: 'need' as const },
            { account: 'main', amount: 110, type: 'expense' as const, category: 'Free time', description: 'Family day at the zoo', daysAgo: 8, priority: 'want' as const },
            { account: 'cash', amount: 40, type: 'expense' as const, category: 'Gift', description: 'Birthday present for nephew', daysAgo: 6, priority: 'want' as const },
            { account: 'main', amount: 70, type: 'expense' as const, category: 'Transport', description: 'Fuel', daysAgo: 2, priority: 'need' as const },
          ],
        },
        {
          name: 'Vacation',
          description: 'Summer trip savings and spending',
          accounts: [
            { key: 'savings', name: 'Trip Savings', type: 'savings' as AccountType, balance: 2500, bankName: 'Ally' },
            { key: 'card', name: 'Travel Credit Card', type: 'credit_card' as AccountType, balance: 0, bankName: 'Chase' },
          ],
          transactions: [
            { account: 'savings', amount: 500, type: 'income' as const, category: 'Salary', description: 'Monthly trip contribution', daysAgo: 27 },
            { account: 'savings', amount: 500, type: 'income' as const, category: 'Salary', description: 'Monthly trip contribution', daysAgo: 2 },
            { account: 'card', amount: 640, type: 'expense' as const, category: 'Transport', description: 'Flights', daysAgo: 24, priority: 'need' as const },
            { account: 'card', amount: 480, type: 'expense' as const, category: 'Free time', description: 'Hotel deposit', daysAgo: 19, priority: 'need' as const },
            { account: 'card', amount: 72, type: 'expense' as const, category: 'Shopping', description: 'Luggage', daysAgo: 11, priority: 'need' as const },
            { account: 'card', amount: 58, type: 'expense' as const, category: 'Restaurant', description: 'Trip planning dinner', daysAgo: 6, priority: 'want' as const },
          ],
        },
      ];

      const existingNames = new Set(profileService.getProfiles().map(p => p.name));

      profileSpecs.forEach(spec => {
        if (existingNames.has(spec.name)) {
          console.log(`⏭️ Profile "${spec.name}" already exists, skipping`);
          return;
        }

        const profileId = profileService.addProfile({ name: spec.name, description: spec.description });

        const accountIds: Record<string, number> = {};
        const accountTypes: Record<string, AccountType> = {};
        spec.accounts.forEach(({ key, ...account }) => {
          accountIds[key] = accountService.addAccount({
            ...account,
            profileId,
            currency: 'USD',
            isActive: true,
          });
          accountTypes[key] = account.type;
        });

        spec.transactions.forEach(({ account, daysAgo, ...transaction }) => {
          transactionService.addTransaction({
            ...transaction,
            profileId,
            date: this.getDateDaysAgo(daysAgo),
            paymentMethod: paymentMethodFor[accountTypes[account]],
            accountId: accountIds[account],
          });
        });

        console.log(`✅ Seeded profile "${spec.name}" (${spec.accounts.length} accounts, ${spec.transactions.length} transactions)`);
      });

      return true;
    } catch (error) {
      console.error('❌ Error seeding sample profiles:', error);
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

      const profileId = getProfileService().getProfiles()[0]?.id;
      if (!profileId) {
        throw new Error('No profile exists to seed accounts into.');
      }

      // Add one basic account of each type with zero balance
      const minimalAccounts = [
        { name: 'Wallet', type: 'cash' as const, balance: 0, currency: 'USD' },
        { name: 'Bank Account', type: 'checking' as const, balance: 0, currency: 'USD' },
      ];

      const accountService = getAccountService();
      minimalAccounts.forEach(account => {
        accountService.addAccount({
          ...account,
          profileId,
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
