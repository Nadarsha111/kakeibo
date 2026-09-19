import DatabaseConnector from './DatabaseConnector';
import AccountService from './AccountService';
import TransactionService from './TransactionService';
import { Account, RecurringItem } from '../types';
import { FREQUENCIES, advanceDueDate, countDue, endOfMonth, monthlyEquivalent, nextBillDate } from '../utils/recurring';
import { interestDue, isValidDate, round2 } from '../utils/loanMath';

export interface MonthlyEmi {
  id: number;
  name: string;
  amount: number;
  nextDueDate: string | null;
}

export interface MonthlySummary {
  /** Recurring expenses, each converted to what it comes to in an average month. */
  recurringExpenses: number;
  /** Monthly installments on money you borrowed and are still paying back. */
  loanEmis: number;
  /** Everything you have to pay every month: recurring expenses plus loan installments. */
  totalLiability: number;
  /** Money moved into savings or investment accounts on a schedule, per average month. Not spending, so not part of the liability. */
  regularSavings: number;
  recurringIncome: number;
  /** Recurring income minus the monthly liability and the regular savings. */
  leftAfterCommitments: number;
  emis: MonthlyEmi[];
}

export interface NeededLine {
  key: string;
  label: string;
  amount: number;
  /** The first date it falls due (in the past when it is overdue). */
  dueDate: string;
  overdue: boolean;
  kind: 'bill' | 'savings' | 'loan' | 'card';
}

export interface NeededSummary {
  monthEnd: string;
  /** Everything still to pay by the end of the month, overdue included. */
  total: number;
  /** Money you have in cash, bank and savings accounts right now. */
  available: number;
  /** Available minus total; negative means you are short. */
  leftOver: number;
  /** What a whole month of commitments comes to: monthly liability plus regular savings. */
  monthlyCommitments: number;
  /** Recurring income falling due by the end of the month. Not counted in leftOver. */
  expectedIncome: number;
  lines: NeededLine[];
}

type NewRecurringItem = Pick<
  RecurringItem,
  'profileId' | 'name' | 'amount' | 'type' | 'category' | 'frequency' | 'nextDueDate' | 'accountId' | 'toAccountId'
> & { autoPost?: boolean };

// Automatic posting records at most this many payments per item in one go; anything further back
// is picked up the next time it runs. Roughly a year of a daily item.
const MAX_CATCH_UP = 400;

/**
 * Recurring items: rent, subscriptions, insurance, salary, or money moved into an FD on a
 * schedule. By default they are commitments you keep track of and mark paid. An item can be set to
 * post itself, in which case its payments are recorded whenever the app runs after they fall due.
 */
