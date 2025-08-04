import React from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export default function SettingsScreen() {
  const { theme, toggleTheme, isDark } = useTheme();
  const styles = createStyles(theme);

  const SettingItem = ({ 
    title, 
    subtitle, 
    rightComponent, 
    onPress 
  }: {
    title: string;
    subtitle?: string;
    rightComponent?: React.ReactNode;
    onPress?: () => void;
  }) => (
    <TouchableOpacity style={styles.settingItem} onPress={onPress}>
      <View style={styles.settingContent}>
        <Text style={styles.settingTitle}>{title}</Text>
        {subtitle && <Text style={styles.settingSubtitle}>{subtitle}</Text>}
      </View>
      {rightComponent}
    </TouchableOpacity>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Appearance</Text>
        <SettingItem
          title="Dark Mode"
          subtitle="Switch between light and dark theme"
          rightComponent={
            <Switch
              value={isDark}
              onValueChange={toggleTheme}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.surface}
            />
          }
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Currency</Text>
        <SettingItem
          title="Currency"
          subtitle="USD ($)"
          rightComponent={<Text style={styles.chevron}>›</Text>}
        />
        <SettingItem
          title="Decimal Places"
          subtitle="2"
          rightComponent={<Text style={styles.chevron}>›</Text>}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Data</Text>
        <SettingItem
          title="Export Data"
          subtitle="Export transactions to CSV"
          rightComponent={<Text style={styles.chevron}>›</Text>}
        />
        <SettingItem
          title="Import Data"
          subtitle="Import transactions from CSV"
          rightComponent={<Text style={styles.chevron}>›</Text>}
        />
        <SettingItem
          title="Clear All Data"
          subtitle="Remove all transactions and reset"
          rightComponent={<Text style={styles.chevron}>›</Text>}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Categories</Text>
        <SettingItem
          title="Manage Categories"
          subtitle="Add, edit, or remove categories"
          rightComponent={<Text style={styles.chevron}>›</Text>}
        />
        <SettingItem
          title="Category Colors"
          subtitle="Customize category colors"
          rightComponent={<Text style={styles.chevron}>›</Text>}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>
        <SettingItem
          title="App Lock"
          subtitle="Require authentication to open app"
          rightComponent={
            <Switch
              value={false}
              onValueChange={() => {}}
              trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
              thumbColor={theme.colors.surface}
            />
          }
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>
        <SettingItem
          title="Version"
          subtitle="1.0.0"
        />
        <SettingItem
          title="Privacy Policy"
          rightComponent={<Text style={styles.chevron}>›</Text>}
        />
        <SettingItem
          title="Terms of Service"
          rightComponent={<Text style={styles.chevron}>›</Text>}
        />
      </View>
    </ScrollView>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
    marginHorizontal: 16,
    marginTop: 16,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 16,
    backgroundColor: theme.colors.card,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  settingContent: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 16,
    color: theme.colors.text,
    marginBottom: 2,
  },
  settingSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  chevron: {
    fontSize: 18,
    color: theme.colors.textSecondary,
    marginLeft: 8,
  },
});
