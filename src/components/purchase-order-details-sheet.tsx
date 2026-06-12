import { Image } from 'expo-image';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  canEditOrder,
  formatDateTime,
  formatMoney,
  itemTotal,
  type PurchaseOrder,
  type PurchaseOrderItem,
} from '@/data/purchase-orders';

const BRAND = '#232843';
const TOTAL_COLOR = '#e5484d';

type Props = {
  visible: boolean;
  loading?: boolean;
  order: PurchaseOrder | null;
  onClose: () => void;
  onEdit: (id: string) => void;
};

export function PurchaseOrderDetailsSheet({ visible, loading, order, onClose, onEdit }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
          <ThemedView style={styles.handle} type="backgroundSelected" />

          {loading && !order ? (
            <View style={styles.loading}>
              <ActivityIndicator color={BRAND} />
            </View>
          ) : order ? (
            <>
              <View style={styles.titleRow}>
                <ThemedText type="subtitle" style={styles.title}>
                  Purchase Order Details
                </ThemedText>
                {order.status && <StatusBadge status={order.status} />}
              </View>

              <View style={styles.metaRow}>
                <ThemedText type="smallBold">{order.reference}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {order.vendor} · {formatDateTime(order.transactionDate)}
                </ThemedText>
              </View>

              <ScrollView style={styles.list} bounces={false} showsVerticalScrollIndicator={false}>
                {order.items.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                    No items in this order.
                  </ThemedText>
                ) : (
                  order.items.map((item, index) => (
                    <ItemRow key={item.id} item={item} index={index} theme={theme} />
                  ))
                )}
              </ScrollView>

              <ThemedView type="backgroundElement" style={styles.summary}>
                <SummaryRow label="Amount" value={formatMoney(order.amount)} />
                <SummaryRow label="Discount" value={formatMoney(order.discountAmount)} />
                <SummaryRow label="Total" value={formatMoney(order.totalAmount)} accent />
              </ThemedView>

              {canEditOrder(order.status) ? (
                <Pressable
                  onPress={() => onEdit(order.id)}
                  style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
                  <Ionicons name="create-outline" size={18} color="#ffffff" />
                  <ThemedText style={styles.editButtonText}>Edit order</ThemedText>
                </Pressable>
              ) : order.status ? (
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  This order is {order.status} and can&apos;t be edited.
                </ThemedText>
              ) : null}
            </>
          ) : null}
        </ThemedView>
      </View>
    </Modal>
  );
}

function ItemRow({
  item,
  index,
  theme,
}: {
  item: PurchaseOrderItem;
  index: number;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={[
        styles.itemRow,
        index > 0 && { borderTopColor: theme.background, borderTopWidth: 1 },
      ]}>
      <ThemedView type="backgroundSelected" style={styles.thumb}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Ionicons name="image-outline" size={20} color={theme.textSecondary} />
        )}
      </ThemedView>
      <View style={styles.itemText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {item.itemName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {item.itemCode}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {formatMoney(item.cost)} × {item.qty}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" style={{ color: TOTAL_COLOR }}>
        {formatMoney(itemTotal(item))}
      </ThemedText>
    </View>
  );
}

function SummaryRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={styles.summaryRow}>
      <ThemedText type={accent ? 'smallBold' : 'small'} themeColor={accent ? 'text' : 'textSecondary'}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={accent ? { color: BRAND } : undefined}>
        {value}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    gap: Spacing.three,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  loading: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
    flexShrink: 1,
  },
  metaRow: {
    gap: Spacing.half,
  },
  list: {
    flexGrow: 0,
  },
  empty: {
    paddingVertical: Spacing.four,
    textAlign: 'center',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  itemText: {
    flex: 1,
    gap: Spacing.half,
  },
  summary: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  editButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 52,
    borderRadius: Spacing.three,
    backgroundColor: BRAND,
  },
  editButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  note: {
    textAlign: 'center',
    paddingVertical: Spacing.one,
  },
  pressed: {
    opacity: 0.7,
  },
});
