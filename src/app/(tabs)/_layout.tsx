import { Tabs } from 'expo-router';
import { ColorValue } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';

/** Renders the filled icon when focused, the outline variant otherwise. */
function tabIcon(base: string) {
  return function TabBarIcon({
    color,
    size,
    focused,
  }: {
    color: ColorValue;
    size: number;
    focused: boolean;
  }) {
    const name = (focused ? base : `${base}-outline`) as React.ComponentProps<
      typeof Ionicons
    >['name'];
    return <Ionicons name={name} size={size} color={color as string} />;
  };
}

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: BRAND,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background },
        tabBarLabelStyle: { fontSize: 11 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: 'Home', tabBarIcon: tabIcon('home') }}
      />
      <Tabs.Screen
        name="purchase-orders"
        options={{
          title: 'Purchase Order',
          tabBarLabel: 'Purchase',
          tabBarIcon: tabIcon('receipt'),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: 'Inventory Overview',
          tabBarLabel: 'Inventory',
          tabBarIcon: tabIcon('cube'),
        }}
      />
      <Tabs.Screen
        name="transfers"
        options={{
          title: 'Stock Transfer',
          tabBarLabel: 'Transfer',
          tabBarIcon: tabIcon('swap-horizontal'),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Settings', tabBarIcon: tabIcon('settings') }}
      />
    </Tabs>
  );
}
