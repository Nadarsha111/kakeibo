import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

export interface ChipOption<K extends string | number | null> {
  key: K;
  label: string;
}

interface ChipSelectProps<K extends string | number | null> {
  options: Array<ChipOption<K>>;
  selected: K;
  onSelect: (key: K) => void;
}

/** A wrapping row of pill buttons where exactly one is selected. */
export default function ChipSelect<K extends string | number | null>({ options, selected, onSelect }: ChipSelectProps<K>) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  return (
    <View style={styles.row}>
      {options.map((option) => {
        const active = option.key === selected;
        return (
          <TouchableOpacity
            key={String(option.key)}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onSelect(option.key)}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    row: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      backgroundColor: theme.colors.surface,
      borderRadius: 20,
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    chipActive: {
      backgroundColor: theme.colors.primary,
      borderColor: theme.colors.primary,
    },
    chipText: {
      fontSize: 14,
      color: theme.colors.text,
    },
    chipTextActive: {
      color: 'white',
      fontWeight: '600',
    },
  });
