import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useTheme } from '../context/ThemeContext';
import type { Category } from '../types';
import { tint } from '../utils/categoryIcon';
import { EXPENSE_CATEGORY_PRESETS, expenseCategoryLabel, expensePresetIndex } from '../utils/expenseCategoryPresets';

interface Props {
  categories: Category[];
  selected: string | null;
  onSelect: (name: string | null) => void;
  disclosure?: { limit: number; expanded: boolean; toggle: () => void };
}

export default function CategoryPicker({ categories, selected, onSelect, disclosure }: Props) {
  const { theme } = useTheme();
  const styles = createStyles(theme);
  const canExpand = disclosure && categories.length > disclosure.limit + 1;
  let visible = categories;
  if (canExpand && !disclosure.expanded) {
    visible = categories.slice(0, disclosure.limit);
    const current = categories.find(({ name }) => name === selected);
    if (current && !visible.includes(current)) visible[visible.length - 1] = current;
  }

  return (
    <View style={styles.container}>
      <View style={styles.heading}>
        <Text style={styles.title}>Category</Text>
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Reset category selection"
          disabled={!selected}
          hitSlop={6}
          onPress={() => onSelect(null)}
        >
          <Text style={[styles.control, !selected && styles.disabled]}>Reset</Text>
        </TouchableOpacity>
      </View>
      {categories.length ? (
        <View style={styles.chips}>
          {visible.map((category) => {
            const preset = category.type === 'expense' ? EXPENSE_CATEGORY_PRESETS[expensePresetIndex(category.name)] : undefined;
            const usePresetIcon = preset && category.icon === preset.emoji;
            const color = category.color;
            const active = category.name === selected;
            const label = category.type === 'expense' ? expenseCategoryLabel(category.name) : category.name;
            const accent = theme.isDark ? color : theme.colors.text;

            return (
              <TouchableOpacity
                key={category.id}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                style={[styles.chip, active && { backgroundColor: tint(color, 0.23), borderColor: tint(color, 0.55) }]}
                onPress={() => onSelect(category.name)}
              >
                {usePresetIcon ? <MaterialCommunityIcons name={preset.glyph} color={color} size={15} /> : (
                  <Text style={styles.emoji}>{category.icon}</Text>
                )}
                <Text style={[styles.chipText, active && { color: accent }]}>{label}</Text>
              </TouchableOpacity>
            );
          })}
          {canExpand && (
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityState={{ expanded: disclosure.expanded }}
              style={styles.chip}
              onPress={disclosure.toggle}
            >
              <Text style={styles.control}>{disclosure.expanded ? 'Fewer categories' : `+${categories.length - visible.length} more`}</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <Text style={styles.empty}>Add a category to continue.</Text>
      )}
    </View>
  );
}

const createStyles = (theme: ReturnType<typeof useTheme>['theme']) => StyleSheet.create({
  container: { gap: 9 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  control: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  disabled: { color: theme.colors.textSecondary, opacity: 0.6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.colors.border,
    borderRadius: 999,
    minHeight: 36,
    maxWidth: '100%',
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  chipText: { flexShrink: 1, color: theme.colors.text, fontSize: 13, fontWeight: '600' },
  emoji: { fontSize: 13 },
  empty: { fontSize: 14, color: theme.colors.textSecondary },
});
