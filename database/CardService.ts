import DatabaseConnector from './DatabaseConnector';
import { CreditCard } from '../types';

/**
 * Service for the physical cards on a credit card account that shares its balance and limit
 * across more than one card, each with its own bill generation day. Most credit_card accounts
 * have none of these, and behave exactly as before using the account's own billDay/payAtMonthEnd.
 */
class CardService {
  private db: ReturnType<DatabaseConnector['getDatabase']>;

  constructor() {
    this.db = DatabaseConnector.getInstance().getDatabase();
  }

  /** Get the active cards on an account, in the order they were added. */
  getCardsForAccount(accountId: number): CreditCard[] {
    try {
      return this.db.getAllSync(
        'SELECT * FROM credit_cards WHERE accountId = ? AND isActive = 1 ORDER BY id',
        [accountId],
      ) as CreditCard[];
    } catch (error) {
      console.error('Error getting cards for account:', error);
      return [];
    }
  }

  /** Active cards for several accounts at once, grouped by accountId. */
  getCardsForAccounts(accountIds: number[]): Map<number, CreditCard[]> {
    const byAccount = new Map<number, CreditCard[]>();
    if (accountIds.length === 0) return byAccount;
    try {
      const placeholders = accountIds.map(() => '?').join(', ');
      const cards = this.db.getAllSync(
        `SELECT * FROM credit_cards WHERE accountId IN (${placeholders}) AND isActive = 1 ORDER BY id`,
        accountIds,
      ) as CreditCard[];
      cards.forEach((card) => {
        const list = byAccount.get(card.accountId) ?? [];
        list.push(card);
        byAccount.set(card.accountId, list);
      });
      return byAccount;
    } catch (error) {
      console.error('Error getting cards for accounts:', error);
      return byAccount;
    }
  }

  getCardById(id: number): CreditCard | null {
    try {
      return (this.db.getFirstSync('SELECT * FROM credit_cards WHERE id = ?', [id]) as CreditCard) || null;
    } catch (error) {
      console.error('Error getting card by id:', error);
      return null;
    }
  }

  addCard(card: Pick<CreditCard, 'accountId' | 'name' | 'billDay' | 'payAtMonthEnd'>): number {
    try {
      const now = new Date().toISOString();
      const result = this.db.runSync(
        `INSERT INTO credit_cards (accountId, name, billDay, payAtMonthEnd, isActive, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
        [card.accountId, card.name, card.billDay ?? null, card.payAtMonthEnd ? 1 : 0, now, now],
      );
      return result.lastInsertRowId;
    } catch (error) {
      console.error('Error adding card:', error);
      throw error;
    }
  }

  updateCard(id: number, updates: Partial<Pick<CreditCard, 'name' | 'billDay' | 'payAtMonthEnd'>>): void {
    try {
      const fields: string[] = [];
      const values: any[] = [];

      if (updates.name !== undefined) {
        fields.push('name = ?');
        values.push(updates.name);
      }
      if (updates.billDay !== undefined) {
        fields.push('billDay = ?');
        values.push(updates.billDay);
      }
      if (updates.payAtMonthEnd !== undefined) {
        fields.push('payAtMonthEnd = ?');
        values.push(updates.payAtMonthEnd ? 1 : 0);
      }

      fields.push('updatedAt = ?');
      values.push(new Date().toISOString());
      values.push(id);

      this.db.runSync(`UPDATE credit_cards SET ${fields.join(', ')} WHERE id = ?`, values);
    } catch (error) {
      console.error('Error updating card:', error);
      throw error;
    }
  }

  /** How many transactions are tagged to this specific card. */
  getTransactionCount(cardId: number): number {
    const row = this.db.getFirstSync('SELECT COUNT(*) as count FROM transactions WHERE cardId = ?', [cardId]) as { count: number } | null;
    return row?.count ?? 0;
  }

  /**
   * Permanently deletes a card. Transactions charged to it keep counting toward the shared
   * account balance; they just stop being tagged to this card (its bill line disappears from
   * "Needed this month", but the spending itself still shows up everywhere else).
   */
  deleteCard(id: number): void {
    try {
      DatabaseConnector.getInstance().withTransaction(() => {
        this.db.runSync('UPDATE transactions SET cardId = NULL WHERE cardId = ?', [id]);
        this.db.runSync('DELETE FROM credit_cards WHERE id = ?', [id]);
      });
    } catch (error) {
      console.error('Error deleting card:', error);
      throw error;
    }
  }
}

export default CardService;
