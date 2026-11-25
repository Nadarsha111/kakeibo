import type { SQLiteDatabase } from 'expo-sqlite';
import { EXPENSE_CATEGORY_PRESETS } from '../utils/expenseCategoryPresets';

const SEED_KEY = 'expenseCategoryPresets.v1';

/** Run inside the caller's transaction. The marker also travels with Drive backups. */
export function seedExpenseCategories(db: SQLiteDatabase): void {
  if (db.getFirstSync('SELECT 1 FROM app_settings WHERE key = ?', [SEED_KEY])) return;

  for (const { name, color, emoji } of EXPENSE_CATEGORY_PRESETS) {
    const existing = db.getAllSync<{ type: string }>(
      'SELECT type FROM categories WHERE name = ? COLLATE NOCASE',
      [name],
    );
    if (existing.some((category) => category.type === 'expense')) continue;

    // Category names are unique across both types. Keep the existing income category if it shares
    // a name, as with the default Investment category.
    const expenseName = existing.length ? `${name} (expense)` : name;
    db.runSync(
      `INSERT INTO categories (name, color, icon, type)
       SELECT ?, ?, ?, 'expense'
       WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = ? COLLATE NOCASE)`,
      [expenseName, color, emoji, expenseName],
    );
  }

  db.runSync('INSERT INTO app_settings (key, value, updatedAt) VALUES (?, ?, ?)', [SEED_KEY, '1', new Date().toISOString()]);
}
