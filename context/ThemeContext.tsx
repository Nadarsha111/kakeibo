import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import DatabaseService from '../database/database';

export interface ThemeColors {
  primary: string;
  background: string;
  surface: string;
  text: string;
  textSecondary: string;
  border: string;
  success: string;
  error: string;
  warning: string;
  card: string;
}

export interface Theme {
  colors: ThemeColors;
  isDark: boolean;
}

const lightTheme: Theme = {
  colors: {
    primary: '#14b8a6',
    background: '#f9fafb',
    surface: '#ffffff',
    text: '#111827',
    textSecondary: '#6b7280',
    border: '#e5e7eb',
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    card: '#ffffff',
  },
  isDark: false,
};

const darkTheme: Theme = {
  colors: {
    primary: '#14b8a6',
    background: '#111827',
    surface: '#1f2937',
    text: '#f9fafb',
    textSecondary: '#9ca3af',
    border: '#374151',
    success: '#10b981',
    error: '#ef4444',
    warning: '#f59e0b',
    card: '#1f2937',
  },
  isDark: true,
};

interface ThemeContextType {
  theme: Theme;
  toggleTheme: () => void;
  isDark: boolean;
  isLoading: boolean;
  refreshTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: React.ReactNode;
}

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  const systemColorScheme = useColorScheme();
  const [isDark, setIsDark] = useState(systemColorScheme === 'dark');
  const [isLoading, setIsLoading] = useState(true);

  // Load saved theme preference on app start
  useEffect(() => {
    loadThemePreference();
  }, []);

  // Apply system theme changes when no explicit preference is set
  useEffect(() => {
    const savedTheme = DatabaseService.getSetting('theme_preference');
    if (!savedTheme || savedTheme === 'system') {
      setIsDark(systemColorScheme === 'dark');
    }
  }, [systemColorScheme]);

  const loadThemePreference = async () => {
    try {
      const savedTheme = DatabaseService.getSetting('theme_preference');
      
      if (savedTheme) {
        if (savedTheme === 'system') {
          setIsDark(systemColorScheme === 'dark');
        } else {
          setIsDark(savedTheme === 'dark');
        }
      } else {
        // First time - use system preference and save it
        setIsDark(systemColorScheme === 'dark');
        DatabaseService.setSetting('theme_preference', 'system');
      }
    } catch (error) {
      console.error('Error loading theme preference:', error);
      setIsDark(systemColorScheme === 'dark');
    } finally {
      setIsLoading(false);
    }
  };

  const toggleTheme = () => {
    const newTheme = isDark ? 'light' : 'dark';
    setIsDark(!isDark);
    
    try {
      DatabaseService.setSetting('theme_preference', newTheme);
    } catch (error) {
      console.error('Error saving theme preference:', error);
    }
  };

  const refreshTheme = () => {
    loadThemePreference();
  };

  const theme = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, isDark, isLoading, refreshTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
