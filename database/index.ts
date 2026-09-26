// Import all services and connectors
import DatabaseConnector from './DatabaseConnector';
import AccountService from './AccountService';
import ProfileService from './ProfileService';
import TransactionService from './TransactionService';
import CategoryService from './CategoryService';
import BudgetService from './BudgetService';
import SettingsService from './SettingsService';
import RecurringService from './RecurringService';
import CardService from './CardService';
import CardEmiService from './CardEmiService';
import StatementService from './StatementService';

// Re-export the DatabaseConnector and all services for easy access
export { default as DatabaseConnector } from './DatabaseConnector';
export { default as AccountService } from './AccountService';
export { default as ProfileService } from './ProfileService';
export { default as TransactionService } from './TransactionService';
export { default as CategoryService } from './CategoryService';
export { default as BudgetService, type BudgetSummary } from './BudgetService';
export { default as SettingsService } from './SettingsService';
export { default as RecurringService, type MonthlySummary, type MonthlyEmi, type NeededSummary, type NeededLine } from './RecurringService';
export { default as CardService } from './CardService';
export { default as CardEmiService } from './CardEmiService';
export { default as StatementService } from './StatementService';

/**
 * Service Factory - provides easy access to all services with a single instance
 * This ensures all services share the same database connection
 */
export class ServiceFactory {
  private static _accountService: AccountService;
  private static _profileService: ProfileService;
  private static _transactionService: TransactionService;
  private static _categoryService: CategoryService;
  private static _budgetService: BudgetService;
  private static _settingsService: SettingsService;
  private static _recurringService: RecurringService;
  private static _cardService: CardService;
  private static _cardEmiService: CardEmiService;
  private static _statementService: StatementService;

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
   * Get RecurringService instance
   */
  static getRecurringService(): RecurringService {
    if (!this._recurringService) {
      this._recurringService = new RecurringService();
    }
    return this._recurringService;
  }

  /**
   * Get CardService instance
   */
  static getCardService(): CardService {
    if (!this._cardService) {
      this._cardService = new CardService();
    }
    return this._cardService;
  }

  /**
   * Get CardEmiService instance
   */
  static getCardEmiService(): CardEmiService {
    if (!this._cardEmiService) {
      this._cardEmiService = new CardEmiService();
    }
    return this._cardEmiService;
  }

  /**
   * Get StatementService instance
   */
  static getStatementService(): StatementService {
    if (!this._statementService) {
      this._statementService = new StatementService();
    }
    return this._statementService;
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
      budgetService: this.getBudgetService(),
      settingsService: this.getSettingsService(),
      recurringService: this.getRecurringService(),
      cardService: this.getCardService(),
      cardEmiService: this.getCardEmiService(),
      statementService: this.getStatementService(),
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
    this._budgetService = undefined as any;
    this._settingsService = undefined as any;
    this._recurringService = undefined as any;
    this._cardService = undefined as any;
    this._cardEmiService = undefined as any;
    this._statementService = undefined as any;
  }
}

// Convenience exports for direct service access
export const getAccountService = () => ServiceFactory.getAccountService();
export const getProfileService = () => ServiceFactory.getProfileService();
export const getTransactionService = () => ServiceFactory.getTransactionService();
export const getCategoryService = () => ServiceFactory.getCategoryService();
export const getBudgetService = () => ServiceFactory.getBudgetService();
export const getSettingsService = () => ServiceFactory.getSettingsService();
export const getRecurringService = () => ServiceFactory.getRecurringService();
export const getCardService = () => ServiceFactory.getCardService();
export const getCardEmiService = () => ServiceFactory.getCardEmiService();
export const getStatementService = () => ServiceFactory.getStatementService();

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
      const accountServiceWithLoans = ServiceFactory.getAccountService();
      accountServiceWithLoans.markOverdueLoans();

      // Record recurring items set to post by themselves that have fallen due since the last run
      ServiceFactory.getRecurringService().postDue();

      // Move each credit card EMI on to its next unbilled installment once its due date has passed
      ServiceFactory.getCardEmiService().advanceDueEmis();

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
          budgets: false,
          settings: false,
        },
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
}
