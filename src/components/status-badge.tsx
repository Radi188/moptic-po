import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { STATUS_META, type PurchaseOrderStatus } from '@/data/purchase-orders';

export function StatusBadge({ status }: { status: PurchaseOrderStatus }) {
  const meta = STATUS_META[status];
  return (
    <View style={[styles.badge, { backgroundColor: `${meta.color}22` }]}>
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      <ThemedText type="small" style={[styles.label, { color: meta.color }]}>
        {meta.label}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Spacing.two,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  label: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
});
