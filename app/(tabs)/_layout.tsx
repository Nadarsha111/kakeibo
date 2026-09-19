import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../context/ThemeContext';
import { useTabScrub } from '../../hooks/useTabScrub';
import { useTabSwipe } from '../../hooks/useTabSwipe';
import PebbleTabBar, { tabBarOffset } from '../../components/PebbleTabBar';
import { TransactionModalProvider, useTransactionModal } from '../../context/TransactionModalContext';

function Fab() {
  const { openModal } = useTransactionModal();
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();

  return (
    <TouchableOpacity
      style={[
        styles.fab,
        {
          backgroundColor: theme.colors.primary,
          bottom: tabBarOffset(insets.bottom) + 12
        }
      ]}
      onPress={() => openModal()}
    >
      <MaterialCommunityIcons name="plus" size={32} color="white" />
    </TouchableOpacity>
  );
}

export default function TabLayout() {
  const { theme } = useTheme();
  const scrub = useTabScrub();
  const swipeHandlers = useTabSwipe(scrub);

  return (
    <TransactionModalProvider>
      <View style={{ flex: 1, backgroundColor: theme.colors.background }} {...swipeHandlers}>
        <Tabs tabBar={(props) => <PebbleTabBar {...props} scrub={scrub} />} screenOptions={{ headerShown: false }}>
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
            name="accounts"
            options={{
              title: 'Accounts',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="bank-outline" color={color} />,
            }}
          />
        
          <Tabs.Screen
            name="manage"
            options={{
              title: 'Manage',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="account-settings-outline" color={color} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: 'Settings',
              tabBarIcon: ({ color }) => <MaterialCommunityIcons size={26} name="cog-outline" color={color} />,
            }}
          />
          <Tabs.Screen
            name="budget"
            options={{
              title: 'Budget',
              href: null
            }}
          />
          <Tabs.Screen
            name="worth"
            options={{
              title: 'Assets & Liabilities',
              href: null
            }}
          />
          <Tabs.Screen
            name="profiles"
            options={{
              title: 'Profiles',
              href: null
            }}
          />
        </Tabs>
        <Fab />
      </View>
    </TransactionModalProvider>
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
