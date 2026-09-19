/**
 * Pure helpers for installment loans: reducing-balance interest (annual rate charged monthly on
 * the outstanding principal) and month-based due dates. Dates are YYYY-MM-DD strings.
 */

export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Fixed monthly payment that clears `principal` over `months` at `annualRatePercent`. */
export function monthlyPayment(principal: number, annualRatePercent: number, months: number): number {
  const monthlyRate = annualRatePercent / 1200;
  if (monthlyRate === 0) return round2(principal / months);
  return round2((principal * monthlyRate) / (1 - Math.pow(1 + monthlyRate, -months)));
}

/** Interest charged for one month on the given outstanding principal. */
export function interestDue(outstanding: number, annualRatePercent: number): number {
  return round2((outstanding * annualRatePercent) / 1200);
}

/** Approximate interest over the whole term when every payment is the fixed monthly amount. */
export function totalInterest(principal: number, payment: number, months: number): number {
  return Math.max(0, round2(payment * months - principal));
}

export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
}

/**
 * Moves a date forward by whole months, keeping the intended day of the month. A day that does
 * not exist in the target month (e.g. the 31st) falls back to that month's last day.
 */
export function addMonths(date: string, months: number, day: number = parseInt(date.slice(8), 10)): string {
  const [year, month] = date.split('-').map(Number);
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const daysInMonth = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(day, daysInMonth))}`;
}
