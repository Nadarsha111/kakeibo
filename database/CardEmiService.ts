import DatabaseConnector from './DatabaseConnector';
import TransactionService from './TransactionService';
import { CardEmi } from '../types';
import { addMonths, interestDue, monthlyPayment, round2 } from '../utils/loanMath';

// Advancing a very old, unopened EMI catches up at most this many installments in one go; anything
// further back is picked up the next time the app runs. Roughly two years of monthly installments.
const MAX_CATCH_UP = 24;

/**
 * A purchase on a credit card converted to fixed monthly installments. There is no separate
 * payment action, the way there is for a loan: an EMI is paid simply by paying the card's own
 * bill, which already includes it, so its schedule instead advances by itself once its due date
 * has passed (see advanceDueEmis), the same way an auto-posting recurring item does.
 */
class CardEmiService {
  private db: ReturnType<DatabaseConnector['getDatabase']>;
  private transactionService: TransactionService;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
    this.transactionService = new TransactionService();
  }

  /** Active EMIs on an account, regardless of which of its cards (if any) they were charged to. */
  getEmisForAccount(accountId: number): CardEmi[] {
    try {
      return this.db.getAllSync(
        "SELECT * FROM card_emis WHERE accountId = ? AND isActive = 1 AND status != 'fully_paid' ORDER BY nextDueDate",
        [accountId],
      ) as CardEmi[];
    } catch (error) {
      console.error('Error getting card EMIs for account:', error);
      return [];
    }
  }

  /**
   * Records a purchase converted to EMI: an expense transaction for the full amount, so the
   * shared balance reflects it immediately like any other charge, plus the installment plan that
   * determines how much of it is billed each month instead of all at once.
   */
  addEmi(data: {
    accountId: number;
    cardId?: number | null;
    profileId: number;
    name: string;
    category: string;
    principal: number;
    interestRate?: number;
    termMonths: number;
    installmentAmount?: number;
    firstDueDate: string;
    date?: string;
  }): number {
    if (!(data.principal > 0)) throw new Error('Enter a valid purchase amount.');
    if (!Number.isInteger(data.termMonths) || data.termMonths < 1) throw new Error('Enter the term as a whole number of months.');

    try {
      return DatabaseConnector.getInstance().withTransaction(() => {
        const installmentAmount = data.installmentAmount && data.installmentAmount > 0
          ? round2(data.installmentAmount)
          : monthlyPayment(data.principal, data.interestRate || 0, data.termMonths);
        const paymentDay = parseInt(data.firstDueDate.slice(8), 10);
        const now = new Date().toISOString();

        this.transactionService.addTransactionUnsafe({
          profileId: data.profileId,
          amount: data.principal,
          type: 'expense',
          category: data.category,
          description: `${data.name} (EMI)`,
          date: data.date || now.split('T')[0],
          paymentMethod: 'credit_card',
          accountId: data.accountId,
          cardId: data.cardId ?? null,
        });

        const result = this.db.runSync(
          `INSERT INTO card_emis (accountId, cardId, name, principal, returnedAmount, interestRate, termMonths, installmentAmount, paymentDay, nextDueDate, interestPaid, status, isActive, createdAt, updatedAt)
           VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, 0, 'active', 1, ?, ?)`,
          [
            data.accountId,
            data.cardId ?? null,
            data.name,
            data.principal,
            data.interestRate ?? 0,
            data.termMonths,
            installmentAmount,
            paymentDay,
            data.firstDueDate,
            now,
            now,
          ],
        );
        return result.lastInsertRowId;
      });
    } catch (error) {
      console.error('Error adding card EMI:', error);
      throw error;
    }
  }

  /**
   * Moves every active EMI whose bill has already gone out forward to its next unbilled
   * installment, the same way an auto-posting recurring item catches up: each due date behind
   * today counts as billed and paid, up to MAX_CATCH_UP at a time.
   */
  advanceDueEmis(): void {
    try {
      const today = new Date().toISOString().split('T')[0];
      const dueEmis = this.db.getAllSync(
        "SELECT * FROM card_emis WHERE status = 'active' AND isActive = 1 AND nextDueDate IS NOT NULL AND nextDueDate <= ?",
        [today],
      ) as CardEmi[];

      dueEmis.forEach((emi) => {
        let outstanding = round2((emi.principal || 0) - (emi.returnedAmount || 0));
        let returnedAmount = emi.returnedAmount || 0;
        let interestPaid = emi.interestPaid || 0;
        let nextDueDate = emi.nextDueDate as string;
        let iterations = 0;

        while (nextDueDate <= today && outstanding > 0.005 && iterations < MAX_CATCH_UP) {
          const interest = interestDue(outstanding, emi.interestRate || 0);
          // Clamped at 0: an installment set too low to cover its own interest should never let
          // the outstanding principal grow, just pay it off more slowly than planned.
          const principalPortion = Math.max(0, Math.min(outstanding, round2(emi.installmentAmount - interest)));
          returnedAmount = round2(returnedAmount + principalPortion);
          interestPaid = round2(interestPaid + interest);
          outstanding = round2((emi.principal || 0) - returnedAmount);
          nextDueDate = addMonths(nextDueDate, 1, emi.paymentDay || undefined);
          iterations++;
        }

        const fullyPaid = outstanding <= 0.005;
        this.db.runSync(
          `UPDATE card_emis SET returnedAmount = ?, interestPaid = ?, nextDueDate = ?, status = ?, updatedAt = ? WHERE id = ?`,
          [returnedAmount, interestPaid, fullyPaid ? null : nextDueDate, fullyPaid ? 'fully_paid' : 'active', new Date().toISOString(), emi.id],
        );
      });
    } catch (error) {
      console.error('Error advancing card EMIs:', error);
    }
  }

  /** Permanently removes an EMI plan. The purchase transaction itself is untouched. */
  deleteEmi(id: number): void {
    try {
      this.db.runSync('DELETE FROM card_emis WHERE id = ?', [id]);
    } catch (error) {
      console.error('Error deleting card EMI:', error);
      throw error;
    }
  }
}

export default CardEmiService;
