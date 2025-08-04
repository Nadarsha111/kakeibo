import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import AddTransactionScreen from '../../components/AddTransactionScreen';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

export default function TabLayout() {
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const insets = useSafeAreaInsets();

  return (
      <View style={{ flex: 1 }}>
        <Tabs
          screenOptions={{
            tabBarActiveTintColor: '#2563eb',
            tabBarInactiveTintColor: '#64748b',
            headerShown: false,
            tabBarStyle: {
              backgroundColor: '#fff',
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
            }}
          />
          <Tabs.Screen
            name="transactions"
            options={{
              title: 'Transactions',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="clipboard-list-outline" color={color} />,
            }}
          />
          <Tabs.Screen
            name="budget"
            options={{
              title: 'Budget',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="calendar-month-outline" color={color} />,
            }}
          />
          <Tabs.Screen
            name="categories"
            options={{
              title: 'Categories',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="shape-outline" color={color} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="cog-outline" color={color} />,
            }}
          />
        </Tabs>
        <TouchableOpacity
          style={[styles.fab, { bottom: 55 + insets.bottom }]}
          onPress={() => setShowAddTransaction(true)}
        >
          <MaterialCommunityIcons name="plus" size={32} color="#fff" />
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
    backgroundColor: '#14b8a6',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
  },
});

