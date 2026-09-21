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
- **Navigation**: Expo Router, with a bottom tab bar for the main screens
- **Charts**: React Native SVG Charts and Victory Native
- **Updates**: Expo/EAS Update for shipping JS-only changes over the air (see `.github/workflows/eas-update.yml`)

## Project Structure

```
app/
├── _layout.tsx         # Root layout: settings/theme providers
└── (tabs)/              # One file per bottom-tab screen (routes)
    ├── _layout.tsx      # Tab bar, FAB, transaction-modal provider
    ├── index.tsx        # Overview dashboard
    ├── transactions.tsx
    ├── budget.tsx
    ├── accounts.tsx
    ├── worth.tsx        # Net worth / assets & liabilities
    ├── manage.tsx       # Categories, export, etc.
    ├── profiles.tsx
    └── settings.tsx
components/
├── modals/             # Full-screen <Modal> components opened from a tab screen
│   ├── AddAccountModal.tsx, AddTransactionModal.tsx, ManageCategoriesModal.tsx, ...
└── *.tsx                # Reusable presentational widgets (charts, chips, cards, tab bar)
database/
├── DatabaseConnector.ts # Singleton SQLite connection, schema, and additive migrations
├── index.ts             # ServiceFactory: shared instances of the services below
└── *Service.ts           # One service per entity (accounts, transactions, budgets, ...)
context/                 # React context providers (settings, theme, transaction modal)
hooks/                   # Reusable hooks (data export, tab swipe/scrub, Drizzle Studio)
services/                # Google Sign-In + Google Sheets export/sync
utils/                   # Formatting, loan math, recurring-item math, etc.
types/                   # Shared TypeScript domain types
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

The app uses SQLite (see `database/DatabaseConnector.ts`) with the following tables:
- `profiles` - Separate personal/business/etc. ledgers
- `accounts` - Savings, checking, credit card, loan, investment, and cash accounts
- `credit_cards` - Extra physical cards sharing one account's balance/limit
- `card_emis` - Credit card purchases converted to fixed monthly installments
- `transactions` - All income and expense records
- `categories` - Predefined and custom categories
- `budgets` - Budget limits and periods
- `recurring_items` - Rent, subscriptions, salary, and other recurring income/expenses/transfers
- `app_settings` - Persistent user preferences (currency, decimal places, etc.)

New installs get every table; existing installs are upgraded by the append-only
`MIGRATIONS` array in `DatabaseConnector.ts`, so existing data is never dropped
by an update — see the comment above that array before changing the schema.

## Development

### Adding New Features
1. Add routed screens under `app/(tabs)/`, reusable widgets in `components/`, and
   full-screen modals in `components/modals/`
2. Update types in `types/index.ts`
3. Add database methods in the relevant `database/*Service.ts` (append-only
   migrations in `DatabaseConnector.ts` for schema changes)
4. Update the tab layout (`app/(tabs)/_layout.tsx`) if needed

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
