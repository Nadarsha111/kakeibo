import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import AddTransactionScreen from '../../components/AddTransactionScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';

export default function TabLayout() {
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: theme.colors.primary,
            tabBarInactiveTintColor: theme.colors.textSecondary,
            headerShown: false,
            tabBarStyle: {
              backgroundColor: theme.colors.surface,
              borderTopColor: theme.colors.border,
              borderTopWidth: 1,
            },
            tabBarLabelStyle: {
              fontWeight: '600',
              fontSize: 12,
              marginBottom: 4,
            },
          }}
        >
          <Tabs.Screen
            name="index"
            options={{
              title: 'Overview',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="chart-donut" color={color} />,
              tabBarButton: ({ children, onPress, style }) => (
                <TouchableOpacity onPress={onPress} style={style} activeOpacity={1}>
                  {children}
                </TouchableOpacity>
              ),
            }}
          />
          <Tabs.Screen
            name="transactions"
            options={{
              title: 'Transactions',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="clipboard-list-outline" color={color} />,
              tabBarButton: ({ children, onPress, style }) => (
                <TouchableOpacity onPress={onPress} style={style} activeOpacity={1}>
                  {children}
                </TouchableOpacity>
              ),
            }}
          />
          <Tabs.Screen
            name="accounts"
            options={{
              title: 'Accounts',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="bank-outline" color={color} />,
              tabBarButton: ({ children, onPress, style }) => (
                <TouchableOpacity onPress={onPress} style={style} activeOpacity={1}>
                  {children}
                </TouchableOpacity>
              ),
            }}
          />
          <Tabs.Screen
            name="manage"
            options={{
              title: 'Manage',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="account-settings-outline" color={color} />,
              tabBarButton: ({ children, onPress, style }) => (
                <TouchableOpacity onPress={onPress} style={style} activeOpacity={1}>
                  {children}
                </TouchableOpacity>
              ),
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="cog-outline" color={color} />,
              tabBarButton: ({ children, onPress, style }) => (
                <TouchableOpacity onPress={onPress} style={style} activeOpacity={1}>
                  {children}
                </TouchableOpacity>
              ),
            }}
          />
          <Tabs.Screen
            name="budget"
            options={{
              title: 'Budget',
              href: null
            }}
          />
        </Tabs>
        <TouchableOpacity
          style={[
            styles.fab, 
            { 
              backgroundColor: theme.colors.primary,
              bottom: 55 + insets.bottom 
            }
          ]}
          onPress={() => setShowAddTransaction(true)}
        >
          <MaterialCommunityIcons name="plus" size={32} color="white" />
        </TouchableOpacity>
        <AddTransactionScreen
          visible={showAddTransaction}
          onClose={() => setShowAddTransaction(false)}
          onTransactionAdded={() => {}}
        />
      </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 14,
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
});

