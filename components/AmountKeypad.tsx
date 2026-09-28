import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';

const OPERATORS = ['+', '−'];

/**
 * Works out an amount typed as a sum like "120+45.5−20". A trailing operator or decimal point is
 * ignored, so a half-typed expression still has a value. Returns NaN when nothing has been typed.
 */
export function evaluateAmount(expression: string): number {
  const parts = expression.replace(/[+−]$/, '').split(/([+−])/).filter(Boolean);
  if (parts.length === 0) return NaN;
  let total = 0;
  let sign = 1;
  for (const part of parts) {
    if (part === '+') sign = 1;
    else if (part === '−') sign = -1;
    else total += sign * (parseFloat(part) || 0);
  }
  return Math.round(total * 100) / 100;
}

/** True once the expression holds a real sum rather than a single number. */
export function hasOperator(expression: string): boolean {
  return /\d[+−]\d/.test(expression);
}

/** Applies one keypad press to the expression, refusing input that would make it malformed. */
function applyKey(expression: string, key: string): string {
  const last = expression.slice(-1);
  const currentNumber = expression.split(/[+−]/).pop() ?? '';

  if (key === '⌫') return expression.slice(0, -1);
  if (key === '=') {
    const result = evaluateAmount(expression);
    return isNaN(result) ? '' : String(result);
  }
  if (OPERATORS.includes(key)) {
    if (expression === '') return expression;
    // Pressing a second operator swaps the first rather than stacking them.
    return OPERATORS.includes(last) ? expression.slice(0, -1) + key : expression + key;
  }
  if (key === '.') {
    if (currentNumber.includes('.')) return expression;
    return expression + (currentNumber === '' ? '0.' : '.');
  }
  // Digits: at most two decimal places, and no leading zeros like "007".
  const decimals = currentNumber.split('.')[1];
  if (decimals !== undefined && decimals.length >= 2) return expression;
  if (currentNumber === '0') return expression.slice(0, -1) + key;
  return expression + key;
}

const ROWS = [
  ['7', '8', '9', '⌫'],
  ['4', '5', '6', '−'],
  ['1', '2', '3', '+'],
  ['.', '0', '=', 'Done'],
];

interface AmountKeypadProps {
  value: string;
  onChange: (value: string) => void;
  onDone: () => void;
}

/** A calculator-style number pad for entering an amount, with + and − for quick sums. */
export default function AmountKeypad({ value, onChange, onDone }: AmountKeypadProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const press = (key: string) => {
    if (key === 'Done') {
      const result = evaluateAmount(value);
      onChange(hasOperator(value) && !isNaN(result) ? String(result) : value);
      onDone();
      return;
    }
    onChange(applyKey(value, key));
  };

  return (
    <View style={styles.pad}>
      {ROWS.map((row, i) => (
        <View key={i} style={styles.row}>
          {row.map((key) => {
            const isAction = key === 'Done';
            const isOperator = OPERATORS.includes(key) || key === '=' || key === '⌫';
            return (
              <TouchableOpacity
                key={key}
                style={[styles.key, isOperator && styles.operatorKey, isAction && styles.doneKey]}
                onPress={() => press(key)}
                onLongPress={key === '⌫' ? () => onChange('') : undefined}
              >
                <Text
                  style={[
                    styles.keyText,
                    isOperator && styles.operatorText,
                    isAction && styles.doneText,
                  ]}
                >
                  {key}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    pad: {
      backgroundColor: theme.colors.surface,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      padding: 6,
      paddingBottom: 12,
    },
    row: {
      flexDirection: 'row',
    },
    key: {
      flex: 1,
      margin: 4,
      height: 50,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.background,
    },
    operatorKey: {
      backgroundColor: theme.colors.border,
    },
    doneKey: {
      backgroundColor: theme.colors.primary,
    },
    keyText: {
      fontSize: 22,
      fontWeight: '500',
      color: theme.colors.text,
    },
    operatorText: {
      color: theme.colors.primary,
      fontWeight: '700',
    },
    doneText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
  });
