// Import all services and connectors
import DatabaseConnector from './DatabaseConnector';
import AccountService from './AccountService';
import ProfileService from './ProfileService';
import TransactionService from './TransactionService';
import CategoryService from './CategoryService';
import LoanService from './LoanService';
import BudgetService from './BudgetService';
import SettingsService from './SettingsService';

// Re-export the DatabaseConnector and all services for easy access
export { default as DatabaseConnector } from './DatabaseConnector';
export { default as AccountService } from './AccountService';
export { default as ProfileService } from './ProfileService';
export { default as TransactionService } from './TransactionService';
export { default as CategoryService } from './CategoryService';
export { default as LoanService } from './LoanService';
export { default as BudgetService, type BudgetSummary } from './BudgetService';
export { default as SettingsService } from './SettingsService';

/**
 * Service Factory - provides easy access to all services with a single instance
 * This ensures all services share the same database connection
 */
export class ServiceFactory {
  private static _accountService: AccountService;
  private static _profileService: ProfileService;
  private static _transactionService: TransactionService;
  private static _categoryService: CategoryService;
  private static _loanService: LoanService;
  private static _budgetService: BudgetService;
  private static _settingsService: SettingsService;

  /**
   * Get AccountService instance
   */
  static getAccountService(): AccountService {
    if (!this._accountService) {
      this._accountService = new AccountService();
    }
    return this._accountService;
  }

  /**
   * Get ProfileService instance
   */
  static getProfileService(): ProfileService {
    if (!this._profileService) {
      this._profileService = new ProfileService();
    }
    return this._profileService;
  }

  /**
   * Get TransactionService instance
   */
  static getTransactionService(): TransactionService {
    if (!this._transactionService) {
      this._transactionService = new TransactionService();
    }
    return this._transactionService;
  }

  /**
   * Get CategoryService instance
   */
  static getCategoryService(): CategoryService {
    if (!this._categoryService) {
      this._categoryService = new CategoryService();
    }
    return this._categoryService;
  }

  /**
   * Get LoanService instance
   */
  static getLoanService(): LoanService {
    if (!this._loanService) {
      this._loanService = new LoanService();
    }
    return this._loanService;
  }

  /**
   * Get BudgetService instance
   */
  static getBudgetService(): BudgetService {
    if (!this._budgetService) {
      this._budgetService = new BudgetService();
    }
    return this._budgetService;
  }

  /**
   * Get SettingsService instance
   */
  static getSettingsService(): SettingsService {
    if (!this._settingsService) {
      this._settingsService = new SettingsService();
    }
    return this._settingsService;
  }

  /**
   * Get all services at once
   */
  static getAllServices() {
    return {
      accountService: this.getAccountService(),
      profileService: this.getProfileService(),
      transactionService: this.getTransactionService(),
      categoryService: this.getCategoryService(),
      loanService: this.getLoanService(),
      budgetService: this.getBudgetService(),
      settingsService: this.getSettingsService(),
    };
  }

  /**
   * Reset all service instances (useful for testing)
   */
  static resetServices(): void {
    this._accountService = undefined as any;
    this._profileService = undefined as any;
    this._transactionService = undefined as any;
    this._categoryService = undefined as any;
    this._loanService = undefined as any;
    this._budgetService = undefined as any;
    this._settingsService = undefined as any;
  }
}

// Convenience exports for direct service access
export const getAccountService = () => ServiceFactory.getAccountService();
export const getProfileService = () => ServiceFactory.getProfileService();
export const getTransactionService = () => ServiceFactory.getTransactionService();
export const getCategoryService = () => ServiceFactory.getCategoryService();
export const getLoanService = () => ServiceFactory.getLoanService();
export const getBudgetService = () => ServiceFactory.getBudgetService();
export const getSettingsService = () => ServiceFactory.getSettingsService();

/**
 * Database utility functions
 */
export class DatabaseUtils {
  /**
   * Execute multiple operations in a single transaction
   */
  static withTransaction<T>(callback: () => T): T {
    return DatabaseConnector.getInstance().withTransaction(callback);
  }

  /**
   * Get the raw database instance (use with caution)
   */
  static getDatabase() {
    return DatabaseConnector.getInstance().getDatabase();
  }

  /**
   * Initialize all services and ensure database is ready
   */
  static async initialize(): Promise<void> {
    try {
      // Initialize database connector (creates tables)
      DatabaseConnector.getInstance();
      
      // Initialize default accounts if needed
      const accountService = ServiceFactory.getAccountService();
      accountService.initializeDefaultAccounts();
      
      // Mark overdue loans
      const loanService = ServiceFactory.getLoanService();
      loanService.markOverdueLoans();
      
      console.log('Database services initialized successfully');
    } catch (error) {
      console.error('Error initializing database services:', error);
      throw error;
    }
  }

  /**
   * Health check for database services
   */
  static healthCheck(): {
    status: 'healthy' | 'error';
    services: Record<string, boolean>;
    error?: string;
  } {
    try {
      const services = {
        database: false,
        profiles: false,
        accounts: false,
        transactions: false,
        categories: false,
        loans: false,
        budgets: false,
        settings: false,
      };

      // Test database connection
      const db = DatabaseConnector.getInstance().getDatabase();
      db.getFirstSync('SELECT 1');
      services.database = true;

      // Test each service
      try {
        ServiceFactory.getProfileService().getProfiles();
        services.profiles = true;
      } catch (e) {
        console.error('Profile service error:', e);
      }

      try {
        ServiceFactory.getAccountService().getAccounts();
        services.accounts = true;
      } catch (e) {
        console.error('Account service error:', e);
      }

      try {
        ServiceFactory.getTransactionService().getTransactions(1);
        services.transactions = true;
      } catch (e) {
        console.error('Transaction service error:', e);
      }

      try {
        ServiceFactory.getCategoryService().getCategories();
        services.categories = true;
      } catch (e) {
        console.error('Category service error:', e);
      }

      try {
        ServiceFactory.getLoanService().getLoans();
        services.loans = true;
      } catch (e) {
        console.error('Loan service error:', e);
      }

      try {
        ServiceFactory.getBudgetService().getBudgets();
        services.budgets = true;
      } catch (e) {
        console.error('Budget service error:', e);
      }

      try {
        ServiceFactory.getSettingsService().getAllSettings();
        services.settings = true;
      } catch (e) {
        console.error('Settings service error:', e);
      }

      const allHealthy = Object.values(services).every(status => status);

      return {
        status: allHealthy ? 'healthy' : 'error',
        services
      };
    } catch (error) {
      return {
        status: 'error',
        services: {
          database: false,
          profiles: false,
          accounts: false,
          transactions: false,
          categories: false,
          loans: false,
          budgets: false,
          settings: false,
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
