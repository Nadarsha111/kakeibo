# Kakeibo - Personal Finance Tracker

A modern Kakeibo (Japanese household ledger) expense tracking app built with Expo React Native, TypeScript, and SQLite for offline data storage.

## Features

- **Overview Dashboard**: View account balance, weekly/monthly summaries, and top spending categories
- **Transaction Management**: Track income and expenses with categories and payment methods
- **Budget Tracking**: Set and monitor budgets for different expense categories
- **Category Analysis**: Visual breakdown of spending by categories with charts
- **Offline First**: All data stored locally using SQLite for reliable offline functionality
- **Modern UI**: Clean, intuitive interface inspired by Japanese design principles

## Tech Stack

- **Frontend**: Expo React Native with TypeScript
- **Database**: SQLite (expo-sqlite) for offline data storage
- **Styling**: NativeWind (Tailwind CSS for React Native)
- **Navigation**: React Navigation with bottom tabs
- **Charts**: React Native SVG Charts and Victory Native

## Project Structure

```
src/
├── navigation/         # Navigation configuration
│   └── AppNavigator.tsx
├── screens/           # Main application screens
│   ├── OverviewScreen.tsx
│   ├── TransactionsScreen.tsx
│   ├── BudgetScreen.tsx
│   └── CategoriesScreen.tsx
├── services/          # Business logic and data services
│   └── database.ts
├── types/             # TypeScript type definitions
│   └── index.ts
└── utils/            # Utility functions and helpers
    └── sampleData.ts
```

## Data Models

### Transaction
- ID, amount, type (income/expense)
- Category, description, date
- Payment method (cash, credit card, debit card)
- Timestamps (created/updated)

### Category
- ID, name, color, icon
- Type (income/expense)
- Optional budget limit

### Account Balance
- Total balance with last updated timestamp

## Getting Started

### Prerequisites
- Node.js (v16 or later)
- npm or yarn
- Expo CLI

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start the development server:
```bash
npm start
```

3. Run on your device:
- Install Expo Go app on your mobile device
- Scan the QR code displayed in the terminal/browser
- Or use the following platform-specific commands:

```bash
# For Android
npm run android

# For iOS (macOS only)
npm run ios

# For Web
npm run web
```

## Features in Detail

### Overview Screen
- Account balance display
- Weekly and monthly expense summaries
- Top spending categories
- Visual chart of spending patterns

### Transactions Screen
- Chronological list of all transactions
- Income and expense categorization
- Payment method tracking
- Add new transaction functionality

### Budget Screen
- Monthly budget overview
- Category-wise budget limits
- Progress tracking with visual indicators
- Unbudgeted expense tracking

### Categories Screen
- Pie chart visualization of spending
- Category-wise expense breakdown
- Percentage distribution
- Quick category overview grid

## Database Schema

The app uses SQLite with the following tables:
- `transactions` - All income and expense records
- `categories` - Predefined and custom categories
- `budgets` - Budget limits and periods
- `account_balance` - Current account balance

## Development

### Adding New Features
1. Create new components in appropriate directories
2. Update types in `src/types/index.ts`
3. Add database methods in `src/services/database.ts`
4. Update navigation if needed

### Styling
The project uses regular React Native StyleSheet for consistent styling. NativeWind/Tailwind CSS support is configured but not actively used in the current implementation.

## Troubleshooting

### Common Issues
1. **Database errors**: Clear app data and restart
2. **Navigation issues**: Ensure all screen imports are correct
3. **Build errors**: Clear node_modules and reinstall dependencies

### Reset Development Environment
```bash
# Clear Metro bundler cache
npx expo start --clear

# Reset Node modules
rm -rf node_modules
npm install
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Acknowledgments

- Inspired by traditional Japanese Kakeibo budgeting method
- Built with Expo and React Native ecosystem
- UI design inspired by modern fintech applications
