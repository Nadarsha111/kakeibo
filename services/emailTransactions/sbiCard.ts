import { emailBodyText, parseAlertAmount, parseAlertDate, type ExpenseAlert } from './expenseAlert';

export const SBI_CARD_SENDER = 'onlinesbicard@sbicard.com';

export function parseSbiCardExpense(body: string, mimeType: 'text/plain' | 'text/html'): ExpenseAlert | null {
  const text = emailBodyText(body, mimeType).replace(/\s+/g, ' ');
  const purchase = /(?:\bRs\.?|\bINR|₹)\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)\s+spent on your SBI Credit Card ending\s+(?:[x*•]+\s*)?(\d{4})\s+at\s+(.+?)\s+on\s+(\d{1,2})\/(\d{1,2})\/(\d{4}|\d{2})\b/i.exec(text);
  if (!purchase) return null;

  const [, amountText, lastFour, merchant, day, month, year] = purchase;
  const amount = parseAlertAmount(amountText);
  const date = parseAlertDate(day, Number(month), year);
  const payee = merchant.trim();
  if (amount === null || date === null || !payee) return null;

  return { provider: 'sbi', accountKind: 'credit_card', amount, date, lastFour, payee };
}
