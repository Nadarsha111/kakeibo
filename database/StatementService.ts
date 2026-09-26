import DatabaseConnector from './DatabaseConnector';
import { ReconciledLineItem, StatementLineItem } from '../types';

// A statement line and a locally logged transaction are treated as the same real-world spend when
// they share an account, the same type (debit -> expense, credit -> income), the same amount, and
// a date within this many days of each other - a bank sometimes posts a transaction a day or two
// after you actually made it, so requiring an exact date match would miss real matches.
const MATCH_DATE_TOLERANCE_DAYS = 2;

/**
 * Persists and reconciles statement line items imported from a statement PDF. This is a
 * read-mostly side table for comparison against what you've already logged - it never writes to
 * or reads from `transactions` except to work out which line items already have a match.
 */
class StatementService {
  private db: ReturnType<DatabaseConnector['getDatabase']>;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
  }

  /**
   * Stores freshly parsed statement line items, replacing any previously imported for the same
   * account and statement month - re-sharing the same PDF, or a corrected re-export, should
   * replace rather than duplicate.
   */
  importLineItems(
    profileId: number,
    accountId: number,
    statementMonth: string,
    items: Array<Pick<StatementLineItem, 'date' | 'description' | 'amount' | 'direction'>>,
  ): void {
    try {
      DatabaseConnector.getInstance().withTransaction(() => {
        this.db.runSync(
          'DELETE FROM statement_line_items WHERE accountId = ? AND statementMonth = ?',
          [accountId, statementMonth],
        );
        const now = new Date().toISOString();
        for (const item of items) {
          this.db.runSync(
            `INSERT INTO statement_line_items (profileId, accountId, statementMonth, date, description, amount, direction, createdAt)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [profileId, accountId, statementMonth, item.date, item.description ?? null, item.amount, item.direction, now],
          );
        }
      });
    } catch (error) {
      console.error('Error importing statement line items:', error);
      throw error;
    }
  }

  /**
   * The imported line items for one statement, each flagged with the local transaction it matches
   * (if any). Matching is computed fresh on every call rather than stored, so a transaction you add
   * later is picked up immediately without needing to re-import the statement.
   */
  getReconciliation(accountId: number, statementMonth: string): ReconciledLineItem[] {
    try {
      return this.db.getAllSync(
        `SELECT sli.*,
           (SELECT t.id FROM transactions t
            WHERE t.accountId = sli.accountId
              AND t.type = (CASE sli.direction WHEN 'debit' THEN 'expense' ELSE 'income' END)
              AND ABS(t.amount - sli.amount) < 0.005
              AND julianday(t.date) BETWEEN julianday(sli.date) - ? AND julianday(sli.date) + ?
            ORDER BY ABS(julianday(t.date) - julianday(sli.date))
            LIMIT 1) AS matchedTransactionId
         FROM statement_line_items sli
         WHERE sli.accountId = ? AND sli.statementMonth = ?
         ORDER BY sli.date`,
        [MATCH_DATE_TOLERANCE_DAYS, MATCH_DATE_TOLERANCE_DAYS, accountId, statementMonth],
      ) as ReconciledLineItem[];
    } catch (error) {
      console.error('Error reconciling statement line items:', error);
      return [];
    }
  }

  /** Every statement month imported for an account, most recent first - for a "past imports" list. */
  getImportedStatementMonths(accountId: number): string[] {
    try {
      const rows = this.db.getAllSync(
        'SELECT DISTINCT statementMonth FROM statement_line_items WHERE accountId = ? ORDER BY statementMonth DESC',
        [accountId],
      ) as Array<{ statementMonth: string }>;
      return rows.map((r) => r.statementMonth);
    } catch (error) {
      console.error('Error getting imported statement months:', error);
      return [];
    }
  }

  /** Removes an imported statement's line items, e.g. before re-importing a corrected PDF. */
  deleteStatement(accountId: number, statementMonth: string): void {
    try {
      this.db.runSync(
        'DELETE FROM statement_line_items WHERE accountId = ? AND statementMonth = ?',
        [accountId, statementMonth],
      );
    } catch (error) {
      console.error('Error deleting statement line items:', error);
      throw error;
    }
  }
}

export default StatementService;
