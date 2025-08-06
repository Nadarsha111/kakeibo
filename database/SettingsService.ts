import DatabaseConnector from './DatabaseConnector';

/**
 * Service class for managing application settings and user preferences
 */
class SettingsService {
  private db: ReturnType<DatabaseConnector['getDatabase']>;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
  }

  /**
   * Get a setting value by key
   */
  getSetting(key: string): string | null {
    try {
      const result = this.db.getFirstSync(
        'SELECT value FROM app_settings WHERE key = ?',
        [key]
      ) as { value: string } | null;
      return result?.value || null;
    } catch (error) {
      console.error('Error getting setting:', error);
      return null;
    }
  }

  /**
   * Set a setting value
   */
  setSetting(key: string, value: string): void {
    try {
      const now = new Date().toISOString();
      this.db.runSync(
        'INSERT OR REPLACE INTO app_settings (key, value, updatedAt) VALUES (?, ?, ?)',
        [key, value, now]
      );
      console.log('Setting updated:', { key, value });
    } catch (error) {
      console.error('Error setting preference:', error);
      throw error;
    }
  }

  /**
   * Get all settings as a key-value object
   */
  getAllSettings(): Record<string, string> {
    try {
      const results = this.db.getAllSync(
        'SELECT key, value FROM app_settings'
      ) as { key: string; value: string }[];
      
      const settings: Record<string, string> = {};
      results.forEach(row => {
        settings[row.key] = row.value;
      });
      return settings;
    } catch (error) {
      console.error('Error getting all settings:', error);
      return {};
    }
  }

  /**
   * Delete a setting
   */
  deleteSetting(key: string): void {
    try {
      this.db.runSync('DELETE FROM app_settings WHERE key = ?', [key]);
      console.log('Setting deleted:', key);
    } catch (error) {
      console.error('Error deleting setting:', error);
    }
  }

  /**
   * Get multiple settings by keys
   */
  getSettings(keys: string[]): Record<string, string | null> {
    try {
      const placeholders = keys.map(() => '?').join(', ');
      const results = this.db.getAllSync(
        `SELECT key, value FROM app_settings WHERE key IN (${placeholders})`,
        keys
      ) as { key: string; value: string }[];
      
      const settings: Record<string, string | null> = {};
      keys.forEach(key => {
        const result = results.find(r => r.key === key);
        settings[key] = result?.value || null;
      });
      
      return settings;
    } catch (error) {
      console.error('Error getting multiple settings:', error);
      const emptySettings: Record<string, string | null> = {};
      keys.forEach(key => {
        emptySettings[key] = null;
      });
      return emptySettings;
    }
  }

  /**
   * Set multiple settings at once
   */
  setSettings(settings: Record<string, string>): void {
    try {
      DatabaseConnector.getInstance().withTransaction(() => {
        const now = new Date().toISOString();
        Object.entries(settings).forEach(([key, value]) => {
          this.db.runSync(
            'INSERT OR REPLACE INTO app_settings (key, value, updatedAt) VALUES (?, ?, ?)',
            [key, value, now]
          );
        });
      });
      console.log('Multiple settings updated:', Object.keys(settings));
    } catch (error) {
      console.error('Error setting multiple preferences:', error);
      throw error;
    }
  }

  /**
   * Get settings with a specific prefix
   */
  getSettingsByPrefix(prefix: string): Record<string, string> {
    try {
      const results = this.db.getAllSync(
        'SELECT key, value FROM app_settings WHERE key LIKE ?',
        [`${prefix}%`]
      ) as { key: string; value: string }[];
      
      const settings: Record<string, string> = {};
      results.forEach(row => {
        settings[row.key] = row.value;
      });
      return settings;
    } catch (error) {
      console.error('Error getting settings by prefix:', error);
      return {};
    }
  }

  /**
   * Clear all settings with a specific prefix
   */
  clearSettingsByPrefix(prefix: string): number {
    try {
      const result = this.db.runSync(
        'DELETE FROM app_settings WHERE key LIKE ?',
        [`${prefix}%`]
      );
      const deletedCount = result.changes || 0;
      console.log(`Cleared ${deletedCount} settings with prefix: ${prefix}`);
      return deletedCount;
    } catch (error) {
      console.error('Error clearing settings by prefix:', error);
      return 0;
    }
  }

  /**
   * Check if a setting exists
   */
  settingExists(key: string): boolean {
    try {
      const result = this.db.getFirstSync(
        'SELECT COUNT(*) as count FROM app_settings WHERE key = ?',
        [key]
      ) as { count: number };
      return result.count > 0;
    } catch (error) {
      console.error('Error checking setting existence:', error);
      return false;
    }
  }

  /**
   * Get setting with default value
   */
  getSettingWithDefault(key: string, defaultValue: string): string {
    const value = this.getSetting(key);
    return value !== null ? value : defaultValue;
  }

  /**
   * Get boolean setting
   */
  getBooleanSetting(key: string, defaultValue: boolean = false): boolean {
    const value = this.getSetting(key);
    if (value === null) return defaultValue;
    return value === 'true' || value === '1';
  }

  /**
   * Set boolean setting
   */
  setBooleanSetting(key: string, value: boolean): void {
    this.setSetting(key, value.toString());
  }

  /**
   * Get number setting
   */
  getNumberSetting(key: string, defaultValue: number = 0): number {
    const value = this.getSetting(key);
    if (value === null) return defaultValue;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  /**
   * Set number setting
   */
  setNumberSetting(key: string, value: number): void {
    this.setSetting(key, value.toString());
  }

  /**
   * Get JSON setting (for complex objects)
   */
  getJSONSetting<T>(key: string, defaultValue: T): T {
    const value = this.getSetting(key);
    if (value === null) return defaultValue;
    
    try {
      return JSON.parse(value);
    } catch (error) {
      console.error('Error parsing JSON setting:', error);
      return defaultValue;
    }
  }

  /**
   * Set JSON setting (for complex objects)
   */
  setJSONSetting<T>(key: string, value: T): void {
    try {
      this.setSetting(key, JSON.stringify(value));
    } catch (error) {
      console.error('Error stringifying JSON setting:', error);
      throw error;
    }
  }

  /**
   * Get all settings with their last updated timestamps
   */
  getAllSettingsWithTimestamps(): Array<{ key: string; value: string; updatedAt: string }> {
    try {
      return this.db.getAllSync(
        'SELECT key, value, updatedAt FROM app_settings ORDER BY updatedAt DESC'
      ) as Array<{ key: string; value: string; updatedAt: string }>;
    } catch (error) {
      console.error('Error getting settings with timestamps:', error);
      return [];
    }
  }

  /**
   * Export all settings for backup
   */
  exportSettings(): { settings: Record<string, string>; exportDate: string } {
    try {
      const settings = this.getAllSettings();
      return {
        settings,
        exportDate: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error exporting settings:', error);
      return {
        settings: {},
        exportDate: new Date().toISOString()
      };
    }
  }

  /**
   * Import settings from backup (replaces existing settings)
   */
  importSettings(backup: { settings: Record<string, string>; exportDate: string }): void {
    try {
      DatabaseConnector.getInstance().withTransaction(() => {
        // Clear existing settings
        this.db.runSync('DELETE FROM app_settings');
        
        // Import new settings
        this.setSettings(backup.settings);
        
        console.log('Settings imported successfully from:', backup.exportDate);
      });
    } catch (error) {
      console.error('Error importing settings:', error);
      throw error;
    }
  }

  /**
   * Reset all settings (clear everything)
   */
  resetAllSettings(): void {
    try {
      const result = this.db.runSync('DELETE FROM app_settings');
      const deletedCount = result.changes || 0;
      console.log(`Reset complete. Cleared ${deletedCount} settings.`);
    } catch (error) {
      console.error('Error resetting settings:', error);
      throw error;
    }
  }
}

export default SettingsService;
