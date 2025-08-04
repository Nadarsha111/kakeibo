import FontAwesome from '@expo/vector-icons/FontAwesome';
import { useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';

import { Tabs } from 'expo-router';
import AddTransactionScreen from '../../components/AddTransactionScreen';

export default function TabLayout() {
  const [showAddTransaction, setShowAddTransaction] = useState(false);

  return (
    <View style={{ flex: 1 }}>
      <Tabs screenOptions={{ tabBarActiveTintColor: '#2563eb' }}>
        <Tabs.Screen
          name="index"
          options={{
            title: 'Overview',
            tabBarIcon: ({ color }) => <FontAwesome size={28} name="pie-chart" color={color} />,
          }}
        />
        <Tabs.Screen
          name="transactions"
          options={{
            title: 'Transactions',
            tabBarIcon: ({ color }) => <FontAwesome size={28} name="list-alt" color={color} />,
          }}
        />
        <Tabs.Screen
          name="budget"
          options={{
            title: 'Budget',
            tabBarIcon: ({ color }) => <FontAwesome size={28} name="calendar" color={color} />,
          }}
        />
        <Tabs.Screen
          name="categories"
          options={{
            title: 'Categories',
            tabBarIcon: ({ color }) => <FontAwesome size={28} name="th-list" color={color} />,
          }}
        />
        <Tabs.Screen
          name="settings"
          options={{
            title: 'Settings',
            tabBarIcon: ({ color }) => <FontAwesome size={28} name="cog" color={color} />,
          }}
        />
      </Tabs>
      <TouchableOpacity
        style={styles.fab}
        onPress={() => setShowAddTransaction(true)}
      >
        <FontAwesome name="plus" size={28} color="#fff" />
      </TouchableOpacity>
      <AddTransactionScreen
        visible={showAddTransaction}
        onClose={() => setShowAddTransaction(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
});

