import { emailBodyText, parseAlertAmount, parseAlertDate, type ExpenseAlert } from './expenseAlert';

export const SBI_CARD_SENDER = 'onlinesbicard@sbicard.com';
export const SBI_CARD_DOMAIN = 'sbicard.com';

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

export function parseSbiCardEmi(body: string, mimeType: 'text/plain' | 'text/html'): ExpenseAlert | null {
  const text = emailBodyText(body, mimeType).replace(/\s+/g, ' ');
  if (!/\bbooking the SBI Card Merchant EMI facility\b/i.test(text)) return null;

  const amountText = /\bTransaction Amount\s*:\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)(?=\s|$)/i.exec(text)?.[1];
  const principalText = /\bBooking Amount\s*:\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)(?=\s|$)/i.exec(text)?.[1];
  const installmentText = /\bEMI Amount\s*:\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)(?=\s|$)/i.exec(text)?.[1];
  const transactionDate = /\bTransaction Date(?:\s*\(DD\/MM\/YYYY\)+)?\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i.exec(text);
  const firstEmiDate = /\bFirst EMI Date(?:\s*\(DD\/MM\/YYYY\)+)?\s*:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})\b/i.exec(text);
  const rate = /\bRate of Interest\s*:\s*(\d+(?:\.\d+)?)\s*%/i.exec(text)?.[1];
  const tenure = /\bTenure\s*:\s*(\d+)\s*months?\b/i.exec(text)?.[1];
  if (!amountText || !principalText || !installmentText || !transactionDate || !firstEmiDate || !rate || !tenure) return null;

  const amount = parseAlertAmount(amountText);
  const principal = parseAlertAmount(principalText);
  const installmentAmount = parseAlertAmount(installmentText);
  const date = parseAlertDate(transactionDate[1], Number(transactionDate[2]), transactionDate[3]);
  const firstDueDate = parseAlertDate(firstEmiDate[1], Number(firstEmiDate[2]), firstEmiDate[3]);
  const interestRate = Number(rate);
  const termMonths = Number(tenure);
  if (!amount || !principal || principal > amount || !installmentAmount || !date || !firstDueDate || firstDueDate < date ||
      interestRate > 100 || termMonths < 1 || termMonths > 600) return null;

  const fee = /\bProcessing Fee(?:\s*\([^)]*\))?\s*:\s*(?:Rs\.?|INR|₹)\s*([\d,]+(?:\.\d{1,2})?)(?=\s|$)/i.exec(text)?.[1];
  const processingFee = fee === undefined ? undefined : Number(fee.replace(/,/g, ''));
  return {
    provider: 'sbi', accountKind: 'credit_card', amount, date, payee: 'SBI Card Merchant EMI',
    emi: { principal, interestRate, termMonths, installmentAmount, firstDueDate, processingFee },
  };
}
