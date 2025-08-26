import DatabaseConnector from './DatabaseConnector';
import { Category } from '../types';

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
}

export default CategoryService;
