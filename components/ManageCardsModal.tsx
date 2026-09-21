import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  Modal,
  ScrollView,
  Switch,
} from 'react-native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { getCardService } from '../database';
import { Account, CreditCard } from '../types';
import { useTheme } from '../context/ThemeContext';

interface ManageCardsModalProps {
  visible: boolean;
  account: Account | null;
  onClose: () => void;
  /** Called whenever a card is added, edited or deleted, so the account list can refresh. */
  onChanged: () => void;
}

const ordinalSuffix = (day: number) =>
  day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' } as Record<number, string>)[day % 10] ?? 'th';

/**
 * Manages the physical cards on a credit card account that shares its balance and credit limit
 * across more than one card, each generating its own bill on its own day of the month. An account
 * with no cards here behaves exactly as before, billed using its own settings.
 */
export default function ManageCardsModal({ visible, account, onClose, onChanged }: ManageCardsModalProps) {
  const { theme } = useTheme();
  const styles = createStyles(theme);

  const [cards, setCards] = useState<CreditCard[]>([]);
  const [editingCardId, setEditingCardId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [billDay, setBillDay] = useState('');
  const [payAtMonthEnd, setPayAtMonthEnd] = useState(false);

  const loadCards = () => {
    if (!account) return;
    setCards(getCardService().getCardsForAccount(account.id));
  };

  useEffect(() => {
    if (visible && account) {
      loadCards();
      resetForm();
    }
  }, [visible, account?.id]);

  const resetForm = () => {
    setEditingCardId(null);
    setShowForm(false);
    setName('');
    setBillDay('');
    setPayAtMonthEnd(false);
  };

  const startEdit = (card: CreditCard) => {
    setEditingCardId(card.id);
    setName(card.name);
    setBillDay(card.billDay ? String(card.billDay) : '');
    setPayAtMonthEnd(!!card.payAtMonthEnd);
    setShowForm(true);
  };

  const startAdd = () => {
    resetForm();
    setShowForm(true);
  };

  const handleSave = () => {
    if (!account) return;
    if (!name.trim()) {
      Alert.alert('Error', 'Please enter a name for the card, e.g. "Primary" or "Supplementary".');
      return;
    }
    if (billDay.trim() && !(Number.isInteger(Number(billDay)) && Number(billDay) >= 1 && Number(billDay) <= 31)) {
      Alert.alert('Error', 'Enter the bill day as a day of the month, from 1 to 31.');
      return;
    }

    try {
      const cardService = getCardService();
      const data = {
        name: name.trim(),
        billDay: billDay.trim() ? Number(billDay) : null,
        payAtMonthEnd,
      };
      if (editingCardId) {
        cardService.updateCard(editingCardId, data);
      } else {
        cardService.addCard({ accountId: account.id, ...data });
      }
      loadCards();
      onChanged();
      resetForm();
    } catch (error) {
      console.error('Error saving card:', error);
      Alert.alert('Error', 'Failed to save the card.');
    }
  };

  const handleDelete = (card: CreditCard) => {
    const transactionCount = getCardService().getTransactionCount(card.id);
    const message = transactionCount > 0
      ? `"${card.name}" has ${transactionCount} ${transactionCount === 1 ? 'transaction' : 'transactions'}. They will stay in your spending history but will no longer count toward this card's own bill.`
      : `Are you sure you want to delete "${card.name}"?`;

    Alert.alert('Delete Card', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          try {
            getCardService().deleteCard(card.id);
            if (editingCardId === card.id) resetForm();
            loadCards();
            onChanged();
          } catch (error) {
            console.error('Error deleting card:', error);
            Alert.alert('Error', 'Failed to delete the card.');
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.cancelButton}>
            <Text style={styles.cancelButtonText}>Done</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Cards</Text>
          <View style={styles.cancelButton} />
        </View>

        <ScrollView style={styles.content}>
          <Text style={styles.helperText}>
            {`${account?.name} pays from one shared balance and limit. Add its physical cards here if they generate separate bills on separate days; each card's own bill is worked out from what was charged to it specifically.`}
          </Text>

          {cards.length === 0 && !showForm && (
            <Text style={[styles.helperText, { marginTop: 16 }]}>
              No cards added yet. This account is billed using its own bill day, set when editing it.
            </Text>
          )}

          {cards.map((card) => (
            <View key={card.id} style={styles.cardRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardName}>{card.name}</Text>
                <Text style={styles.helperText}>
                  {card.billDay
                    ? `Bill on the ${card.billDay}${ordinalSuffix(card.billDay)} of each month${card.payAtMonthEnd ? ' · paid at month end' : ''}`
                    : card.payAtMonthEnd
                      ? 'Paid at month end'
                      : 'No bill day set'}
                </Text>
              </View>
              <TouchableOpacity style={styles.iconButton} onPress={() => startEdit(card)}>
                <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconButton} onPress={() => handleDelete(card)}>
                <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.error} />
              </TouchableOpacity>
            </View>
          ))}

          {showForm ? (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{editingCardId ? 'Edit Card' : 'New Card'}</Text>
              <TextInput
                style={styles.textInput}
                value={name}
                onChangeText={setName}
                placeholder="e.g., Primary, Supplementary"
                placeholderTextColor={theme.colors.textSecondary}
                autoFocus
              />
              <TextInput
                style={[styles.textInput, { marginTop: 12 }]}
                value={billDay}
                onChangeText={setBillDay}
                placeholder="Bill day of the month (optional), e.g., 22"
                keyboardType="number-pad"
                maxLength={2}
                placeholderTextColor={theme.colors.textSecondary}
              />
              <View style={[styles.switchRow, { marginTop: 16 }]}>
                <Text style={styles.sectionTitle}>I pay this at month end</Text>
                <Switch
                  value={payAtMonthEnd}
                  onValueChange={setPayAtMonthEnd}
                  trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                />
              </View>
              <View style={styles.formActions}>
                <TouchableOpacity style={styles.secondaryButton} onPress={resetForm}>
                  <Text style={styles.secondaryButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.primaryButton} onPress={handleSave}>
                  <Text style={styles.primaryButtonText}>{editingCardId ? 'Save' : 'Add'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity style={styles.addButton} onPress={startAdd}>
              <MaterialCommunityIcons name="plus" size={18} color={theme.colors.primary} />
              <Text style={styles.addButtonText}>Add Card</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const createStyles = (theme: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    cancelButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      minWidth: 60,
    },
    cancelButtonText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontWeight: '600',
    },
    headerTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: theme.colors.text,
    },
    content: {
      flex: 1,
      paddingHorizontal: 16,
      paddingTop: 16,
    },
    helperText: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      fontStyle: 'italic',
    },
    cardRow: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      marginTop: 12,
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    cardName: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 4,
    },
    iconButton: {
      padding: 8,
      marginLeft: 4,
    },
    section: {
      marginTop: 24,
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: theme.colors.text,
      marginBottom: 12,
    },
    textInput: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 16,
      borderWidth: 1,
      borderColor: theme.colors.border,
      color: theme.colors.text,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    formActions: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 20,
    },
    secondaryButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: theme.colors.border,
    },
    secondaryButtonText: {
      color: theme.colors.textSecondary,
      fontSize: 15,
      fontWeight: '600',
    },
    primaryButton: {
      flex: 1,
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
    },
    primaryButtonText: {
      color: 'white',
      fontSize: 15,
      fontWeight: '600',
    },
    addButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingVertical: 14,
      marginTop: 16,
      marginBottom: 24,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: theme.colors.primary,
      borderStyle: 'dashed',
    },
    addButtonText: {
      color: theme.colors.primary,
      fontSize: 15,
      fontWeight: '600',
    },
  });
