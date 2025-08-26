import DatabaseConnector from "./DatabaseConnector";
import { Budget, Category } from "../types";
import TransactionService from "./TransactionService";

export interface BudgetSummary {
  expenseLimit: number;
  spent: number;
  available: number;
  categories: Array<{
    name: string;
    spent: number;
    limit: number;
    color: string;
    icon: string;
  }>;
  unbudgeted: Array<{
    name: string;
    amount: number;
    icon: string;
  }>;
}

class BudgetService {
  private db: ReturnType<DatabaseConnector["getDatabase"]>;
  private transactionService: TransactionService;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
    this.transactionService = new TransactionService();
  }

  getBudgets(): (Budget & { categoryName: string })[] {
    try {
      return this.db.getAllSync(`
        SELECT b.*, c.name as categoryName
        FROM budgets b
        JOIN categories c ON b.categoryId = c.id
      `) as (Budget & { categoryName: string })[];
    } catch (error) {
      console.error("Error getting budgets:", error);
      return [];
    }
  }

  getMonthlyBudgetSummary(
    year: number,
    month: number,
    profileId?: number,
  ): BudgetSummary {
    try {
      const startDate = new Date(year, month - 1, 1)
        .toISOString()
        .split("T")[0];
      const endDate = new Date(year, month, 0).toISOString().split("T")[0];

      const allBudgets: (Budget & {
        categoryName: string;
        color: string;
        icon: string;
      })[] = this.db.getAllSync(`
        SELECT b.*, c.name as categoryName, c.color, c.icon
        FROM budgets b
        JOIN categories c ON b.categoryId = c.id
        WHERE b.period = 'monthly'
      `);

      const allTransactions = this.transactionService.getTransactionsByDateRange(
        startDate,
        endDate,
        profileId,
      );

      const budgetedCategories = allBudgets.map((budget) => {
        const spent = allTransactions
          .filter(
            (t) => t.category === budget.categoryName && t.type === "expense",
          )
          .reduce((sum, t) => sum + t.amount, 0);
        return {
          name: budget.categoryName,
          spent,
          limit: budget.amount,
          color: budget.color,
          icon: budget.icon,
        };
      });

      const expenseLimit = allBudgets.reduce((sum, b) => sum + b.amount, 0);
      const totalSpent = allTransactions
        .filter(
          (t) => t.type === "expense" && !t.category.startsWith("Transfer"),
        )
        .reduce((sum, t) => sum + t.amount, 0);

      const budgetedCategoryNames = allBudgets.map((b) => b.categoryName);
      const unbudgetedTransactions = allTransactions.filter(
        (t) =>
          t.type === "expense" &&
          !budgetedCategoryNames.includes(t.category) &&
          !t.category.startsWith("Transfer"),
      );

      const allCategories: Category[] = this.db.getAllSync(
        "SELECT * FROM categories",
      );
      const categoryIconMap = allCategories.reduce(
        (map, cat) => ({ ...map, [cat.name]: cat.icon }),
        {} as { [key: string]: string },
      );

      const unbudgetedByCategory = unbudgetedTransactions.reduce(
        (acc, t) => {
          if (!acc[t.category]) {
            acc[t.category] = {
              name: t.category,
              amount: 0,
              icon: categoryIconMap[t.category] || "❓",
            };
          }
          acc[t.category].amount += t.amount;
          return acc;
        },
        {} as { [key: string]: { name: string; amount: number; icon: string } },
      );

      return {
        expenseLimit,
        spent: totalSpent,
        available: expenseLimit - totalSpent,
        categories: budgetedCategories,
        unbudgeted: Object.values(unbudgetedByCategory),
      };
    } catch (error) {
      console.error("Error getting budget summary:", error);
      return {
        expenseLimit: 0,
        spent: 0,
        available: 0,
        categories: [],
        unbudgeted: [],
      };
    }
  }
}

export default BudgetService;
