import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert} from 'react-native';
import { Transaction } from '../types';
import { useSettings } from '../context/SettingsContext';

export interface ExportOptions {
  dateRange?: 'all' | 'thisMonth' | 'lastMonth' | 'thisYear' | 'custom';
  startDate?: string;
  endDate?: string;
  format: 'csv' | 'json';
  includeCategories?: boolean;
}

export const useDataExporter = () => {
  const { currency } = useSettings();

  const exportToCSV = async (
    transactions: Array<Transaction & { categoryName?: string }>, 
    options: ExportOptions = { format: 'csv' }
  ): Promise<string> => {
    // CSV Headers
    const headers = [
      'Date',
      'Type',
      'Category',
      'Amount',
      'Description',
      'Payment Method',
      'Created At',
      'Updated At'
    ];
    
    // Convert transactions to CSV format
    const csvRows = [headers.join(',')];
    
    transactions.forEach(transaction => {
      const row = [
        `"${transaction.date}"`,
        `"${transaction.type}"`,
        `"${transaction.categoryName || transaction.category}"`,
        `"${currency}${transaction.amount.toFixed(2)}"`,
        `"${transaction.description || ''}"`,
        `"${transaction.paymentMethod}"`,
        `"${transaction.createdAt}"`,
        `"${transaction.updatedAt}"`
      ];
      csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
  };
  
  const exportToJSON = async (
    transactions: Array<Transaction & { categoryName?: string }>,
    options: ExportOptions = { format: 'json' }
  ): Promise<string> => {
    const exportData = {
      exportInfo: {
        generatedAt: new Date().toISOString(),
        totalTransactions: transactions.length,
        currency: currency,
        dateRange: options.dateRange || 'all',
        ...(options.startDate && { startDate: options.startDate }),
        ...(options.endDate && { endDate: options.endDate })
      },
      transactions: transactions.map(transaction => ({
        id: transaction.id,
        date: transaction.date,
        type: transaction.type,
        category: transaction.categoryName || transaction.category,
        amount: transaction.amount,
        description: transaction.description,
        paymentMethod: transaction.paymentMethod,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt
      }))
    };
    
    return JSON.stringify(exportData, null, 2);
  };
  
  const saveAndShareFile = async (
    content: string, 
    filename: string, 
    format: 'csv' | 'json'
  ): Promise<{ success: boolean; filePath?: string }> => {
    try {
      const fileUri = `${FileSystem.documentDirectory}${filename}.${format}`;
      
      // Write file to device storage
      await FileSystem.writeAsStringAsync(fileUri, content, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      
      // Check if sharing is available and share the file
      const isAvailable = await Sharing.isAvailableAsync();
      if (isAvailable) {
        await Sharing.shareAsync(fileUri, {
          mimeType: format === 'csv' ? 'text/csv' : 'application/json',
          dialogTitle: `Export Kakeibo Data (${format.toUpperCase()})`,
        });
      } else {
        // Fallback for platforms where sharing isn't available
        Alert.alert(
          'File Saved',
          `File saved successfully to:\n${fileUri}`,
          [{ text: 'OK' }]
        );
      }
      
      return { success: true, filePath: fileUri };
    } catch (error) {
      console.error('Error saving and sharing file:', error);
      return { success: false };
    }
  };
  
  const generateFilename = (options: ExportOptions): string => {
    const now = new Date();
    const timestamp = now.toISOString().slice(0, 10); // YYYY-MM-DD
    
    let rangePart = '';
    switch (options.dateRange) {
      case 'thisMonth':
        rangePart = `_${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'lastMonth':
        const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1);
        rangePart = `_${lastMonth.getFullYear()}-${String(lastMonth.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'thisYear':
        rangePart = `_${now.getFullYear()}`;
        break;
      case 'custom':
        if (options.startDate && options.endDate) {
          rangePart = `_${options.startDate}_to_${options.endDate}`;
        }
        break;
      default:
        rangePart = '_all';
    }
    
    return `kakeibo_export${rangePart}_${timestamp}`;
  };
  
  const getDateRangeForOption = (option: string): { startDate: string; endDate: string } | null => {
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    
    switch (option) {
      case 'thisMonth':
        return {
          startDate: new Date(currentYear, currentMonth, 1).toISOString().slice(0, 10),
          endDate: new Date(currentYear, currentMonth + 1, 0).toISOString().slice(0, 10)
        };
      
      case 'lastMonth':
        return {
          startDate: new Date(currentYear, currentMonth - 1, 1).toISOString().slice(0, 10),
          endDate: new Date(currentYear, currentMonth, 0).toISOString().slice(0, 10)
        };
      
      case 'thisYear':
        return {
          startDate: new Date(currentYear, 0, 1).toISOString().slice(0, 10),
          endDate: new Date(currentYear, 11, 31).toISOString().slice(0, 10)
        };
      
      default:
        return null;
    }
  };
  
  const formatSummaryText = (summary: {
    totalTransactions: number;
    totalIncome: number;
    totalExpense: number;
    earliestDate: string | null;
    latestDate: string | null;
  }): string => {
    const balance = summary.totalIncome - summary.totalExpense;
    
    return `Export Summary:
• Total Transactions: ${summary.totalTransactions}
• Total Income: ${currency}${summary.totalIncome.toFixed(2)}
• Total Expenses: ${currency}${summary.totalExpense.toFixed(2)}
• Net Balance: ${currency}${balance.toFixed(2)}
• Date Range: ${summary.earliestDate || 'N/A'} to ${summary.latestDate || 'N/A'}`;
  };

  return {
    exportToCSV,
    exportToJSON,
    saveAndShareFile,
    generateFilename,
    getDateRangeForOption,
    formatSummaryText
  };
};
