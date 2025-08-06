import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  useColorScheme,
  SafeAreaView,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useTheme } from "../../context/ThemeContext";
import { useSettings } from "../../context/SettingsContext";
import OptionSelector from "../../components/OptionSelector";
import ManageCategoriesScreen from "../../components/ManageCategoriesScreen";
import ExportDataScreen from "../../components/ExportDataScreen";

export default function SettingsScreen() {
  const {
    theme,
    themePreference,
    updateThemePreference,
    isDark,
    refreshTheme,
  } = useTheme();
  const {
    currency,
    decimalPlaces,
    appLockEnabled,
    updateCurrency,
    updateDecimalPlaces,
    updateAppLock,
  } = useSettings();
  const styles = createStyles(theme);

  // Modal states
  const [themeModalVisible, setThemeModalVisible] = useState(false);
  const [currencyModalVisible, setCurrencyModalVisible] = useState(false);
  const [decimalModalVisible, setDecimalModalVisible] = useState(false);
  const [manageCategoriesVisible, setManageCategoriesVisible] = useState(false);
  const [exportDataVisible, setExportDataVisible] = useState(false);

  const handleThemeChange = (newTheme: "system" | "light" | "dark") => {
    updateThemePreference(newTheme);

    // Refresh the theme context to pick up the new setting
    refreshTheme();
  };

  const handleCurrencyChange = (newCurrency: string) => {
    updateCurrency(newCurrency);
  };

  const handleDecimalPlacesChange = (newDecimalPlaces: string) => {
    updateDecimalPlaces(parseInt(newDecimalPlaces, 10));
  };

  // Theme options
  const themeOptions = [
    { label: "System", value: "system", subtitle: "Follow device setting" },
    { label: "Light", value: "light", subtitle: "Always use light theme" },
    { label: "Dark", value: "dark", subtitle: "Always use dark theme" },
  ];

  // Currency options
  const currencyOptions = [
    { label: "₹ Indian Rupee", value: "₹" },
    { label: "$ US Dollar", value: "$" },
    { label: "€ Euro", value: "€" },
    { label: "£ British Pound", value: "£" },
    { label: "¥ Japanese Yen", value: "¥" },
    { label: "₽ Russian Ruble", value: "₽" },
  ];

  // Decimal places options
  const decimalOptions = [
    { label: "0 decimal places", value: "0", subtitle: "e.g. ₹100" },
    { label: "1 decimal place", value: "1", subtitle: "e.g. ₹100.0" },
    { label: "2 decimal places", value: "2", subtitle: "e.g. ₹100.00" },
    { label: "3 decimal places", value: "3", subtitle: "e.g. ₹100.000" },
  ];

  const toggleAppLock = () => {
    updateAppLock(!appLockEnabled);
  };

  const SettingItem = ({
    title,
    subtitle,
    rightComponent,
    onPress,
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
    <View style={styles.container}>
      <StatusBar style={isDark ? "light" : "dark"} />
      <ScrollView style={{ flex: 1 }}>
        <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Appearance</Text>
          <SettingItem
            title="Theme"
            subtitle={`${
              themePreference.charAt(0).toUpperCase() + themePreference.slice(1)
            } theme`}
            rightComponent={<Text style={styles.chevron}>›</Text>}
            onPress={() => setThemeModalVisible(true)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Currency</Text>
          <SettingItem
            title="Currency"
            subtitle={currency}
            rightComponent={<Text style={styles.chevron}>›</Text>}
            onPress={() => setCurrencyModalVisible(true)}
          />
          <SettingItem
            title="Decimal Places"
            subtitle={decimalPlaces.toString()}
            rightComponent={<Text style={styles.chevron}>›</Text>}
            onPress={() => setDecimalModalVisible(true)}
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data</Text>
          <SettingItem
            title="Export Data"
            subtitle="Export transactions to CSV"
            rightComponent={<Text style={styles.chevron}>›</Text>}
            onPress={() => setExportDataVisible(true)}
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
            onPress={() => setManageCategoriesVisible(true)}
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
                value={appLockEnabled}
                onValueChange={toggleAppLock}
                trackColor={{
                  false: theme.colors.border,
                  true: theme.colors.primary,
                }}
                thumbColor={theme.colors.surface}
              />
            }
          />
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <SettingItem title="Version" subtitle="1.0.0" />
          <SettingItem
            title="Privacy Policy"
            rightComponent={<Text style={styles.chevron}>›</Text>}
          />
          <SettingItem
            title="Terms of Service"
            rightComponent={<Text style={styles.chevron}>›</Text>}
          />
        </View>

        {/* Theme Selection Modal */}
        <OptionSelector
          visible={themeModalVisible}
          onClose={() => setThemeModalVisible(false)}
          title="Select Theme"
          options={themeOptions}
          selectedValue={themePreference}
          onSelect={(value: string) => {
            handleThemeChange(value as "system" | "light" | "dark");
          }}
        />

        {/* Currency Selection Modal */}
        <OptionSelector
          visible={currencyModalVisible}
          onClose={() => setCurrencyModalVisible(false)}
          title="Select Currency"
          options={currencyOptions}
          selectedValue={currency}
          onSelect={(value: string) => {
            handleCurrencyChange(value);
          }}
        />

        {/* Decimal Places Selection Modal */}
        <OptionSelector
          visible={decimalModalVisible}
          onClose={() => setDecimalModalVisible(false)}
          title="Decimal Places"
          options={decimalOptions}
          selectedValue={decimalPlaces.toString()}
          onSelect={(value: string) => {
            handleDecimalPlacesChange(value);
          }}
        />

        {/* Manage Categories Screen */}
        <ManageCategoriesScreen
          visible={manageCategoriesVisible}
          onClose={() => setManageCategoriesVisible(false)}
        />

        {/* Export Data Screen */}
        <ExportDataScreen
          visible={exportDataVisible}
          onClose={() => setExportDataVisible(false)}
        />
      </ScrollView>
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      paddingTop: 40,
      paddingBottom: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: theme.colors.text,
      marginHorizontal: 16,

    },
    section: {
      marginBottom: 32,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: theme.colors.text,
      marginBottom: 12,
      marginHorizontal: 16,
      marginTop: 16,
    },
    settingItem: {
      flexDirection: "row",
      alignItems: "center",
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
