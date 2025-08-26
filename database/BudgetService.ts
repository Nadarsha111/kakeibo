import DatabaseConnector from "./DatabaseConnector";
import { Budget, BudgetWithCategory, Category } from "../types";
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

  getBudgets(): BudgetWithCategory[] {
    try {
      return this.db.getAllSync(`
        SELECT b.*, c.name as categoryName, c.color as categoryColor, c.icon as categoryIcon
        FROM budgets b
        JOIN categories c ON b.categoryId = c.id
        ORDER BY c.name
      `) as BudgetWithCategory[];
    } catch (error) {
      console.error("Error getting budgets:", error);
      return [];
    }
  }

  addBudget(budget: Omit<Budget, "id">): number {
    try {
      // For monthly budgets, set start and end to the current month
      if (budget.period === "monthly" && !budget.startDate) {
        const now = new Date();
        budget.startDate = new Date(now.getFullYear(), now.getMonth(), 1)
          .toISOString()
          .split("T")[0];
        budget.endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0)
          .toISOString()
          .split("T")[0];
      }

      const result = this.db.runSync(
        "INSERT INTO budgets (categoryId, amount, period, startDate, endDate) VALUES (?, ?, ?, ?, ?)",
        [
          budget.categoryId,
          budget.amount,
          budget.period,
          budget.startDate,
          budget.endDate,
        ],
      );

      console.log("Budget added:", {
        id: result.lastInsertRowId,
        categoryId: budget.categoryId,
        amount: budget.amount,
      });
      return result.lastInsertRowId;
    } catch (error) {
      console.error("Error adding budget:", error);
      throw error;
    }
  }

  updateBudget(
    id: number,
    updates: Partial<Omit<Budget, "id" | "period" | "startDate" | "endDate">>,
  ): boolean {
    try {
      const fields = [];
      const values = [];

      if (updates.categoryId !== undefined) {
        fields.push("categoryId = ?");
        values.push(updates.categoryId);
      }
      if (updates.amount !== undefined) {
        fields.push("amount = ?");
        values.push(updates.amount);
      }

      if (fields.length === 0) {
        console.warn("No fields to update for budget:", id);
        return false;
      }

      values.push(id);
      this.db.runSync(
        `UPDATE budgets SET ${fields.join(", ")} WHERE id = ?`,
        values,
      );

      console.log("Budget updated:", id);
      return true;
    } catch (error) {
      console.error("Error updating budget:", error);
      return false;
    }
  }

  deleteBudget(id: number): boolean {
    try {
      this.db.runSync("DELETE FROM budgets WHERE id = ?", [id]);
      console.log("Budget deleted:", id);
      return true;
    } catch (error) {
      console.error("Error deleting budget:", error);
      return false;
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

      const allTransactions =
        this.transactionService.getTransactionsByDateRange(
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
