/**
 * Icons for categories the app records by itself, which have no row of their own in the
 * categories table and so no icon stored with them.
 */
const BUILT_IN_ICONS: Record<string, string> = {
  'Loan Interest': '🏦',
  'Transfer In': '⇄',
  'Transfer Out': '⇄',
};

/**
 * The icon to show for a category: the one saved with it (see ManageCategoriesModal), else a
 * built-in one, else a generic icon for its type.
 */
export function categoryIcon(name: string, savedIcon?: string | null, type?: 'income' | 'expense' | string): string {
  if (savedIcon) return savedIcon;
  return BUILT_IN_ICONS[name] ?? (type === 'income' ? '💰' : '🏷️');
}

/** A category colour at low opacity, for the soft background behind its icon. */
export function tint(color: string | undefined, alpha = 0.16): string | undefined {
  if (!color || !/^#[0-9a-f]{6}$/i.test(color)) return undefined;
  return `${color}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`;
}
