import DatabaseService from '../database/database';

export interface AppSettings {
  currency: string;
  decimalPlaces: number;
  themePreference: 'system' | 'light' | 'dark';
  appLockEnabled: boolean;
}

export class SettingsManager {
  // Get all app settings
  static getSettings(): AppSettings {
    return {
      currency: DatabaseService.getSetting('currency') || '₹',
      decimalPlaces: parseInt(DatabaseService.getSetting('decimal_places') || '2'),
      themePreference: (DatabaseService.getSetting('theme_preference') as 'system' | 'light' | 'dark') || 'system',
      appLockEnabled: DatabaseService.getSetting('app_lock_enabled') === 'true',
    };
  }

  // Format currency with user preferences
  static formatCurrency(amount: number): string {
    const settings = this.getSettings();
    return `${settings.currency}${amount.toFixed(settings.decimalPlaces)}`;
  }

  // Get currency symbol
  static getCurrency(): string {
    return DatabaseService.getSetting('currency') || '₹';
  }

  // Get decimal places
  static getDecimalPlaces(): number {
    return parseInt(DatabaseService.getSetting('decimal_places') || '2');
  }

  // Get theme preference
  static getThemePreference(): 'system' | 'light' | 'dark' {
    return (DatabaseService.getSetting('theme_preference') as 'system' | 'light' | 'dark') || 'system';
  }

  // Check if app lock is enabled
  static isAppLockEnabled(): boolean {
    return DatabaseService.getSetting('app_lock_enabled') === 'true';
  }

  // Update specific setting
  static updateSetting(key: keyof AppSettings, value: string | number | boolean): void {
    DatabaseService.setSetting(key, value.toString());
  }

  // Reset all settings to defaults
  static resetToDefaults(): void {
    const defaults = {
      currency: '₹',
      decimal_places: '2',
      theme_preference: 'system',
      app_lock_enabled: 'false',
    };

    Object.entries(defaults).forEach(([key, value]) => {
      DatabaseService.setSetting(key, value);
    });
  }
}

export default SettingsManager;
