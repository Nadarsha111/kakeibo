import DatabaseConnector from './DatabaseConnector';
import { ReconciledLineItem, StatementLineItem } from '../types';

// A statement line and a locally logged transaction are treated as the same real-world spend when
// they share an account, the same type (debit -> expense, credit -> income), the same amount, and
// a date within this many days of each other - a bank sometimes posts a transaction a day or two
// after you actually made it, so requiring an exact date match would miss real matches.
const MATCH_DATE_TOLERANCE_DAYS = 2;
// A logged amount that differs from the statement by up to this much (3%, but at least ₹1) is
// offered as a possible match - e.g. a rounded entry, a fee, or a foreign-currency conversion.
const NEAR_AMOUNT_TOLERANCE_RATIO = 0.03;
const NEAR_AMOUNT_MIN_TOLERANCE = 1;

/** Whole days since the epoch for a "YYYY-MM-DD..." date, ignoring any time part. */
function dayNumber(date: string): number {
  return Math.floor(Date.parse(date.slice(0, 10) + 'T00:00:00Z') / 86400000);
}

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
   *
   * Matching is one-to-one: a logged transaction can account for at most one statement line, so two
   * identical charges on the statement need two logged transactions to both show as matched. Exact
   * amount matches are assigned first; the lines left over can then pick up a "possible match" - an
   * unused transaction whose amount is close but not equal (rounding, a fee, currency conversion).
   * Possible matches are only suggestions: the line still counts as unmatched.
   */
  getReconciliation(accountId: number, statementMonth: string): ReconciledLineItem[] {
    try {
      const lineItems = this.db.getAllSync(
        'SELECT * FROM statement_line_items WHERE accountId = ? AND statementMonth = ? ORDER BY date, id',
        [accountId, statementMonth],
      ) as StatementLineItem[];
      if (lineItems.length === 0) return [];

      const dates = lineItems.map((i) => i.date.slice(0, 10)).sort();
      const transactions = this.db.getAllSync(
        `SELECT id, type, amount, date FROM transactions
         WHERE accountId = ? AND type IN ('expense', 'income')
           AND julianday(date) BETWEEN julianday(?) - ? AND julianday(?) + ? + 1`,
        [accountId, dates[0], MATCH_DATE_TOLERANCE_DAYS, dates[dates.length - 1], MATCH_DATE_TOLERANCE_DAYS],
      ) as Array<{ id: number; type: string; amount: number; date: string }>;

      type Candidate = { lineId: number; txId: number; txAmount: number; dayDiff: number; amountDiff: number };
      const exact: Candidate[] = [];
      const near: Candidate[] = [];
      for (const item of lineItems) {
        const wantedType = item.direction === 'debit' ? 'expense' : 'income';
        const tolerance = Math.max(NEAR_AMOUNT_MIN_TOLERANCE, item.amount * NEAR_AMOUNT_TOLERANCE_RATIO);
        for (const t of transactions) {
          if (t.type !== wantedType) continue;
          const dayDiff = Math.abs(dayNumber(t.date) - dayNumber(item.date));
          if (dayDiff > MATCH_DATE_TOLERANCE_DAYS) continue;
          const amountDiff = Math.abs(t.amount - item.amount);
          const candidate = { lineId: item.id, txId: t.id, txAmount: t.amount, dayDiff, amountDiff };
          if (amountDiff < 0.005) exact.push(candidate);
          else if (amountDiff <= tolerance) near.push(candidate);
        }
      }

      // Greedy assignment, closest first, each line and each transaction used at most once.
      const usedTx = new Set<number>();
      const matched = new Map<number, number>();
      const possible = new Map<number, Candidate>();
      exact.sort((a, b) => a.dayDiff - b.dayDiff || a.lineId - b.lineId || a.txId - b.txId);
      for (const c of exact) {
        if (matched.has(c.lineId) || usedTx.has(c.txId)) continue;
        matched.set(c.lineId, c.txId);
        usedTx.add(c.txId);
      }
      near.sort((a, b) => a.amountDiff - b.amountDiff || a.dayDiff - b.dayDiff || a.lineId - b.lineId || a.txId - b.txId);
      for (const c of near) {
        if (matched.has(c.lineId) || possible.has(c.lineId) || usedTx.has(c.txId)) continue;
        possible.set(c.lineId, c);
        usedTx.add(c.txId);
      }

      return lineItems.map((item) => ({
        ...item,
        matchedTransactionId: matched.get(item.id) ?? null,
        possibleMatchTransactionId: possible.get(item.id)?.txId ?? null,
        possibleMatchAmount: possible.get(item.id)?.txAmount ?? null,
      }));
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
