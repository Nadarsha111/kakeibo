import { Tabs } from 'expo-router';
import { Text } from 'react-native';

export default function Layout() {
  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'Overview', tabBarIcon: () => <Text>📊</Text> }} />
      <Tabs.Screen name="transactions" options={{ title: 'Transactions', tabBarIcon: () => <Text>📝</Text> }} />
      <Tabs.Screen name="budget" options={{ title: 'Budget', tabBarIcon: () => <Text>⏰</Text> }} />
      <Tabs.Screen name="categories" options={{ title: 'Categories', tabBarIcon: () => <Text>📋</Text> }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings', tabBarIcon: () => <Text>⚙️</Text> }} />
    </Tabs>
  );
}
