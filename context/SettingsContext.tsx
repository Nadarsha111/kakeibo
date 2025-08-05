import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import DatabaseService from '../database/database';

interface SettingsContextType {
  currency: string;
  decimalPlaces: number;
  appLockEnabled: boolean;
  isLoading: boolean;
  updateCurrency: (currency: string) => void;
  updateDecimalPlaces: (places: number) => void;
  updateAppLock: (enabled: boolean) => void;
  formatCurrency: (amount: number) => string;
  refreshSettings: () => void;
}

const defaultSettings: SettingsContextType = {
  currency: '$',
  decimalPlaces: 2,
  appLockEnabled: false,
  isLoading: true,
  updateCurrency: () => {},
  updateDecimalPlaces: () => {},
  updateAppLock: () => {},
  formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
  refreshSettings: () => {},
};

const SettingsContext = createContext<SettingsContextType>(defaultSettings);

interface SettingsProviderProps {
  children: ReactNode;
}

export const SettingsProvider: React.FC<SettingsProviderProps> = ({ children }) => {
  const [currency, setCurrency] = useState<string>('$');
  const [decimalPlaces, setDecimalPlaces] = useState<number>(2);
  const [appLockEnabled, setAppLockEnabled] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load settings from database
  const loadSettings = async () => {
    try {
      setIsLoading(true);
      
      // Load currency setting
      const savedCurrency = DatabaseService.getSetting('currency');
      if (savedCurrency) {
        setCurrency(savedCurrency);
      }

      // Load decimal places
      const savedDecimalPlaces = DatabaseService.getSetting('decimal_places');
      if (savedDecimalPlaces) {
        setDecimalPlaces(parseInt(savedDecimalPlaces, 10));
      }

      // Load app lock setting
      const savedAppLock = DatabaseService.getSetting('app_lock_enabled');
      if (savedAppLock) {
        setAppLockEnabled(savedAppLock === 'true');
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Initialize settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Update currency
  const updateCurrency = (newCurrency: string) => {
    setCurrency(newCurrency);
    DatabaseService.setSetting('currency', newCurrency);
  };

  // Update decimal places
  const updateDecimalPlaces = (places: number) => {
    setDecimalPlaces(places);
    DatabaseService.setSetting('decimal_places', places.toString());
  };

  // Update app lock
  const updateAppLock = (enabled: boolean) => {
    setAppLockEnabled(enabled);
    DatabaseService.setSetting('app_lock_enabled', enabled.toString());
  };

  // Format currency with current settings
  const formatCurrency = (amount: number) => {
    return `${currency}${amount.toFixed(decimalPlaces)}`;
  };

  // Refresh settings (useful after database changes)
  const refreshSettings = () => {
    loadSettings();
  };

  const value: SettingsContextType = {
    currency,
    decimalPlaces,
    appLockEnabled,
    isLoading,
    updateCurrency,
    updateDecimalPlaces,
    updateAppLock,
    formatCurrency,
    refreshSettings,
  };

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
};

// Custom hook to use settings
export const useSettings = (): SettingsContextType => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
};

export default SettingsContext;
