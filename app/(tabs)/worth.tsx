import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Alert,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { router } from 'expo-router';
import { getAccountService, getProfileService, getRecurringService, type MonthlySummary } from '../../database';
import { NetWorthItem, NetWorthSummary, Profile, RecurringItem } from '../../types';
import { useTheme } from '../../context/ThemeContext';
import { useSettings } from '../../context/SettingsContext';
import { useTabBarInset } from '../../components/PebbleTabBar';
import RecurringItemModal from '../../components/RecurringItemModal';
import MarkPaidModal from '../../components/MarkPaidModal';
import { FREQUENCIES, dueStatus, daysBetween, monthlyEquivalent } from '../../utils/recurring';

const RED = '#ef4444';
const GREEN = '#10b981';
const AMBER = '#f59e0b';

const TYPE_LABELS: Record<string, string> = {
  cash: 'Cash',
  checking: 'Checking',
  savings: 'Savings',
  credit_card: 'Credit card',
  investment: 'Investment',
};

export default function WorthScreen() {
  const tabInset = useTabBarInset();
  const { theme } = useTheme();
  const { formatCurrency, selectedProfileId } = useSettings();
  const styles = createStyles(theme);

  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [items, setItems] = useState<RecurringItem[]>([]);
  const [monthly, setMonthly] = useState<MonthlySummary | null>(null);
  const [worth, setWorth] = useState<NetWorthSummary | null>(null);
  const [accountNames, setAccountNames] = useState<Record<number, string>>({});
  const [refreshing, setRefreshing] = useState(false);

  const [selectedItemId, setSelectedItemId] = useState<number | null>(null);
  const [editing, setEditing] = useState<RecurringItem | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [paying, setPaying] = useState<RecurringItem | null>(null);

  const profileId = selectedProfileId === 'all' ? undefined : selectedProfileId;
  const today = new Date().toISOString().split('T')[0];

  const load = useCallback(() => {
    try {
      const recurring = getRecurringService();
      recurring.postDue(); // items set to record themselves, if any have fallen due since last time
      setAccountNames(Object.fromEntries(getAccountService().getAccounts().map((a) => [a.id, a.name])));
      setItems(recurring.getItems(profileId));
      setMonthly(recurring.getMonthlySummary(profileId));
      setWorth(getAccountService().getNetWorthSummary(profileId));
    } catch (error) {
      console.error('Error loading assets and liabilities:', error);
    }
  }, [profileId]);

  useFocusEffect(
    useCallback(() => {
      setProfiles(getProfileService().getProfiles());
      load();
    }, [load]),
  );

  const onRefresh = () => {
    setRefreshing(true);
    load();
    setRefreshing(false);
  };

  const profileName =
    selectedProfileId === 'all' ? 'All profiles' : (profiles.find((p) => p.id === selectedProfileId)?.name ?? '');
  // New items go to the selected profile, or the first one when every profile is showing
  const addProfileId = profileId ?? profiles[0]?.id;

  const openForm = (item: RecurringItem | null) => {
    setEditing(item);
    setShowForm(true);
  };

  const confirmDelete = (item: RecurringItem) => {
    Alert.alert('Delete', `Stop tracking "${item.name}"? Transactions you already recorded stay.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          getRecurringService().deleteItem(item.id);
          setSelectedItemId(null);
          load();
        },
      },
    ]);
  };

  /** "Overdue by 3 days", "Due today", "Due in 5 days", or nothing when it is further off. */
  const dueBadge = (date: string) => {
    const days = daysBetween(today, date);
    const plural = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`;
    switch (dueStatus(date, today)) {
      case 'overdue':
        return { text: `Overdue by ${plural(-days)}`, color: RED };
      case 'soon':
        return { text: days === 0 ? 'Due today' : `Due in ${plural(days)}`, color: AMBER };
      default:
        return null;
    }
  };

  const renderRecurring = (item: RecurringItem) => {
    const isSelected = selectedItemId === item.id;
    const badge = dueBadge(item.nextDueDate);
    const frequency = FREQUENCIES.find((f) => f.value === item.frequency)?.label ?? item.frequency;
    const income = item.type === 'income';
    const transfer = item.type === 'transfer';
    const route = transfer ? ` · ${accountNames[item.accountId ?? -1] ?? '?'} → ${accountNames[item.toAccountId ?? -1] ?? '?'}` : ` · ${item.category}`;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.card}
        onPress={() => setSelectedItemId(isSelected ? null : item.id)}
        activeOpacity={0.9}
      >
        <View style={styles.cardTop}>
          <View style={styles.cardText}>
            <Text style={styles.cardTitle} numberOfLines={1}>{item.name}</Text>
            <Text style={styles.cardSubtitle} numberOfLines={1}>
              {frequency}{route} · due {new Date(item.nextDueDate).toLocaleDateString()}{item.autoPost ? ' · Auto' : ''}
            </Text>
          </View>
          <View style={styles.cardAmountBox}>
            <Text style={[styles.cardAmount, { color: income ? GREEN : transfer ? theme.colors.primary : theme.colors.text }]}>{formatCurrency(item.amount)}</Text>
            {item.frequency !== 'monthly' && (
              <Text style={styles.cardSubtitle}>≈ {formatCurrency(monthlyEquivalent(item.amount, item.frequency))} / month</Text>
            )}
          </View>
        </View>
        {badge && <Text style={[styles.badge, { color: badge.color }]}>{badge.text}</Text>}

        {isSelected && (
          <View style={styles.cardActions}>
            <TouchableOpacity style={styles.actionButton} onPress={() => confirmDelete(item)}>
              <MaterialCommunityIcons name="delete-outline" size={20} color={theme.colors.error} />
              <Text style={[styles.actionText, { color: theme.colors.error }]}>Delete</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => openForm(item)}>
              <MaterialCommunityIcons name="pencil-outline" size={20} color={theme.colors.primary} />
              <Text style={[styles.actionText, { color: theme.colors.primary }]}>Edit</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionButton} onPress={() => setPaying(item)}>
              <MaterialCommunityIcons name="check-circle-outline" size={20} color={theme.colors.primary} />
              <Text style={[styles.actionText, { color: theme.colors.primary }]}>{income ? 'Mark Received' : transfer ? 'Mark Saved' : 'Mark Paid'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const renderWorthRow = (item: NetWorthItem, owned: boolean) => (
    <View key={`${item.type}-${item.id}`} style={styles.listRow}>
      <View style={styles.cardText}>
        <Text style={styles.listName} numberOfLines={1}>{item.name}</Text>
        <Text style={styles.cardSubtitle}>
          {item.type === 'loan' ? (owned ? 'Money lent' : 'Borrowed') : (TYPE_LABELS[item.type] ?? item.type)}
        </Text>
      </View>
      <Text style={[styles.listAmount, { color: owned ? GREEN : RED }]}>{formatCurrency(item.amount)}</Text>
    </View>
  );

  const left = monthly?.leftAfterCommitments ?? 0;

  return (
    <View style={styles.container}>
      <StatusBar barStyle={theme.isDark ? 'light-content' : 'dark-content'} />

      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <MaterialCommunityIcons name="arrow-left" size={24} color={theme.colors.text} />
        </TouchableOpacity>
        <View>
          <Text style={styles.headerTitle}>Assets & Liabilities</Text>
          <Text style={styles.headerSubtitle}>{profileName}</Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: tabInset }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} colors={[theme.colors.primary]} />
        }
      >
        {/* Net worth */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Net worth</Text>
          <Text style={[styles.summaryAmount, { color: (worth?.netWorth ?? 0) < 0 ? RED : theme.colors.text }]}>
            {formatCurrency(worth?.netWorth ?? 0)}
          </Text>
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Assets</Text>
              <Text style={[styles.statValue, { color: GREEN }]}>{formatCurrency(worth?.totalAssets ?? 0)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Liabilities</Text>
              <Text style={[styles.statValue, { color: RED }]}>{formatCurrency(worth?.totalLiabilities ?? 0)}</Text>
            </View>
          </View>
        </View>

        {/* Monthly liability */}
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Monthly liability</Text>
          <Text style={[styles.summaryAmount, { color: RED }]}>{formatCurrency(monthly?.totalLiability ?? 0)}</Text>
          <Text style={styles.cardSubtitle}>what you have to pay every month</Text>

          <View style={styles.breakdown}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Recurring bills</Text>
              <Text style={styles.breakdownValue}>{formatCurrency(monthly?.recurringExpenses ?? 0)}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Loan installments</Text>
              <Text style={styles.breakdownValue}>{formatCurrency(monthly?.loanEmis ?? 0)}</Text>
            </View>
            {(monthly?.regularSavings ?? 0) > 0 && (
              <View style={styles.breakdownRow}>
                <Text style={styles.breakdownLabel}>Regular savings (not a liability)</Text>
                <Text style={[styles.breakdownValue, { color: theme.colors.primary }]}>{formatCurrency(monthly?.regularSavings ?? 0)}</Text>
              </View>
            )}
            {(monthly?.recurringIncome ?? 0) > 0 && (
              <>
                <View style={styles.divider} />
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Recurring income</Text>
                  <Text style={[styles.breakdownValue, { color: GREEN }]}>{formatCurrency(monthly?.recurringIncome ?? 0)}</Text>
                </View>
                <View style={styles.breakdownRow}>
                  <Text style={styles.breakdownLabel}>Left after commitments</Text>
                  <Text style={[styles.breakdownValue, { color: left < 0 ? RED : GREEN }]}>{formatCurrency(left)}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        {/* Recurring */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recurring</Text>
          <TouchableOpacity style={styles.addButton} onPress={() => openForm(null)} disabled={!addProfileId}>
            <Text style={styles.addButtonText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        {items.length === 0 ? (
          <Text style={styles.emptyText}>
            Add your rent, subscriptions, insurance, and regular deposits like an FD, to see what you owe and set aside every month.
          </Text>
        ) : (
          items.map(renderRecurring)
        )}

        {/* Loan installments (managed on the Accounts tab) */}
        {(monthly?.emis.length ?? 0) > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Loan installments</Text>
            </View>
            {monthly!.emis.map((emi) => {
              const badge = emi.nextDueDate ? dueBadge(emi.nextDueDate) : null;
              return (
                <View key={emi.id} style={styles.card}>
                  <View style={styles.cardTop}>
                    <View style={styles.cardText}>
                      <Text style={styles.cardTitle} numberOfLines={1}>{emi.name}</Text>
                      <Text style={styles.cardSubtitle}>
                        Monthly{emi.nextDueDate ? ` · due ${new Date(emi.nextDueDate).toLocaleDateString()}` : ''} · manage on the Accounts tab
                      </Text>
                    </View>
                    <Text style={styles.cardAmount}>{formatCurrency(emi.amount)}</Text>
                  </View>
                  {badge && <Text style={[styles.badge, { color: badge.color }]}>{badge.text}</Text>}
                </View>
              );
            })}
          </>
        )}

        {/* Assets */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Assets</Text>
          <Text style={[styles.sectionTotal, { color: GREEN }]}>{formatCurrency(worth?.totalAssets ?? 0)}</Text>
        </View>
        <View style={styles.listCard}>
          {(worth?.assets.length ?? 0) === 0 ? (
            <Text style={styles.emptyText}>Nothing yet.</Text>
          ) : (
            worth!.assets.map((item) => renderWorthRow(item, true))
          )}
        </View>

        {/* Liabilities */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Liabilities</Text>
          <Text style={[styles.sectionTotal, { color: RED }]}>{formatCurrency(worth?.totalLiabilities ?? 0)}</Text>
        </View>
        <View style={styles.listCard}>
          {(worth?.liabilities.length ?? 0) === 0 ? (
            <Text style={styles.emptyText}>Nothing owed.</Text>
          ) : (
            worth!.liabilities.map((item) => renderWorthRow(item, false))
          )}
        </View>
      </ScrollView>

      <RecurringItemModal
        visible={showForm}
        item={editing}
        profileId={addProfileId}
        onClose={() => setShowForm(false)}
        onSaved={load}
      />
      <MarkPaidModal visible={paying !== null} item={paying} onClose={() => setPaying(null)} onSaved={load} />
    </View>
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
      gap: 12,
      paddingHorizontal: 16,
      paddingTop: 40,
      paddingBottom: 16,
      backgroundColor: theme.colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: theme.colors.border,
    },
    backButton: {
      padding: 4,
    },
    headerTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    headerSubtitle: {
      fontSize: 13,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    content: {
      paddingHorizontal: 20,
    },
    summaryCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 16,
      padding: 20,
      marginTop: 16,
      alignItems: 'center',
    },
    summaryLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      marginBottom: 4,
    },
    summaryAmount: {
      fontSize: 30,
      fontWeight: 'bold',
      color: theme.colors.text,
    },
    statsRow: {
      flexDirection: 'row',
      alignSelf: 'stretch',
      marginTop: 16,
    },
    stat: {
      flex: 1,
      alignItems: 'center',
    },
    statLabel: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginBottom: 4,
    },
    statValue: {
      fontSize: 16,
      fontWeight: '600',
    },
    breakdown: {
      alignSelf: 'stretch',
      marginTop: 16,
    },
    breakdownRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 6,
    },
    breakdownLabel: {
      fontSize: 14,
      color: theme.colors.textSecondary,
    },
    breakdownValue: {
      fontSize: 14,
      fontWeight: '600',
      color: theme.colors.text,
    },
    divider: {
      height: 1,
      backgroundColor: theme.colors.border,
      marginVertical: 6,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 24,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: theme.colors.text,
    },
    sectionTotal: {
      fontSize: 16,
      fontWeight: '600',
    },
    addButton: {
      backgroundColor: theme.colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 16,
    },
    addButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 14,
    },
    emptyText: {
      fontSize: 14,
      color: theme.colors.textSecondary,
      paddingVertical: 8,
    },
    card: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      padding: 16,
      marginBottom: 10,
    },
    cardTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 12,
    },
    cardText: {
      flex: 1,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: theme.colors.text,
    },
    cardSubtitle: {
      fontSize: 12,
      color: theme.colors.textSecondary,
      marginTop: 2,
    },
    cardAmountBox: {
      alignItems: 'flex-end',
    },
    cardAmount: {
      fontSize: 16,
      fontWeight: '700',
      color: theme.colors.text,
    },
    badge: {
      fontSize: 12,
      fontWeight: '600',
      marginTop: 8,
    },
    cardActions: {
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: theme.colors.border,
      flexDirection: 'row',
      justifyContent: 'flex-end',
      flexWrap: 'wrap',
      gap: 8,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: theme.colors.background,
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 20,
    },
    actionText: {
      marginLeft: 6,
      fontSize: 14,
      fontWeight: '600',
    },
    listCard: {
      backgroundColor: theme.colors.surface,
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 6,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 10,
    },
    listName: {
      fontSize: 15,
      color: theme.colors.text,
    },
    listAmount: {
      fontSize: 15,
      fontWeight: '600',
    },
  });
