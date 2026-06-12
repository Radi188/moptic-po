import { Image } from 'expo-image';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Skeleton, SkeletonRows } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  canEditTransfer,
  formatDateTime,
  STATUS_META,
  type StockTransfer,
  type TransferItem,
} from '@/data/transfers';

const GREEN = '#30A46C';
const DANGER = '#e5484d';

type Props = {
  visible: boolean;
  loading?: boolean;
  transfer: StockTransfer | null;
  onClose: () => void;
  onApprove: (id: string) => void;
  onDecline: (id: string) => void;
};

export function TransferDetailsSheet({
  visible,
  loading,
  transfer,
  onClose,
  onApprove,
  onDecline,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const meta = transfer ? STATUS_META[transfer.status] : null;
  const editable = transfer ? canEditTransfer(transfer.status) : false;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
          <ThemedView style={styles.handle} type="backgroundSelected" />

          {loading && !transfer ? (
            <View style={styles.skeleton}>
              <Skeleton width="50%" height={20} />
              <Skeleton width="100%" height={72} radius={Spacing.three} />
              <SkeletonRows count={4} />
            </View>
          ) : transfer && meta ? (
            <>
              <View style={styles.titleRow}>
                <ThemedText type="subtitle" style={styles.title}>
                  Stock Transfer
                </ThemedText>
                <View style={[styles.badge, { backgroundColor: `${meta.color}22` }]}>
                  <View style={[styles.dot, { backgroundColor: meta.color }]} />
                  <ThemedText type="small" style={{ color: meta.color, fontWeight: '700' }}>
                    {meta.label}
                  </ThemedText>
                </View>
              </View>

              <ThemedView type="backgroundElement" style={styles.infoCard}>
                <InfoRow label="From Warehouse" value={transfer.fromWarehouse} theme={theme} />
                <InfoRow label="To Warehouse" value={transfer.toWarehouse} theme={theme} />
                <InfoRow label="Transfer Reference" value={transfer.reference} theme={theme} />
                <InfoRow
                  label="Transfer Date"
                  value={formatDateTime(transfer.transactionDate)}
                  theme={theme}
                />
                <InfoRow label="User Request" value={transfer.userRequest} theme={theme} last />
              </ThemedView>

              <ThemedText type="smallBold">Items ({transfer.items.length})</ThemedText>
              <ScrollView style={styles.list} bounces={false} showsVerticalScrollIndicator={false}>
                {transfer.items.map((item, index) => (
                  <ItemRow key={item.id} item={item} index={index} theme={theme} />
                ))}
              </ScrollView>

              {editable ? (
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => onDecline(transfer.id)}
                    style={({ pressed }) => [styles.declineButton, pressed && styles.pressed]}>
                    <Ionicons name="close" size={18} color={DANGER} />
                    <ThemedText style={[styles.actionText, { color: DANGER }]}>Decline</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => onApprove(transfer.id)}
                    style={({ pressed }) => [styles.approveButton, pressed && styles.pressed]}>
                    <Ionicons name="checkmark" size={18} color="#ffffff" />
                    <ThemedText style={styles.approveText}>Approve</ThemedText>
                  </Pressable>
                </View>
              ) : (
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  This transfer is {transfer.status}.
                </ThemedText>
              )}
            </>
          ) : null}
        </ThemedView>
      </View>
    </Modal>
  );
}

function InfoRow({
  label,
  value,
  theme,
  last,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.infoRow,
        !last && { borderBottomColor: theme.background, borderBottomWidth: 1 },
      ]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.infoValue} numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
  );
}

function ItemRow({
  item,
  index,
  theme,
}: {
  item: TransferItem;
  index: number;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View
      style={[styles.itemRow, index > 0 && { borderTopColor: theme.background, borderTopWidth: 1 }]}>
      <ThemedView type="backgroundSelected" style={styles.thumb}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Ionicons name="image-outline" size={18} color={theme.textSecondary} />
        )}
      </ThemedView>
      <View style={styles.itemText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {item.itemName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {item.itemCode}
          {item.category ? ` · ${item.category}` : ''}
        </ThemedText>
      </View>
      <View style={styles.qtyPill}>
        <ThemedText type="smallBold" style={{ color: theme.tint }}>
          ×{item.qty}
        </ThemedText>
      </View>
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
    maxHeight: '88%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  skeleton: {
    paddingVertical: Spacing.three,
    gap: Spacing.three,
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
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.three,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  infoCard: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  infoValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  list: {
    flexGrow: 0,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  thumb: {
    width: 44,
    height: 44,
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
  qtyPill: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  declineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 50,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    backgroundColor: `${DANGER}1A`,
  },
  approveButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 50,
    borderRadius: Spacing.three,
    backgroundColor: GREEN,
  },
  approveText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  actionText: {
    fontSize: 15,
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
