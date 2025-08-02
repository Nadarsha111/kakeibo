import React, { useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import OverviewScreen from '../screens/OverviewScreen';
import TransactionsScreen from '../screens/TransactionsScreen';
import BudgetScreen from '../screens/BudgetScreen';
import CategoriesScreen from '../screens/CategoriesScreen';
import AddTransactionScreen from '../screens/AddTransactionScreen';

const Tab = createBottomTabNavigator();

// Simple icon component
const TabIcon = ({ name, color }: { name: string; color: string }) => (
  <View style={styles.iconContainer}>
    <Text style={[styles.iconText, { color }]}>
      {name === 'Overview' ? '📊' : 
       name === 'Transactions' ? '📝' :
       name === 'Budget' ? '⏰' : '📋'}
    </Text>
  </View>
);

export default function AppNavigator() {
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const handleTransactionAdded = () => {
    setRefreshKey(prev => prev + 1);
  };

  return (
    <NavigationContainer>
      <View style={styles.container}>
        <Tab.Navigator
          screenOptions={{
            tabBarActiveTintColor: '#14b8a6',
            tabBarInactiveTintColor: '#6b7280',
            tabBarStyle: {
              backgroundColor: '#ffffff',
              borderTopColor: '#e5e7eb',
              height: 60,
              paddingBottom: 8,
              paddingTop: 8,
            },
            headerStyle: {
              backgroundColor: '#14b8a6',
            },
            headerTintColor: '#ffffff',
            headerTitleStyle: {
              fontWeight: 'bold',
            },
          }}
        >
          <Tab.Screen
            name="Overview"
            options={{
              tabBarIcon: ({ color }) => <TabIcon name="Overview" color={color} />,
            }}
          >
            {() => <OverviewScreen key={refreshKey} />}
          </Tab.Screen>
          <Tab.Screen
            name="Transactions"
            options={{
              tabBarIcon: ({ color }) => <TabIcon name="Transactions" color={color} />,
            }}
          >
            {() => <TransactionsScreen key={refreshKey} />}
          </Tab.Screen>
          <Tab.Screen
            name="Budget"
            options={{
              tabBarIcon: ({ color }) => <TabIcon name="Budget" color={color} />,
            }}
          >
            {() => <BudgetScreen key={refreshKey} />}
          </Tab.Screen>
          <Tab.Screen
            name="Categories"
            options={{
              tabBarIcon: ({ color }) => <TabIcon name="Categories" color={color} />,
            }}
          >
            {() => <CategoriesScreen key={refreshKey} />}
          </Tab.Screen>
        </Tab.Navigator>

        {/* Floating Action Button */}
        <TouchableOpacity
          style={styles.fab}
          onPress={() => setShowAddTransaction(true)}
        >
          <Text style={styles.fabText}>+</Text>
        </TouchableOpacity>

        {/* Add Transaction Modal */}
        <AddTransactionScreen
          visible={showAddTransaction}
          onClose={() => setShowAddTransaction(false)}
          onTransactionAdded={handleTransactionAdded}
        />
      </View>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  iconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: {
    fontSize: 20,
  },
  fab: {
    position: 'absolute',
    bottom: 80,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#14b8a6',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
  },
  fabText: {
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold',
  },
});
