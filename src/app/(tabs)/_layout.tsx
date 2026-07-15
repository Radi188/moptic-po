import { Tabs } from 'expo-router';
import { ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { useTranslation } from '@/contexts/i18n';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';

/** Renders the filled icon when focused, the outline variant otherwise. */
function tabIcon(base: string, iconSize?: number) {
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
    return <Ionicons name={name} size={iconSize ?? size} color={color as string} />;
  };
}

export default function TabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { isTablet } = useResponsive();
  const { t } = useTranslation();

  // Roomier bar + icons + labels on tablets; a modest bump on phones too.
  const barBase = isTablet ? 68 : 56;
  const iconSize = isTablet ? 30 : 24;
  const labelSize = isTablet ? 15 : 12;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.tint,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.background,
          height: barBase + insets.bottom,
          paddingTop: isTablet ? 10 : 6,
          paddingBottom: insets.bottom + (isTablet ? 10 : 6),
        },
        tabBarLabelStyle: { fontSize: labelSize, fontWeight: '600' },
        tabBarIconStyle: { marginBottom: isTablet ? 2 : 0 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.home'), tabBarIcon: tabIcon('home', iconSize) }}
      />
      <Tabs.Screen
        name="purchase-orders"
        options={{
          title: t('tabs.purchaseOrder'),
          tabBarLabel: t('tabs.purchase'),
          tabBarIcon: tabIcon('receipt', iconSize),
        }}
      />
      <Tabs.Screen
        name="inventory"
        options={{
          title: t('tabs.inventoryOverview'),
          tabBarLabel: t('tabs.inventory'),
          tabBarIcon: tabIcon('cube', iconSize),
        }}
      />
      <Tabs.Screen
        name="transfers"
        options={{
          title: t('tabs.stockTransfer'),
          tabBarLabel: t('tabs.transfer'),
          tabBarIcon: tabIcon('swap-horizontal', iconSize),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tabs.settings'), tabBarIcon: tabIcon('settings', iconSize) }}
      />
    </Tabs>
  );
}
