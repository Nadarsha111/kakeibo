import { addMonths, round2 } from './loanMath';

/**
 * Pure helpers for recurring items (rent, subscriptions, salary...). Dates are YYYY-MM-DD strings.
 */

export type RecurringFrequency = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

export const FREQUENCIES: Array<{ value: RecurringFrequency; label: string; monthsPerPeriod: number | null }> = [
  { value: 'daily', label: 'Daily', monthsPerPeriod: null },
  { value: 'weekly', label: 'Weekly', monthsPerPeriod: null },
  { value: 'monthly', label: 'Monthly', monthsPerPeriod: 1 },
  { value: 'quarterly', label: 'Quarterly', monthsPerPeriod: 3 },
  { value: 'yearly', label: 'Yearly', monthsPerPeriod: 12 },
];

/** What an amount that repeats at this frequency comes to in an average month. */
export function monthlyEquivalent(amount: number, frequency: RecurringFrequency): number {
  switch (frequency) {
    case 'daily':
      return round2((amount * 365) / 12);
    case 'weekly':
      return round2((amount * 52) / 12);
    case 'quarterly':
      return round2(amount / 3);
    case 'yearly':
      return round2(amount / 12);
    default:
      return round2(amount);
  }
}

const DAY_MS = 24 * 60 * 60 * 1000;

const toUtcMs = (date: string) => {
  const [year, month, day] = date.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
};

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/**
 * The due date after `date`. Monthly, quarterly and yearly items keep their day of the month
 * (`dueDay`), falling back to the month's last day when it is shorter, so a bill due on the 31st
 * returns to the 31st after February instead of drifting to the 28th.
 */
export function advanceDueDate(date: string, frequency: RecurringFrequency, dueDay?: number | null): string {
  if (frequency === 'daily' || frequency === 'weekly') {
    const next = new Date(toUtcMs(date) + (frequency === 'daily' ? 1 : 7) * DAY_MS);
    return next.toISOString().split('T')[0];
  }
  const months = FREQUENCIES.find((f) => f.value === frequency)?.monthsPerPeriod ?? 1;
  return addMonths(date, months, dueDay || undefined);
}

export type DueStatus = 'overdue' | 'soon' | 'later';

/** Overdue once the date has passed, "soon" within `soonDays` days (today included). */
export function dueStatus(nextDueDate: string, today: string, soonDays = 7): DueStatus {
  const days = daysBetween(today, nextDueDate);
  if (days < 0) return 'overdue';
  return days <= soonDays ? 'soon' : 'later';
}

/**
 * How many payments have come due by `today`, counting the one on `nextDueDate` itself. This is
 * what automatic posting would record right away. Counting stops at `limit` so a date far in the
 * past cannot loop for long.
 */
export function countDue(
  nextDueDate: string,
  today: string,
  frequency: RecurringFrequency,
  dueDay?: number | null,
  limit = 1000,
): number {
  let count = 0;
  let date = nextDueDate;
  while (date <= today && count < limit) {
    count++;
    date = advanceDueDate(date, frequency, dueDay);
  }
  return count;
}

/** The last day of the month that `date` falls in. */
export function endOfMonth(date: string): string {
  const [year, month] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month, 0)).toISOString().split('T')[0];
}

/** "2026-09-25" -> "25 Sep", read as a plain calendar date so the time zone cannot shift it. */
export function formatDay(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}
