import Ionicons from 'react-native-vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import type { Stat } from '@/data/dashboard';
import { useTheme } from '@/hooks/use-theme';

export function StatCard({ stat }: { stat: Stat }) {
  const theme = useTheme();
  const iconName = stat.icon as React.ComponentProps<typeof Ionicons>['name'];

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.topRow}>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.label}>
          {stat.label}
        </ThemedText>
        <View style={[styles.iconWrap, { backgroundColor: theme.tintSoft }]}>
          <Ionicons name={iconName} size={16} color={theme.tint} />
        </View>
      </View>
      <ThemedText style={styles.value} numberOfLines={1}>
        {stat.value}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  card: {
    width: '48%',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  label: {
    flex: 1,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '700',
  },
});
