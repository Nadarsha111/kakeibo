import DatabaseConnector from './DatabaseConnector';
import { Category, Budget, BudgetWithCategory } from '../types';

/**
 * Service class for category CRUD operations and budget logic
 */
class CategoryService {
  private db: ReturnType<DatabaseConnector['getDatabase']>;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
  }

  /**
   * Get all categories
   */
  getCategories(): Category[] {
    try {
      return this.db.getAllSync('SELECT * FROM categories ORDER BY name') as Category[];
    } catch (error) {
      console.error('Error getting categories:', error);
      return [];
    }
  }

  /**
   * Get categories by type (income or expense)
   */
  getCategoriesByType(type: 'income' | 'expense'): Category[] {
    try {
      return this.db.getAllSync('SELECT * FROM categories WHERE type = ? ORDER BY name', [type]) as Category[];
    } catch (error) {
      console.error('Error getting categories by type:', error);
      return [];
    }
  }

  /**
   * Get category by ID
   */
  getCategoryById(id: number): Category | null {
    try {
      return this.db.getFirstSync('SELECT * FROM categories WHERE id = ?', [id]) as Category | null;
    } catch (error) {
      console.error('Error getting category by id:', error);
      return null;
    }
  }

  /**
   * Get category by name
   */
  getCategoryByName(name: string): Category | null {
    try {
      return this.db.getFirstSync('SELECT * FROM categories WHERE name = ?', [name]) as Category | null;
    } catch (error) {
      console.error('Error getting category by name:', error);
      return null;
    }
  }

  /**
   * Add a new category
   */
  addCategory(category: Omit<Category, 'id'>): boolean {
    try {
      this.db.runSync(
        'INSERT INTO categories (name, color, icon, type, budgetLimit) VALUES (?, ?, ?, ?, ?)',
        [category.name, category.color, category.icon, category.type, category.budgetLimit || null]
      );
      console.log('Category added:', category.name);
      return true;
    } catch (error) {
      console.error('Error adding category:', error);
      return false;
    }
  }

  /**
   * Update an existing category
   */
  updateCategory(id: number, category: Partial<Omit<Category, 'id'>>): boolean {
    try {
      const fields = [];
      const values = [];
      
      if (category.name !== undefined) {
        fields.push('name = ?');
        values.push(category.name);
      }
      if (category.color !== undefined) {
        fields.push('color = ?');
        values.push(category.color);
      }
      if (category.icon !== undefined) {
        fields.push('icon = ?');
        values.push(category.icon);
      }
      if (category.type !== undefined) {
        fields.push('type = ?');
        values.push(category.type);
      }
      if (category.budgetLimit !== undefined) {
        fields.push('budgetLimit = ?');
        values.push(category.budgetLimit);
      }

      if (fields.length === 0) {
        console.warn('No fields to update for category:', id);
        return false;
      }

      values.push(id);
      this.db.runSync(
        `UPDATE categories SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
      
      console.log('Category updated:', id);
      return true;
    } catch (error) {
      console.error('Error updating category:', error);
      return false;
    }
  }

  /**
   * Delete a category (only if not used in transactions)
   */
  deleteCategory(id: number): boolean {
    try {
      // Check if category is being used in transactions
      const usageCount = this.db.getFirstSync(
        'SELECT COUNT(*) as count FROM transactions WHERE category = (SELECT name FROM categories WHERE id = ?)',
        [id]
      ) as { count: number };

      if (usageCount.count > 0) {
        throw new Error(`Cannot delete category that is being used in ${usageCount.count} transactions`);
      }

      // Check if category is being used in budgets
      const budgetUsage = this.db.getFirstSync(
        'SELECT COUNT(*) as count FROM budgets WHERE categoryId = ?',
        [id]
      ) as { count: number };

      if (budgetUsage.count > 0) {
        throw new Error(`Cannot delete category that is being used in ${budgetUsage.count} budgets`);
      }

      this.db.runSync('DELETE FROM categories WHERE id = ?', [id]);
      console.log('Category deleted:', id);
      return true;
    } catch (error) {
      console.error('Error deleting category:', error);
      return false;
    }
  }

  /**
   * Get categories with usage statistics
   */
  getCategoriesWithStats(startDate?: string, endDate?: string): Array<Category & {
    transactionCount: number;
    totalAmount: number;
    lastUsed: string | null;
  }> {
    try {
      let dateFilter = '';
      const params: any[] = [];

      if (startDate && endDate) {
        dateFilter = 'AND DATE(t.date) BETWEEN DATE(?) AND DATE(?)';
        params.push(startDate, endDate);
      }

      const query = `
        SELECT 
          c.*,
          COUNT(t.id) as transactionCount,
          COALESCE(SUM(t.amount), 0) as totalAmount,
          MAX(t.date) as lastUsed
        FROM categories c
        LEFT JOIN transactions t ON c.name = t.category ${dateFilter}
        GROUP BY c.id, c.name, c.color, c.icon, c.type, c.budgetLimit
        ORDER BY c.name
      `;

      return this.db.getAllSync(query, params) as Array<Category & {
        transactionCount: number;
        totalAmount: number;
        lastUsed: string | null;
      }>;
    } catch (error) {
      console.error('Error getting categories with stats:', error);
      return [];
    }
  }

  /**
   * Check if category name already exists
   */
  categoryNameExists(name: string, excludeId?: number): boolean {
    try {
      let query = 'SELECT COUNT(*) as count FROM categories WHERE name = ?';
      const params: any[] = [name];

      if (excludeId) {
        query += ' AND id != ?';
        params.push(excludeId);
      }

      const result = this.db.getFirstSync(query, params) as { count: number };
      return result.count > 0;
    } catch (error) {
      console.error('Error checking category name existence:', error);
      return true; // Return true to be safe
    }
  }

  // Budget-related methods

  /**
   * Get all budgets
   */
  getBudgets(): BudgetWithCategory[] {
    try {
      return this.db.getAllSync(`
        SELECT b.*, c.name as categoryName, c.color as categoryColor
        FROM budgets b
        JOIN categories c ON b.categoryId = c.id
        ORDER BY c.name
      `) as BudgetWithCategory[];
    } catch (error) {
      console.error('Error getting budgets:', error);
      return [];
    }
  }

  /**
   * Get budget by ID
   */
  getBudgetById(id: number): BudgetWithCategory | null {
    try {
      return this.db.getFirstSync(`
        SELECT b.*, c.name as categoryName, c.color as categoryColor
        FROM budgets b
        JOIN categories c ON b.categoryId = c.id
        WHERE b.id = ?
      `, [id]) as BudgetWithCategory | null;
    } catch (error) {
      console.error('Error getting budget by id:', error);
      return null;
    }
  }

  /**
   * Get budgets for a specific category
   */
  getBudgetsByCategory(categoryId: number): BudgetWithCategory[] {
    try {
      return this.db.getAllSync(`
        SELECT b.*, c.name as categoryName, c.color as categoryColor
        FROM budgets b
        JOIN categories c ON b.categoryId = c.id
        WHERE b.categoryId = ?
        ORDER BY b.startDate DESC
      `, [categoryId]) as BudgetWithCategory[];
    } catch (error) {
      console.error('Error getting budgets by category:', error);
      return [];
    }
  }

  /**
   * Add a new budget
   */
  addBudget(budget: Omit<Budget, 'id'>): number {
    try {
      const result = this.db.runSync(
        'INSERT INTO budgets (categoryId, amount, period, startDate, endDate) VALUES (?, ?, ?, ?, ?)',
        [budget.categoryId, budget.amount, budget.period, budget.startDate, budget.endDate]
      );
      
      console.log('Budget added:', { id: result.lastInsertRowId, categoryId: budget.categoryId, amount: budget.amount });
      return result.lastInsertRowId;
    } catch (error) {
      console.error('Error adding budget:', error);
      throw error;
    }
  }

  /**
   * Update an existing budget
   */
  updateBudget(id: number, budget: Partial<Omit<Budget, 'id'>>): boolean {
    try {
      const fields = [];
      const values = [];
      
      if (budget.categoryId !== undefined) {
        fields.push('categoryId = ?');
        values.push(budget.categoryId);
      }
      if (budget.amount !== undefined) {
        fields.push('amount = ?');
        values.push(budget.amount);
      }
      if (budget.period !== undefined) {
        fields.push('period = ?');
        values.push(budget.period);
      }
      if (budget.startDate !== undefined) {
        fields.push('startDate = ?');
        values.push(budget.startDate);
      }
      if (budget.endDate !== undefined) {
        fields.push('endDate = ?');
        values.push(budget.endDate);
      }

      if (fields.length === 0) {
        console.warn('No fields to update for budget:', id);
        return false;
      }

      values.push(id);
      this.db.runSync(
        `UPDATE budgets SET ${fields.join(', ')} WHERE id = ?`,
        values
      );
      
      console.log('Budget updated:', id);
      return true;
    } catch (error) {
      console.error('Error updating budget:', error);
      return false;
    }
  }

  /**
   * Delete a budget
   */
  deleteBudget(id: number): boolean {
    try {
      this.db.runSync('DELETE FROM budgets WHERE id = ?', [id]);
      console.log('Budget deleted:', id);
      return true;
    } catch (error) {
      console.error('Error deleting budget:', error);
      return false;
    }
  }

  /**
   * Get current active budgets
   */
  getActiveBudgets(): BudgetWithCategory[] {
    try {
      const currentDate = new Date().toISOString().split('T')[0];
      return this.db.getAllSync(`
        SELECT b.*, c.name as categoryName, c.color as categoryColor
        FROM budgets b
        JOIN categories c ON b.categoryId = c.id
        WHERE DATE(b.startDate) <= DATE(?) AND DATE(b.endDate) >= DATE(?)
        ORDER BY c.name
      `, [currentDate, currentDate]) as BudgetWithCategory[];
    } catch (error) {
      console.error('Error getting active budgets:', error);
      return [];
    }
  }

  /**
   * Get budget performance for a specific period
   */
  getBudgetPerformance(startDate: string, endDate: string): Array<{
    budget: BudgetWithCategory;
    spent: number;
    remaining: number;
    percentUsed: number;
    isOverBudget: boolean;
  }> {
    try {
      const budgets = this.db.getAllSync(`
        SELECT b.*, c.name as categoryName, c.color as categoryColor
        FROM budgets b
        JOIN categories c ON b.categoryId = c.id
        WHERE (DATE(b.startDate) <= DATE(?) AND DATE(b.endDate) >= DATE(?))
           OR (DATE(b.startDate) BETWEEN DATE(?) AND DATE(?))
           OR (DATE(b.endDate) BETWEEN DATE(?) AND DATE(?))
      `, [endDate, startDate, startDate, endDate, startDate, endDate]) as BudgetWithCategory[];

      const performance = budgets.map(budget => {
        // Get spending for this category in the overlapping period
        const overlapStart = startDate > budget.startDate ? startDate : budget.startDate;
        const overlapEnd = endDate < budget.endDate ? endDate : budget.endDate;

        const spentResult = this.db.getFirstSync(`
          SELECT COALESCE(SUM(amount), 0) as spent
          FROM transactions 
          WHERE category = ? AND type = 'expense' 
          AND DATE(date) BETWEEN DATE(?) AND DATE(?)
        `, [budget.categoryName, overlapStart, overlapEnd]) as { spent: number };

        const spent = spentResult.spent;
        const remaining = budget.amount - spent;
        const percentUsed = budget.amount > 0 ? (spent / budget.amount) * 100 : 0;
        const isOverBudget = spent > budget.amount;

        return {
          budget,
          spent,
          remaining,
          percentUsed,
          isOverBudget
        };
      });

      return performance.sort((a, b) => a.budget.categoryName.localeCompare(b.budget.categoryName));
    } catch (error) {
      console.error('Error getting budget performance:', error);
      return [];
    }
  }

  /**
   * Get budget alerts for categories that are over budget
   */
  getBudgetAlerts(): Array<{
    categoryName: string;
    budgetAmount: number;
    currentSpent: number;
    overAmount: number;
    period: string;
  }> {
    try {
      const activeBudgets = this.getActiveBudgets();
      const alerts: Array<{
        categoryName: string;
        budgetAmount: number;
        currentSpent: number;
        overAmount: number;
        period: string;
      }> = [];

      for (const budget of activeBudgets) {
        const spentResult = this.db.getFirstSync(`
          SELECT COALESCE(SUM(amount), 0) as spent
          FROM transactions 
          WHERE category = ? AND type = 'expense' 
          AND DATE(date) BETWEEN DATE(?) AND DATE(?)
        `, [budget.categoryName, budget.startDate, budget.endDate]) as { spent: number };

        const spent = spentResult.spent;
        if (spent > budget.amount) {
          alerts.push({
            categoryName: budget.categoryName,
            budgetAmount: budget.amount,
            currentSpent: spent,
            overAmount: spent - budget.amount,
            period: budget.period
          });
        }
      }

      return alerts.sort((a, b) => b.overAmount - a.overAmount);
    } catch (error) {
      console.error('Error getting budget alerts:', error);
      return [];
    }
  }

  /**
   * Get spending trends by category
   */
  getCategorySpendingTrends(months: number = 6): Array<{
    categoryName: string;
    monthlyData: Array<{ month: string; amount: number }>;
    trend: 'increasing' | 'decreasing' | 'stable';
    averageMonthly: number;
  }> {
    try {
      const endDate = new Date();
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - months);

      const categories = this.getCategoriesByType('expense');
      const trends = [];

      for (const category of categories) {
        const monthlyData = this.db.getAllSync(`
          SELECT 
            strftime('%Y-%m', date) as month,
            COALESCE(SUM(amount), 0) as amount
          FROM transactions 
          WHERE category = ? AND type = 'expense'
          AND DATE(date) BETWEEN DATE(?) AND DATE(?)
          GROUP BY strftime('%Y-%m', date)
          ORDER BY month
        `, [category.name, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]) as Array<{ month: string; amount: number }>;

        if (monthlyData.length > 0) {
          const averageMonthly = monthlyData.reduce((sum, data) => sum + data.amount, 0) / monthlyData.length;
          
          // Simple trend calculation
          let trend: 'increasing' | 'decreasing' | 'stable' = 'stable';
          if (monthlyData.length >= 2) {
            const firstHalf = monthlyData.slice(0, Math.floor(monthlyData.length / 2));
            const secondHalf = monthlyData.slice(Math.floor(monthlyData.length / 2));
            
            const firstHalfAvg = firstHalf.reduce((sum, data) => sum + data.amount, 0) / firstHalf.length;
            const secondHalfAvg = secondHalf.reduce((sum, data) => sum + data.amount, 0) / secondHalf.length;
            
            if (secondHalfAvg > firstHalfAvg * 1.1) {
              trend = 'increasing';
            } else if (secondHalfAvg < firstHalfAvg * 0.9) {
              trend = 'decreasing';
            }
          }

          trends.push({
            categoryName: category.name,
            monthlyData,
            trend,
            averageMonthly
          });
        }
      }

      return trends.sort((a, b) => b.averageMonthly - a.averageMonthly);
    } catch (error) {
      console.error('Error getting category spending trends:', error);
      return [];
    }
  }

  /**
   * Get category budget utilization summary
   */
  getBudgetUtilizationSummary(): {
    totalBudgets: number;
    totalBudgetAmount: number;
    totalSpent: number;
    overBudgetCount: number;
    averageUtilization: number;
  } {
    try {
      const activeBudgets = this.getActiveBudgets();
      
      if (activeBudgets.length === 0) {
        return {
          totalBudgets: 0,
          totalBudgetAmount: 0,
          totalSpent: 0,
          overBudgetCount: 0,
          averageUtilization: 0
        };
      }

      const totalBudgetAmount = activeBudgets.reduce((sum, budget) => sum + budget.amount, 0);
      let totalSpent = 0;
      let overBudgetCount = 0;
      let totalUtilization = 0;

      for (const budget of activeBudgets) {
        const spentResult = this.db.getFirstSync(`
          SELECT COALESCE(SUM(amount), 0) as spent
          FROM transactions 
          WHERE category = ? AND type = 'expense' 
          AND DATE(date) BETWEEN DATE(?) AND DATE(?)
        `, [budget.categoryName, budget.startDate, budget.endDate]) as { spent: number };

        const spent = spentResult.spent;
        totalSpent += spent;
        
        if (spent > budget.amount) {
          overBudgetCount++;
        }

        totalUtilization += budget.amount > 0 ? (spent / budget.amount) : 0;
      }

      const averageUtilization = totalUtilization / activeBudgets.length;

      return {
        totalBudgets: activeBudgets.length,
        totalBudgetAmount,
        totalSpent,
        overBudgetCount,
        averageUtilization: averageUtilization * 100 // Convert to percentage
      };
    } catch (error) {
      console.error('Error getting budget utilization summary:', error);
      return {
        totalBudgets: 0,
        totalBudgetAmount: 0,
        totalSpent: 0,
        overBudgetCount: 0,
        averageUtilization: 0
      };
    }
  }
}

export default CategoryService;
