import { emailBodyText, parseAlertAmount, parseAlertDate, type ExpenseAlert } from './expenseAlert';

export const SLICE_SENDER = 'noreply@slice.bank.in';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

/** Parses Slice's UPI card-spend and account-debit alerts. */
export function parseSliceExpense(body: string, mimeType: 'text/plain' | 'text/html'): ExpenseAlert | null {
  const text = emailBodyText(body, mimeType);

  const alert = /(?:₹|INR\s+)\s*(\d+(?:,\d+)*(?:\.\d{1,2})?)\s+(spent on your slice credit card|debited from your slice account)\s+(?:[x*•]+\s*)?(\d{4})\s+via\s+UPI\b/i.exec(text);
  const dateMatch = /\bTransaction date\s*:?\s*(\d{1,2})-([a-z]{3})-(\d{4}|\d{2})\b/i.exec(text);
  if (!alert || !dateMatch) return null;

  const details = text.slice(dateMatch.index + dateMatch[0].length);
  const payee = /^\s*To\b\s*:?\s*([^\n]+?)(?=\s+RRN\b|\n|$)/i.exec(details)?.[1].trim();
  if (!payee) return null;

  const amount = parseAlertAmount(alert[1]);
  const month = MONTHS.indexOf(dateMatch[2].toLowerCase()) + 1;
  const date = parseAlertDate(dateMatch[1], month, dateMatch[3]);
  if (amount === null || date === null) return null;

  return {
    provider: 'slice',
    amount,
    date,
    payee,
    lastFour: alert[3],
    accountKind: alert[2].toLowerCase().startsWith('spent') ? 'credit_card' : 'bank',
    reference: /\bRRN\s*:?\s*(\d{12})\b/i.exec(details)?.[1],
  };
}
