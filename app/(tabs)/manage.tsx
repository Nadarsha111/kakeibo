import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../../context/ThemeContext';
import ManageCategoriesScreen from '../../components/ManageCategoriesScreen';
import ExportDataScreen from '../../components/ExportDataScreen';
import { router } from 'expo-router';

export default function ManageTab() {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const [showManageCategories, setShowManageCategories] = useState(false);
  const [showExportData, setShowExportData] = useState(false);

  const manageOptions = [
    {
      id: 'categories',
      title: 'Categories',
      subtitle: 'Manage income and expense categories',
      icon: 'shape-outline',
      color: '#8b5cf6',
      onPress: () => setShowManageCategories(true),
    },
    {
      id: 'budget',
      title: 'Budget Planning',
      subtitle: 'Set and track spending limits',
      icon: 'calendar-month-outline',
      color: '#06b6d4',
      onPress: () => {
        router.push('/budget');
      },
    },
    {
      id: 'export',
      title: 'Export Data',
      subtitle: 'Download your transaction data',
      icon: 'download-outline',
      color: '#10b981',
      onPress: () => setShowExportData(true),
    },
    {
      id: 'analytics',
      title: 'Analytics',
      subtitle: 'View spending insights and reports',
      icon: 'chart-line',
      color: '#f59e0b',
      onPress: () => {
        // TODO: Add analytics functionality
        console.log('Analytics functionality to be implemented');
      },
    },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle={theme.isDark ? 'light-content' : 'dark-content'}
        backgroundColor={theme.colors.background}
      />
      
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Manage</Text>
        <Text style={styles.headerSubtitle}>Organize your financial data</Text>
      </View>

      <ScrollView 
        style={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.optionsGrid}>
          {manageOptions.map((option) => (
            <TouchableOpacity
              key={option.id}
              style={styles.optionCard}
              onPress={option.onPress}
            >
              <View style={[styles.iconContainer, { backgroundColor: `${option.color}20` }]}>
                <MaterialCommunityIcons 
                  name={option.icon as any} 
                  size={32} 
                  color={option.color} 
                />
              </View>
              <View style={styles.optionContent}>
                <Text style={styles.optionTitle}>{option.title}</Text>
                <Text style={styles.optionSubtitle}>{option.subtitle}</Text>
              </View>
              <MaterialCommunityIcons 
                name="chevron-right" 
                size={24} 
                color={theme.colors.textSecondary} 
              />
            </TouchableOpacity>
          ))}
        </View>

        {/* Quick Stats Section */}
        <View style={styles.statsSection}>
          <Text style={styles.statsTitle}>Quick Stats</Text>
          <View style={styles.statsGrid}>
            <View style={styles.statCard}>
              <MaterialCommunityIcons 
                name="shape-outline" 
                size={20} 
                color={theme.colors.primary} 
              />
              <Text style={styles.statValue}>10</Text>
              <Text style={styles.statLabel}>Categories</Text>
            </View>
            <View style={styles.statCard}>
              <MaterialCommunityIcons 
                name="bank-outline" 
                size={20} 
                color={theme.colors.primary} 
              />
              <Text style={styles.statValue}>4</Text>
              <Text style={styles.statLabel}>Accounts</Text>
            </View>
            <View style={styles.statCard}>
              <MaterialCommunityIcons 
                name="calendar-month" 
                size={20} 
                color={theme.colors.primary} 
              />
              <Text style={styles.statValue}>3</Text>
              <Text style={styles.statLabel}>Budgets</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* Modal Screens */}
      <ManageCategoriesScreen
        visible={showManageCategories}
        onClose={() => setShowManageCategories(false)}
      />
      
      <ExportDataScreen
        visible={showExportData}
        onClose={() => setShowExportData(false)}
      />
    </SafeAreaView>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingHorizontal: 20,
      paddingVertical: 20,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginBottom: 4,
    },
    headerSubtitle: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    content: {
      flex: 1,
      paddingHorizontal: 20,
    },
    optionsGrid: {
      paddingTop: 20,
    },
    optionCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      padding: 16,
      borderRadius: 12,
      marginBottom: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    iconContainer: {
      width: 56,
      height: 56,
      borderRadius: 28,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 16,
    },
    optionContent: {
      flex: 1,
    },
    optionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 4,
    },
    optionSubtitle: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      lineHeight: 16,
    },
    statsSection: {
      marginTop: 32,
      paddingBottom: 20,
    },
    statsTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 16,
    },
    statsGrid: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    statCard: {
      flex: 1,
      backgroundColor: theme.colors.surface,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginHorizontal: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    statValue: {
      fontSize: 20,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginVertical: 8,
    },
    statLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      textAlign: 'center',
    },
  });
