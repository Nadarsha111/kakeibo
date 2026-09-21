/**
 * Shared display formatters. Currency formatting that depends on the user's chosen
 * symbol/decimal places lives on `useSettings().formatCurrency` (context/SettingsContext.tsx)
 * since it needs that context; these are the plain, context-free date formatters that were
 * previously copy-pasted across screens.
 */

/** Device-locale date, e.g. "9/21/2026". */
export function formatDate(date: string | Date): string {
  return (typeof date === 'string' ? new Date(date) : date).toLocaleDateString();
}

/** Short date, e.g. "Sep 21, 2026". */
export function formatShortDate(date: string | Date): string {
  return (typeof date === 'string' ? new Date(date) : date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}
