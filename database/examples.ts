/**
 * Example usage of the new database service architecture
 * This file demonstrates how to use the separate services instead of the monolithic DatabaseService
 */

import {
  DatabaseConnector,
  ServiceFactory,
  getAccountService,
  getTransactionService,
  getCategoryService,
  getLoanService,
  getSettingsService,
  DatabaseUtils
} from './index';

/**
 * Example 1: Using ServiceFactory (Recommended approach)
 */
export const exampleUsingServiceFactory = async () => {
  try {
    // Initialize the database services
    await DatabaseUtils.initialize();

    // Get all services at once
    const {
      accountService,
      transactionService,
      categoryService,
      loanService,
      settingsService
    } = ServiceFactory.getAllServices();

    // Example account operations
    const accounts = accountService.getAccounts();
    console.log('Accounts:', accounts.length);

    // Add a new account
    const newAccountId = accountService.addAccount({
      name: 'Test Savings',
      type: 'savings',
      balance: 1000,
      currency: 'USD',
      isActive: true
    });

    // Example transaction operations
    const transactionId = transactionService.addTransaction({
      amount: 50,
      type: 'expense',
      category: 'Food',
      description: 'Grocery shopping',
      date: new Date().toISOString().split('T')[0],
      paymentMethod: 'debit_card',
      accountId: newAccountId,
      priority: 'need'
    });

    // Get transactions for the past week
    const endDate = new Date().toISOString().split('T')[0];
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 7);
    const recentTransactions = transactionService.getTransactionsByDateRange(
      startDate.toISOString().split('T')[0],
      endDate
    );

    // Example category operations
    const categories = categoryService.getCategories();
    const expenseCategories = categoryService.getCategoriesByType('expense');

    // Example loan operations
    const loanId = loanService.addLoan({
      borrowerName: 'John Doe',
      borrowerContact: 'john@example.com',
      amount: 500,
      lentDate: new Date().toISOString().split('T')[0],
      expectedReturnDate: '2025-09-01',
      description: 'Personal loan',
      accountId: newAccountId
    });

    // Example settings operations
    settingsService.setSetting('currency', 'USD');
    settingsService.setBooleanSetting('darkMode', true);
    const currency = settingsService.getSetting('currency');

    console.log('Example completed successfully', {
      accountId: newAccountId,
      transactionId,
      categoriesCount: categories.length,
      expenseCategoriesCount: expenseCategories.length,
      loanId,
      currency
    });

  } catch (error) {
    console.error('Error in service factory example:', error);
  }
};

/**
 * Example 2: Using individual service functions
 */
export const exampleUsingIndividualServices = () => {
  try {
    // Get individual services
    const accountService = getAccountService();
    const transactionService = getTransactionService();
    const categoryService = getCategoryService();

    // Use services independently
    const totalBalance = accountService.getTotalAccountsBalance();
    const categories = categoryService.getCategories();
    const recentTransactions = transactionService.getRecentTransactions(5);

    console.log('Individual services example:', {
      totalBalance,
      categoriesCount: categories.length,
      recentTransactionsCount: recentTransactions.length
    });

  } catch (error) {
    console.error('Error in individual services example:', error);
  }
};

/**
 * Example 3: Using transactions for complex operations
 */
export const exampleUsingTransactions = () => {
  try {
    // Use DatabaseUtils for transaction management
    DatabaseUtils.withTransaction(() => {
      const accountService = getAccountService();
      const transactionService = getTransactionService();

      // Create account
      const accountId = accountService.addAccount({
        name: 'Transaction Test Account',
        type: 'checking',
        balance: 1000,
        currency: 'USD',
        isActive: true
      });

      // Add multiple transactions
      transactionService.addTransaction({
        amount: 100,
        type: 'expense',
        category: 'Food',
        description: 'Groceries',
        date: new Date().toISOString().split('T')[0],
        paymentMethod: 'debit_card',
        accountId
      });

      transactionService.addTransaction({
        amount: 50,
        type: 'expense',
        category: 'Transport',
        description: 'Gas',
        date: new Date().toISOString().split('T')[0],
        paymentMethod: 'credit_card',
        accountId
      });

      console.log('Transaction example completed successfully');
    });

  } catch (error) {
    console.error('Error in transaction example:', error);
  }
};

/**
 * Example 4: Advanced analytics using multiple services
 */
export const exampleAdvancedAnalytics = () => {
  try {
    const transactionService = getTransactionService();
    const categoryService = getCategoryService();
    const accountService = getAccountService();

    // Get date range for this month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const startDate = startOfMonth.toISOString().split('T')[0];
    const endDate = endOfMonth.toISOString().split('T')[0];

    // Get comprehensive analytics
    const monthlyStats = transactionService.getTransactionStats(startDate, endDate);
    const categorySummary = transactionService.getCategorySummary(startDate, endDate);
    const needWantSummary = transactionService.getNeedWantSummary({ startDate, endDate });
    const budgetPerformance = categoryService.getBudgetPerformance(startDate, endDate);
    const accountSummary = accountService.getAccountSummary();

    console.log('Advanced Analytics:', {
      monthlyStats,
      categorySummary: categorySummary.slice(0, 5), // Top 5 categories
      needWantSummary,
      budgetPerformance: budgetPerformance.slice(0, 3), // Top 3 budgets
      accountSummary: accountSummary.slice(0, 3) // Top 3 accounts
    });

  } catch (error) {
    console.error('Error in advanced analytics example:', error);
  }
};

/**
 * Example 5: Health check and error handling
 */
export const exampleHealthCheck = async () => {
  try {
    // Perform health check
    const healthStatus = DatabaseUtils.healthCheck();
    console.log('Database Health Check:', healthStatus);

    if (healthStatus.status === 'error') {
      console.error('Database health check failed:', healthStatus.error);
      
      // You could implement recovery logic here
      // For example, reinitialize services or show user-friendly error messages
    }

    // Initialize database if needed
    if (!healthStatus.services.database) {
      console.log('Initializing database...');
      await DatabaseUtils.initialize();
    }

  } catch (error) {
    console.error('Error in health check example:', error);
  }
};

/**
 * Example 6: Settings management
 */
export const exampleSettingsManagement = () => {
  try {
    const settingsService = getSettingsService();

    // Set various types of settings
    settingsService.setSetting('appVersion', '1.0.0');
    settingsService.setBooleanSetting('notifications', true);
    settingsService.setNumberSetting('refreshInterval', 30);
    settingsService.setJSONSetting('userPreferences', {
      theme: 'dark',
      language: 'en',
      currency: 'USD'
    });

    // Get settings with defaults
    const appVersion = settingsService.getSettingWithDefault('appVersion', '0.0.0');
    const notifications = settingsService.getBooleanSetting('notifications', false);
    const refreshInterval = settingsService.getNumberSetting('refreshInterval', 60);
    const userPreferences = settingsService.getJSONSetting('userPreferences', {});

    // Export settings for backup
    const backup = settingsService.exportSettings();

    console.log('Settings Management Example:', {
      appVersion,
      notifications,
      refreshInterval,
      userPreferences,
      backupDate: backup.exportDate
    });

  } catch (error) {
    console.error('Error in settings management example:', error);
  }
};

// Export all examples for easy testing
export const runAllExamples = async () => {
  console.log('Running all database service examples...');
  
  await exampleHealthCheck();
  await exampleUsingServiceFactory();
  exampleUsingIndividualServices();
  exampleUsingTransactions();
  exampleAdvancedAnalytics();
  exampleSettingsManagement();
  
  console.log('All examples completed!');
};
