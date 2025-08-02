import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import AppNavigator from './src/navigation/AppNavigator';
import { initializeSampleData } from './src/utils/sampleData';
import { ThemeProvider } from './src/context/ThemeContext';
import './global.css';

export default function App() {
  useEffect(() => {
    // Initialize sample data on app start
    initializeSampleData();
  }, []);

  return (
    <ThemeProvider>
      <StatusBar style="light" backgroundColor="#14b8a6" />
      <AppNavigator />
    </ThemeProvider>
  );
}
