import { getSettingsService } from '../database';

export interface AppSettings {
  currency: string;
  decimalPlaces: number;
  themePreference: 'system' | 'light' | 'dark';
  appLockEnabled: boolean;
}

export class SettingsManager {
  // Get all app settings
  static getSettings(): AppSettings {
    const settingsService = getSettingsService();
    return {
      currency: settingsService.getSetting('currency') || '₹',
      decimalPlaces: parseInt(settingsService.getSetting('decimal_places') || '2'),
      themePreference: (settingsService.getSetting('theme_preference') as 'system' | 'light' | 'dark') || 'system',
      appLockEnabled: settingsService.getSetting('app_lock_enabled') === 'true',
    };
  }

  // Format currency with user preferences
  static formatCurrency(amount: number): string {
    const settings = this.getSettings();
    return `${settings.currency}${amount.toFixed(settings.decimalPlaces)}`;
  }

  // Get currency symbol
  static getCurrency(): string {
    const settingsService = getSettingsService();
    return settingsService.getSetting('currency') || '₹';
  }

  // Get decimal places
  static getDecimalPlaces(): number {
    const settingsService = getSettingsService();
    return parseInt(settingsService.getSetting('decimal_places') || '2');
  }

  // Get theme preference
  static getThemePreference(): 'system' | 'light' | 'dark' {
    const settingsService = getSettingsService();
    return (settingsService.getSetting('theme_preference') as 'system' | 'light' | 'dark') || 'system';
  }

  // Check if app lock is enabled
  static isAppLockEnabled(): boolean {
    const settingsService = getSettingsService();
    return settingsService.getSetting('app_lock_enabled') === 'true';
  }

  // Update specific setting
  static updateSetting(key: keyof AppSettings, value: string | number | boolean): void {
    const settingsService = getSettingsService();
    settingsService.setSetting(key, value.toString());
  }

  // Reset all settings to defaults
  static resetToDefaults(): void {
    const settingsService = getSettingsService();
    const defaults = {
      currency: '₹',
      decimal_places: '2',
      theme_preference: 'system',
      app_lock_enabled: 'false',
    };

    Object.entries(defaults).forEach(([key, value]) => {
      settingsService.setSetting(key, value);
    });
  }
}

export default SettingsManager;
