import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSettingsService } from '../database';

interface SettingsContextType {
  currency: string;
  decimalPlaces: number;
  appLockEnabled: boolean;
  selectedProfileId: number | 'all';
  isLoading: boolean;
  updateCurrency: (currency: string) => void;
  updateDecimalPlaces: (places: number) => void;
  updateAppLock: (enabled: boolean) => void;
  formatCurrency: (amount: number) => string;
  updateSelectedProfileId: (profileId: number | 'all') => void;
  refreshSettings: () => void;
}

const defaultSettings: SettingsContextType = {
  currency: '$',
  decimalPlaces: 2,
  appLockEnabled: false,
  selectedProfileId: 'all',
  isLoading: true,
  updateCurrency: () => {},
  updateDecimalPlaces: () => {},
  updateAppLock: () => {},
  formatCurrency: (amount: number) => `$${amount.toFixed(2)}`,
  updateSelectedProfileId: () => {},
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
  const [selectedProfileId, setSelectedProfileId] = useState<number | 'all'>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Load settings from database
  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const settingsService = getSettingsService();
      
      // Load currency setting
      const savedCurrency = settingsService.getSetting('currency');
      if (savedCurrency) {
        setCurrency(savedCurrency);
      }

      // Load decimal places
      const savedDecimalPlaces = settingsService.getSetting('decimal_places');
      if (savedDecimalPlaces) {
        setDecimalPlaces(parseInt(savedDecimalPlaces, 10));
      }

      // Load app lock setting
      const savedAppLock = settingsService.getSetting('app_lock_enabled');
      if (savedAppLock) {
        setAppLockEnabled(savedAppLock === 'true');
      }

      // Load selected profile ID
      const savedProfileId = settingsService.getSetting('selected_profile_id');
      if (savedProfileId) {
        setSelectedProfileId(savedProfileId === 'all' ? 'all' : parseInt(savedProfileId, 10));
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
    const settingsService = getSettingsService();
    settingsService.setSetting('currency', newCurrency);
  };

  // Update decimal places
  const updateDecimalPlaces = (places: number) => {
    setDecimalPlaces(places);
    const settingsService = getSettingsService();
    settingsService.setSetting('decimal_places', places.toString());
  };

  // Update app lock
  const updateAppLock = (enabled: boolean) => {
    setAppLockEnabled(enabled);
    const settingsService = getSettingsService();
    settingsService.setSetting('app_lock_enabled', enabled.toString());
  };

  // Update selected profile ID
  const updateSelectedProfileId = (profileId: number | 'all') => {
    setSelectedProfileId(profileId);
    const settingsService = getSettingsService();
    settingsService.setSetting('selected_profile_id', profileId.toString());
  };

  // Format currency with current settings
  const formatCurrency = (amount: number) => {
    return `${currency} ${amount.toFixed(decimalPlaces)}`;
  };

  // Refresh settings (useful after database changes)
  const refreshSettings = () => {
    loadSettings();
  };

  const value: SettingsContextType = {
    currency,
    decimalPlaces,
    appLockEnabled,
    selectedProfileId,
    isLoading,
    updateCurrency,
    updateDecimalPlaces,
    updateAppLock,
    formatCurrency,
    updateSelectedProfileId,
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
