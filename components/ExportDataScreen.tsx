import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
  Modal,
  TextInput,
  Alert,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useTheme } from '../context/ThemeContext';
import DatabaseService from '../database/database';
import { DataExporter, ExportOptions } from '../utils/dataExporter';
import OptionSelector from './OptionSelector';

interface ExportDataScreenProps {
  visible: boolean;
  onClose: () => void;
}

export default function ExportDataScreen({ visible, onClose }: ExportDataScreenProps) {
  const { theme, isDark } = useTheme();
  const styles = createStyles(theme);
  
  const [selectedFormat, setSelectedFormat] = useState<'csv' | 'json'>('csv');
  const [selectedDateRange, setSelectedDateRange] = useState<'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [exportSummary, setExportSummary] = useState<any>(null);
  
  // Modal states
  const [showFormatSelector, setShowFormatSelector] = useState(false);
  const [showDateRangeSelector, setShowDateRangeSelector] = useState(false);

  useEffect(() => {
    if (visible) {
      loadExportSummary();
      // Set default custom dates to this month
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setCustomStartDate(firstDay.toISOString().slice(0, 10));
      setCustomEndDate(lastDay.toISOString().slice(0, 10));
    }
  }, [visible]);

  const loadExportSummary = () => {
    const summary = DatabaseService.getExportSummary();
    setExportSummary(summary);
  };

  const formatOptions = [
    { label: 'CSV Format', value: 'csv', subtitle: 'Comma-separated values (Excel compatible)' },
    { label: 'JSON Format', value: 'json', subtitle: 'JavaScript Object Notation (Developer friendly)' },
  ];

  const dateRangeOptions = [
    { label: 'All Time', value: 'all', subtitle: 'Export all transactions' },
    { label: 'This Month', value: 'thisMonth', subtitle: 'Current month only' },
    { label: 'Last Month', value: 'lastMonth', subtitle: 'Previous month only' },
    { label: 'This Year', value: 'thisYear', subtitle: 'Current year only' },
    { label: 'Custom Range', value: 'custom', subtitle: 'Choose specific dates' },
  ];

  const handleExport = async () => {
    if (selectedDateRange === 'custom') {
      if (!customStartDate || !customEndDate) {
        Alert.alert('Error', 'Please select both start and end dates for custom range.');
        return;
      }
      if (new Date(customStartDate) > new Date(customEndDate)) {
        Alert.alert('Error', 'Start date must be before end date.');
        return;
      }
    }

    setIsExporting(true);

    try {
      let transactions;
      const exportOptions: ExportOptions = {
        format: selectedFormat,
        dateRange: selectedDateRange,
        includeCategories: true,
      };

      // Get transactions based on date range
      if (selectedDateRange === 'all') {
        transactions = DatabaseService.getAllTransactionsForExport();
      } else if (selectedDateRange === 'custom') {
        transactions = DatabaseService.getTransactionsByDateRange(customStartDate, customEndDate, true);
        exportOptions.startDate = customStartDate;
        exportOptions.endDate = customEndDate;
      } else {
        const range = DataExporter.getDateRangeForOption(selectedDateRange);
        if (range) {
          transactions = DatabaseService.getTransactionsByDateRange(range.startDate, range.endDate, true);
          exportOptions.startDate = range.startDate;
          exportOptions.endDate = range.endDate;
        } else {
          transactions = DatabaseService.getAllTransactionsForExport();
        }
      }

      if (transactions.length === 0) {
        Alert.alert('No Data', 'No transactions found for the selected date range.');
        setIsExporting(false);
        return;
      }

      // Generate content based on format
      let content: string;
      if (selectedFormat === 'csv') {
        content = await DataExporter.exportToCSV(transactions, exportOptions);
      } else {
        content = await DataExporter.exportToJSON(transactions, exportOptions);
      }

      // Generate filename and save
      const filename = DataExporter.generateFilename(exportOptions);
      const result = await DataExporter.saveAndShareFile(content, filename, selectedFormat);

      if (result.success) {
        Alert.alert(
          'Export Successful',
          `${transactions.length} transactions exported successfully!\n\nFile: ${filename}.${selectedFormat}\n\nThe file has been saved and is ready to share.`,
          [
            {
              text: 'Done',
              onPress: () => onClose(),
            },
          ]
        );
      } else {
        Alert.alert('Export Failed', 'Unable to save the export file. Please try again.');
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Export Failed', 'An error occurred during export. Please try again.');
    } finally {
      setIsExporting(false);
    }
  };

  const OptionItem = ({ 
    title, 
    subtitle, 
    value,
    onPress 
  }: {
    title: string;
    subtitle: string;
    value: string;
    onPress: () => void;
  }) => (
    <TouchableOpacity style={styles.optionItem} onPress={onPress}>
      <View style={styles.optionContent}>
        <Text style={styles.optionTitle}>{title}</Text>
        <Text style={styles.optionSubtitle}>{subtitle}</Text>
      </View>
      <View style={styles.optionValue}>
        <Text style={styles.optionValueText}>{value}</Text>
        <Text style={styles.chevron}>›</Text>
      </View>
    </TouchableOpacity>
  );

  const getDateRangeDisplayText = () => {
    switch (selectedDateRange) {
      case 'all':
        return 'All Time';
      case 'thisMonth':
        return 'This Month';
      case 'lastMonth':
        return 'Last Month';
      case 'thisYear':
        return 'This Year';
      case 'custom':
        return `${customStartDate} to ${customEndDate}`;
      default:
        return 'All Time';
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet">
      <SafeAreaView style={styles.container}>
        <StatusBar style={isDark ? "light" : "dark"} />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeButton}>Cancel</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Export Data</Text>
          <View style={{ width: 60 }} />
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Export Summary */}
          {exportSummary && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Export Summary</Text>
              <Text style={styles.summaryText}>
                {DataExporter.formatSummaryText(exportSummary)}
              </Text>
            </View>
          )}

          {/* Export Options */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Export Options</Text>
            
            <OptionItem
              title="Export Format"
              subtitle="Choose the file format for your export"
              value={selectedFormat.toUpperCase()}
              onPress={() => setShowFormatSelector(true)}
            />
            
            <OptionItem
              title="Date Range"
              subtitle="Select which transactions to export"
              value={getDateRangeDisplayText()}
              onPress={() => setShowDateRangeSelector(true)}
            />
          </View>

          {/* Custom Date Range Inputs */}
          {selectedDateRange === 'custom' && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Custom Date Range</Text>
              
              <View style={styles.dateInputRow}>
                <View style={styles.dateInputGroup}>
                  <Text style={styles.inputLabel}>Start Date</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={customStartDate}
                    onChangeText={setCustomStartDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                </View>
                
                <View style={styles.dateInputGroup}>
                  <Text style={styles.inputLabel}>End Date</Text>
                  <TextInput
                    style={styles.dateInput}
                    value={customEndDate}
                    onChangeText={setCustomEndDate}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={theme.colors.textSecondary}
                  />
                </View>
              </View>
            </View>
          )}

          {/* Export Button */}
          <TouchableOpacity
            style={[styles.exportButton, isExporting && styles.exportButtonDisabled]}
            onPress={handleExport}
            disabled={isExporting}
          >
            {isExporting ? (
              <ActivityIndicator color="white" />
            ) : (
              <Text style={styles.exportButtonText}>Export Data</Text>
            )}
          </TouchableOpacity>
        </ScrollView>

        {/* Format Selector Modal */}
        <OptionSelector
          visible={showFormatSelector}
          onClose={() => setShowFormatSelector(false)}
          title="Select Export Format"
          options={formatOptions}
          selectedValue={selectedFormat}
          onSelect={(value: string) => {
            setSelectedFormat(value as 'csv' | 'json');
          }}
        />

        {/* Date Range Selector Modal */}
        <OptionSelector
          visible={showDateRangeSelector}
          onClose={() => setShowDateRangeSelector(false)}
          title="Select Date Range"
          options={dateRangeOptions}
          selectedValue={selectedDateRange}
          onSelect={(value: string) => {
            setSelectedDateRange(value as any);
          }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const createStyles = (theme: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  closeButton: {
    color: theme.colors.primary,
    fontSize: 16,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.text,
  },
  content: {
    flex: 1,
    paddingHorizontal: 16,
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    padding: 16,
    marginVertical: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  summaryText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  section: {
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 12,
  },
  optionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    fontSize: 14,
    color: theme.colors.textSecondary,
  },
  optionValue: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  optionValueText: {
    fontSize: 14,
    color: theme.colors.primary,
    fontWeight: '600',
    marginRight: 4,
  },
  chevron: {
    fontSize: 16,
    color: theme.colors.textSecondary,
  },
  dateInputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateInputGroup: {
    flex: 1,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  dateInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  exportButton: {
    backgroundColor: theme.colors.primary,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginVertical: 24,
  },
  exportButtonDisabled: {
    opacity: 0.6,
  },
  exportButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
});
