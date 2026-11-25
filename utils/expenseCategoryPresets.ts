export const EXPENSE_CATEGORY_PRESETS = [
  { name: 'Food & dining', color: '#fb9a36', glyph: 'pizza', emoji: '🍕' },
  { name: 'Transport', color: '#a78bfa', glyph: 'car-outline', emoji: '🚗' },
  { name: 'Bills & recharges', color: '#ad7aff', glyph: 'receipt', emoji: '🧾' },
  { name: 'Transfers', color: '#a3e635', glyph: 'swap-horizontal-circle-outline', emoji: '🔄' },
  { name: 'Medical', color: '#5eead4', glyph: 'pill', emoji: '💊' },
  { name: 'Travel', color: '#38bdf8', glyph: 'airplane', emoji: '✈️' },
  { name: 'Repayments', color: '#67e8f9', glyph: 'cash-refund', emoji: '💸' },
  { name: 'Personal', color: '#f472d0', glyph: 'heart-outline', emoji: '💗' },
  { name: 'Services', color: '#a5b5c6', glyph: 'briefcase-outline', emoji: '💼' },
  { name: 'Insurance', color: '#fbbf24', glyph: 'umbrella-outline', emoji: '☂️' },
  { name: 'Entertainment', color: '#fb7185', glyph: 'television-classic', emoji: '📺' },
  { name: 'Gaming', color: '#d98af5', glyph: 'gamepad-variant-outline', emoji: '🎮' },
  { name: 'Small shops', color: '#a5a5ff', glyph: 'storefront-outline', emoji: '🏪' },
  { name: 'Rent', color: '#fb923c', glyph: 'home-outline', emoji: '🏠' },
  { name: 'Logistics', color: '#fbbf24', glyph: 'package-variant-closed', emoji: '📦' },
  { name: 'Subscription', color: '#ff748b', glyph: 'play-box-outline', emoji: '▶️' },
  { name: 'Investment', color: '#6ee7a1', glyph: 'sprout-outline', emoji: '🌱' },
  { name: 'Fitness', color: '#5cdb94', glyph: 'run', emoji: '🏃' },
  { name: 'Pet', color: '#38bdf8', glyph: 'bone', emoji: '🐾' },
  { name: 'Miscellaneous', color: '#a6be88', glyph: 'shape-outline', emoji: '🧩' },
] as const;

export function expensePresetIndex(name: string): number {
  const normalized = name.toLowerCase().replace(/ \(expense\)$/, '');
  const index = EXPENSE_CATEGORY_PRESETS.findIndex((preset) => preset.name.toLowerCase() === normalized);
  return index < 0 ? EXPENSE_CATEGORY_PRESETS.length : index;
}