class RecurringService {
  private db: ReturnType<DatabaseConnector['getDatabase']>;
  private accountService: AccountService;
  private transactionService: TransactionService;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
    this.accountService = new AccountService();
    this.transactionService = new TransactionService();
  }

  getItems(profileId?: number): RecurringItem[] {
    try {
      let query = 'SELECT * FROM recurring_items WHERE isActive = 1';
      const params: any[] = [];
      if (profileId) {
        query += ' AND profileId = ?';
        params.push(profileId);
      }
      query += ' ORDER BY nextDueDate, name';
      return this.db.getAllSync(query, params) as RecurringItem[];
    } catch (error) {
      console.error('Error getting recurring items:', error);
      return [];
    }
  }

  getItemById(id: number): RecurringItem | null {
    try {
      return (this.db.getFirstSync('SELECT * FROM recurring_items WHERE id = ? AND isActive = 1', [id]) as RecurringItem) || null;
    } catch (error) {
      console.error('Error getting recurring item:', error);
      return null;
    }
  }

  /** An account that can take a payment: it exists, is not a loan, and belongs to the same profile. */
  private accountFor(id: number | null | undefined, profileId: number, what: string): Account {
    const account = id ? this.accountService.getAccountById(id) : null;
    if (!account || account.type === 'loan' || account.profileId !== profileId) {
      throw new Error(`Choose ${what} from this profile (a bank, cash, savings, investment or card account).`);
    }
    return account;
  }

  /** Checks a complete item and returns it in the shape that is stored. */
  private validate(item: NewRecurringItem): NewRecurringItem & { autoPost: boolean } {
    if (!item.name.trim()) throw new Error('Enter a name.');
    if (!(item.amount > 0)) throw new Error('Enter an amount greater than zero.');
    if (!isValidDate(item.nextDueDate)) throw new Error('Enter the due date as YYYY-MM-DD.');
    if (!FREQUENCIES.some((f) => f.value === item.frequency)) throw new Error('Choose how often it repeats.');

    const isTransfer = item.type === 'transfer';
    if (!isTransfer && !item.category.trim()) throw new Error('Choose a category.');

    if (item.accountId) this.accountFor(item.accountId, item.profileId, 'an account');
    if (isTransfer) {
      this.accountFor(item.accountId, item.profileId, 'the account the money leaves');
      this.accountFor(item.toAccountId, item.profileId, 'the account the money goes into');
      if (item.accountId === item.toAccountId) throw new Error('The money has to move between two different accounts.');
    }

    const autoPost = !!item.autoPost;
    if (autoPost && !item.accountId) throw new Error('Choose the account to record it on, or turn off automatic posting.');

    return {
      ...item,
      name: item.name.trim(),
      category: isTransfer ? 'Transfer' : item.category.trim(),
      toAccountId: isTransfer ? item.toAccountId : null,
      autoPost,
    };
  }

  addItem(item: NewRecurringItem): number {
    const v = this.validate(item);
    const now = new Date().toISOString();
    const result = this.db.runSync(
      `INSERT INTO recurring_items (profileId, name, amount, type, category, frequency, dueDay, nextDueDate, accountId, toAccountId, autoPost, isActive, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        v.profileId,
        v.name,
        v.amount,
        v.type,
        v.category,
        v.frequency,
        parseInt(v.nextDueDate.slice(8), 10),
        v.nextDueDate,
        v.accountId ?? null,
        v.toAccountId ?? null,
        v.autoPost ? 1 : 0,
        now,
        now,
      ],
    );
    return result.lastInsertRowId;
  }

  updateItem(id: number, changes: Partial<Omit<NewRecurringItem, 'profileId'>>): void {
    const existing = this.getItemById(id);
    if (!existing) throw new Error('This recurring item no longer exists.');

    const v = this.validate({
      profileId: existing.profileId,
      name: existing.name,
      amount: existing.amount,
      type: existing.type,
      category: existing.category,
      frequency: existing.frequency,
      nextDueDate: existing.nextDueDate,
      accountId: existing.accountId,
      toAccountId: existing.toAccountId,
      autoPost: !!existing.autoPost,
      ...changes,
    });

    this.db.runSync(
      `UPDATE recurring_items SET name = ?, amount = ?, type = ?, category = ?, frequency = ?, dueDay = ?, nextDueDate = ?,
         accountId = ?, toAccountId = ?, autoPost = ?, updatedAt = ? WHERE id = ?`,
      [
        v.name,
        v.amount,
        v.type,
        v.category,
        v.frequency,
        parseInt(v.nextDueDate.slice(8), 10),
        v.nextDueDate,
        v.accountId ?? null,
        v.toAccountId ?? null,
        v.autoPost ? 1 : 0,
        new Date().toISOString(),
        id,
      ],
    );
  }

  deleteItem(id: number): void {
    this.db.runSync('DELETE FROM recurring_items WHERE id = ?', [id]);
  }

  /**
   * Records one payment of an item: an expense or income on the account, or a transfer from it to
   * the item's other account. Does not touch the due date. Only call this inside a DB transaction.
   */
  private recordOccurrence(item: RecurringItem, accountId: number | null | undefined, amount: number, date: string): void {
    const account = this.accountFor(accountId, item.profileId, 'an account');

    if (item.type === 'transfer') {
      const destination = this.accountFor(item.toAccountId, item.profileId, 'the account the money goes into');
      this.transactionService.addTransferUnsafe({
        fromAccountId: account.id,
        toAccountId: destination.id,
        amount,
        date,
        description: item.name,
        profileId: item.profileId,
      });
      return;
    }

    this.transactionService.addTransactionUnsafe({
      profileId: item.profileId,
      amount,
      type: item.type,
      category: item.category,
      description: item.name,
      date,
      paymentMethod: account.type === 'credit_card' ? 'credit_card' : account.type === 'cash' ? 'cash' : 'debit_card',
      accountId: account.id,
    });
  }

  /**
   * Marks the current due date as paid: records it on the chosen account and moves the due date
   * forward one period. With no account, only the due date moves (for something handled before the
   * app was used). Marking again catches up one more period, so an item that is several periods
   * behind can be brought up to date. Nothing is saved if any part fails.
   */
  markPaid(id: number, payment: { accountId: number | null; amount?: number; date: string }): RecurringItem {
    return DatabaseConnector.getInstance().withTransaction(() => {
      const item = this.getItemById(id);
      if (!item) throw new Error('This recurring item no longer exists.');

      const amount = payment.amount ?? item.amount;
      if (!(amount > 0)) throw new Error('Enter an amount greater than zero.');

      if (payment.accountId != null) {
        if (!isValidDate(payment.date)) throw new Error('Enter the date as YYYY-MM-DD.');
        this.recordOccurrence(item, payment.accountId, amount, payment.date);
      }

      this.db.runSync('UPDATE recurring_items SET nextDueDate = ?, lastPaidDate = ?, updatedAt = ? WHERE id = ?', [
        advanceDueDate(item.nextDueDate, item.frequency, item.dueDay),
        payment.accountId != null ? payment.date : (item.lastPaidDate ?? null),
        new Date().toISOString(),
        id,
      ]);
      return this.getItemById(id)!;
    });
  }

  /**
   * Records every payment that has fallen due (on or before `today`) for items set to post
   * themselves, each dated on the day it was due, and moves their due dates past today. An item
   * whose accounts are missing or invalid is skipped and left untouched; the others carry on.
   * Running it again straight away does nothing. Returns how many payments were recorded.
   */
  postDue(today: string = new Date().toISOString().split('T')[0]): number {
    let posted = 0;

    this.getItems()
      .filter((item) => item.autoPost && item.nextDueDate <= today)
      .forEach((item) => {
        try {
          posted += DatabaseConnector.getInstance().withTransaction(() => {
            let next = item.nextDueDate;
            let last = item.lastPaidDate ?? null;
            let count = 0;

            while (next <= today && count < MAX_CATCH_UP) {
              this.recordOccurrence(item, item.accountId, item.amount, next);
              last = next;
              next = advanceDueDate(next, item.frequency, item.dueDay);
              count++;
            }

            this.db.runSync('UPDATE recurring_items SET nextDueDate = ?, lastPaidDate = ?, updatedAt = ? WHERE id = ?', [
              next,
              last,
              new Date().toISOString(),
              item.id,
            ]);
            return count;
          });
        } catch (error) {
          console.error(`Could not post "${item.name}" automatically:`, error);
        }
      });

    return posted;
  }

  /**
   * How much money is needed from today to the end of the month. Every occurrence still to come
   * counts (a weekly bill due twice counts twice, a daily deposit counts once per remaining day),
   * as does anything overdue. Installment loans count their installments; money borrowed with no
   * installments counts in full when its return date is by month end. A credit card with a bill
   * day counts what is owed on it when that day falls by month end. It is compared with what is in
   * cash, bank and savings accounts.
   */
  getNeededThisMonth(profileId?: number, today: string = new Date().toISOString().split('T')[0]): NeededSummary {
    const monthEnd = endOfMonth(today);
    const lines: NeededLine[] = [];
    let expectedIncome = 0;

    this.getItems(profileId).forEach((item) => {
      const occurrences = countDue(item.nextDueDate, monthEnd, item.frequency, item.dueDay, MAX_CATCH_UP);
      if (occurrences === 0) return;
      const amount = round2(occurrences * item.amount);
      if (item.type === 'income') {
        expectedIncome += amount;
        return;
      }
      lines.push({
        key: `item-${item.id}`,
        label: item.name,
        amount,
        dueDate: item.nextDueDate,
        overdue: item.nextDueDate < today,
        kind: item.type === 'transfer' ? 'savings' : 'bill',
      });
    });

    let loanQuery = `SELECT id, name, loanPrincipal, loanReturnedAmount, loanInterestRate, loanTermMonths, loanInstallmentAmount,
        loanPaymentDay, loanNextDueDate, loanExpectedReturnDate FROM accounts
      WHERE type = 'loan' AND isActive = 1 AND (isLending IS NULL OR isLending = 0) AND loanStatus != 'fully_paid'`;
    const loanParams: any[] = [];
    if (profileId) {
      loanQuery += ' AND profileId = ?';
      loanParams.push(profileId);
    }

    (this.db.getAllSync(loanQuery, loanParams) as any[]).forEach((loan) => {
      const outstanding = round2((loan.loanPrincipal || 0) - (loan.loanReturnedAmount || 0));
      if (outstanding <= 0) return;

      if (loan.loanTermMonths && loan.loanInstallmentAmount > 0) {
        if (!loan.loanNextDueDate) return;
        const installments = countDue(loan.loanNextDueDate, monthEnd, 'monthly', loan.loanPaymentDay, MAX_CATCH_UP);
        if (installments === 0) return;
        // The last installments cannot come to more than what is left to pay off
        const payoff = round2(outstanding + interestDue(outstanding, loan.loanInterestRate || 0));
        lines.push({
          key: `loan-${loan.id}`,
          label: loan.name,
          amount: Math.min(round2(installments * loan.loanInstallmentAmount), payoff),
          dueDate: loan.loanNextDueDate,
          overdue: loan.loanNextDueDate < today,
          kind: 'loan',
        });
      } else if (loan.loanExpectedReturnDate && loan.loanExpectedReturnDate <= monthEnd) {
        lines.push({
          key: `loan-${loan.id}`,
          label: loan.name,
          amount: outstanding,
          dueDate: loan.loanExpectedReturnDate,
          overdue: loan.loanExpectedReturnDate < today,
          kind: 'loan',
        });
      }
    });

    // A credit card with a bill day and something owed is a bill: what is owed now, due on that day.
    // A bill day already past this month means the next bill falls next month, so it is not needed yet.
    let cardQuery = `SELECT id, name, balance, billDay FROM accounts
      WHERE type = 'credit_card' AND isActive = 1 AND billDay IS NOT NULL AND balance < 0`;
    const cardParams: any[] = [];
    if (profileId) {
      cardQuery += ' AND profileId = ?';
      cardParams.push(profileId);
    }

    (this.db.getAllSync(cardQuery, cardParams) as any[]).forEach((card) => {
      const dueDate = nextBillDate(card.billDay, today);
      if (dueDate > monthEnd) return;
      lines.push({
        key: `card-${card.id}`,
        label: `${card.name} bill`,
        amount: round2(-card.balance),
        dueDate,
        overdue: false,
        kind: 'card',
      });
    });

    // Overdue first, then by date, then the biggest
    lines.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.dueDate.localeCompare(b.dueDate) || b.amount - a.amount);

    let availableQuery = "SELECT COALESCE(SUM(balance), 0) as total FROM accounts WHERE isActive = 1 AND type IN ('cash', 'checking', 'savings')";
    const availableParams: any[] = [];
    if (profileId) {
      availableQuery += ' AND profileId = ?';
      availableParams.push(profileId);
    }
    const available = round2((this.db.getFirstSync(availableQuery, availableParams) as { total: number }).total);

    const total = round2(lines.reduce((sum, line) => sum + line.amount, 0));
    const monthly = this.getMonthlySummary(profileId);

    return {
      monthEnd,
      total,
      available,
      leftOver: round2(available - total),
      monthlyCommitments: round2(monthly.totalLiability + monthly.regularSavings),
      expectedIncome: round2(expectedIncome),
      lines,
    };
  }

  getMonthlySummary(profileId?: number): MonthlySummary {
    const items = this.getItems(profileId);
    const sumMonthly = (type: RecurringItem['type']) =>
      round2(items.filter((i) => i.type === type).reduce((total, i) => total + monthlyEquivalent(i.amount, i.frequency), 0));

    let emiQuery = `SELECT id, name, loanInstallmentAmount as amount, loanNextDueDate as nextDueDate FROM accounts
      WHERE type = 'loan' AND isActive = 1 AND (isLending IS NULL OR isLending = 0)
        AND loanTermMonths IS NOT NULL AND loanInstallmentAmount > 0 AND loanStatus != 'fully_paid'`;
    const params: any[] = [];
    if (profileId) {
      emiQuery += ' AND profileId = ?';
      params.push(profileId);
    }
    emiQuery += ' ORDER BY loanNextDueDate';
    const emis = this.db.getAllSync(emiQuery, params) as MonthlyEmi[];

    const recurringExpenses = sumMonthly('expense');
    const recurringIncome = sumMonthly('income');
    const regularSavings = sumMonthly('transfer');
    const loanEmis = round2(emis.reduce((total, e) => total + e.amount, 0));
    const totalLiability = round2(recurringExpenses + loanEmis);

    return {
      recurringExpenses,
      loanEmis,
      totalLiability,
      regularSavings,
      recurringIncome,
      leftAfterCommitments: round2(recurringIncome - totalLiability - regularSavings),
      emis,
    };
  }
}

export default RecurringService;
