import DatabaseConnector from './DatabaseConnector';
import { Category } from '../types';

export interface CategoryUsage {
  transactions: number;
  recurringItems: number;
  budgets: number;
}

export function isTransferCategory(name: string): boolean {
  return name === 'Transfer In' || name === 'Transfer Out';
}

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

  getCategoryUsage(id: number): CategoryUsage {
    const usage = this.db.getFirstSync<CategoryUsage>(
      `SELECT
        (SELECT COUNT(*) FROM transactions WHERE category = c.name) AS transactions,
        (SELECT COUNT(*) FROM recurring_items WHERE category = c.name AND type IN ('expense', 'income')) AS recurringItems,
        (SELECT COUNT(*) FROM budgets WHERE categoryId = c.id) AS budgets
      FROM categories c WHERE c.id = ?`,
      [id],
    );
    if (!usage) throw new Error('This category no longer exists.');
    return usage;
  }

  /** Move existing uses and delete the category in the same transaction. */
  deleteCategory(id: number, replacementId?: number): void {
    DatabaseConnector.getInstance().withTransaction(() => {
      const source = this.db.getFirstSync<Category>('SELECT * FROM categories WHERE id = ?', [id]);
      if (!source) throw new Error('This category no longer exists.');
      if (isTransferCategory(source.name)) throw new Error('This category is used for transfers between accounts.');

      const usage = this.getCategoryUsage(id);
      if (replacementId === undefined && (usage.transactions || usage.recurringItems || usage.budgets)) {
        throw new Error('Choose a replacement category for the items using this category.');
      }

      if (replacementId !== undefined) {
        const replacement = this.db.getFirstSync<Category>('SELECT * FROM categories WHERE id = ?', [replacementId]);
        if (!replacement || replacement.id === id || replacement.type !== source.type || isTransferCategory(replacement.name)) {
          throw new Error('Choose another category of the same type.');
        }
        if (usage.budgets && this.db.getFirstSync(
          `SELECT 1 FROM budgets source
           JOIN budgets target ON target.period = source.period
           WHERE source.categoryId = ? AND target.categoryId = ? LIMIT 1`,
          [id, replacementId],
        )) {
          throw new Error('The replacement has a budget for the same period type. Choose a different category or edit one of the budgets first.');
        }

        const now = new Date().toISOString();
        this.db.runSync('UPDATE transactions SET category = ?, updatedAt = ? WHERE category = ?', [replacement.name, now, source.name]);
        this.db.runSync(
          "UPDATE recurring_items SET category = ?, updatedAt = ? WHERE category = ? AND type IN ('expense', 'income')",
          [replacement.name, now, source.name],
        );
        this.db.runSync('UPDATE budgets SET categoryId = ? WHERE categoryId = ?', [replacementId, id]);
        if (source.budgetLimit != null && replacement.budgetLimit == null) {
          this.db.runSync('UPDATE categories SET budgetLimit = ? WHERE id = ?', [source.budgetLimit, replacementId]);
        }
      }

      this.db.runSync('DELETE FROM categories WHERE id = ?', [id]);
    });
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
