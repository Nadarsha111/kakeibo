import DatabaseService from '../services/database';

export const initializeSampleData = () => {
  try {
    // Sample transactions for demo purposes
    const sampleTransactions = [
      {
        amount: 103.55,
        type: 'expense' as const,
        category: 'Restaurant',
        description: 'Dinner at Italian restaurant',
        date: '2023-06-30',
        paymentMethod: 'credit_card' as const,
      },
      {
        amount: 26.50,
        type: 'expense' as const,
        category: 'Transport',
        description: 'Gas station',
        date: '2023-06-30',
        paymentMethod: 'cash' as const,
      },
      {
        amount: 8.55,
        type: 'expense' as const,
        category: 'Transport',
        description: 'Bus fare',
        date: '2023-06-30',
        paymentMethod: 'credit_card' as const,
      },
      {
        amount: 180.79,
        type: 'expense' as const,
        category: 'Shopping',
        description: 'Clothing store',
        date: '2023-06-29',
        paymentMethod: 'credit_card' as const,
      },
      {
        amount: 67.39,
        type: 'expense' as const,
        category: 'Family',
        description: 'Kids toys',
        date: '2023-06-29',
        paymentMethod: 'credit_card' as const,
      },
      {
        amount: 97.37,
        type: 'expense' as const,
        category: 'Free time',
        description: 'Movie tickets',
        date: '2023-06-29',
        paymentMethod: 'cash' as const,
      },
      {
        amount: 16.03,
        type: 'expense' as const,
        category: 'Free time',
        description: 'Coffee shop',
        date: '2023-06-29',
        paymentMethod: 'credit_card' as const,
      },
      {
        amount: 59.28,
        type: 'expense' as const,
        category: 'Food',
        description: 'Groceries',
        date: '2023-06-28',
        paymentMethod: 'debit_card' as const,
      },
      {
        amount: 2500.00,
        type: 'income' as const,
        category: 'Salary',
        description: 'Monthly salary',
        date: '2023-06-01',
        paymentMethod: 'credit_card' as const,
      },
      {
        amount: 150.00,
        type: 'income' as const,
        category: 'Investment',
        description: 'Dividend payment',
        date: '2023-06-15',
        paymentMethod: 'credit_card' as const,
      },
    ];

    // Add sample transactions
    sampleTransactions.forEach(transaction => {
      try {
        DatabaseService.addTransaction(transaction);
      } catch (error) {
        console.log('Transaction may already exist:', error);
      }
    });

    console.log('Sample data initialized successfully');
  } catch (error) {
    console.error('Error initializing sample data:', error);
  }
};

export default { initializeSampleData };
