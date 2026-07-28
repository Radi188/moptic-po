import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchBranchSales } from '@/api/daily-sales';
import { Skeleton, SkeletonRows } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTranslation } from '@/contexts/i18n';
import { useTheme } from '@/hooks/use-theme';
import { generateRefillReportPdf, toReportRow } from '@/lib/refill-report';
import { isTelegramConfigured, sendTelegramDocument } from '@/lib/telegram';
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
  const { session } = useAuth();
  const { t } = useTranslation();
  const [sending, setSending] = useState(false);
  const meta = transfer ? STATUS_META[transfer.status] : null;
  const editable = transfer ? canEditTransfer(transfer.status) : false;

  // Manually (re)send the transfer's report to the Telegram group — a recovery
  // path when the automatic send at refill time failed.
  async function handleSendTelegram() {
    if (!transfer || sending) return;
    if (!isTelegramConfigured()) {
      Alert.alert(
        t('transferDetails.telegramNotConfigured'),
        t('transferDetails.telegramNotConfiguredBody'),
      );
      return;
    }
    setSending(true);
    try {
      const { rows, reportMeta } = await buildTransferReport(
        transfer,
        session?.branches ?? [],
      );
      const uri = await generateRefillReportPdf(rows, reportMeta);
      await sendTelegramDocument({
        uri,
        filename: `transfer-${transfer.reference || transfer.id}.pdf`,
        caption: `Stock transfer ${transfer.reference} — ${reportMeta.branchName}`,
      });
      Alert.alert(t('transferDetails.sent'), t('transferDetails.sentBody'));
    } catch (e) {
      Alert.alert(
        t('transferDetails.sendFailed'),
        e instanceof Error ? e.message : t('common.unknownError'),
      );
    } finally {
      setSending(false);
    }
  }

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
                  {t('transfers.title')}
                </ThemedText>
                <View style={[styles.badge, { backgroundColor: `${meta.color}22` }]}>
                  <View style={[styles.dot, { backgroundColor: meta.color }]} />
                  <ThemedText type="small" style={{ color: meta.color, fontWeight: '700' }}>
                    {t(`status.${transfer.status}`)}
                  </ThemedText>
                </View>
              </View>

              <ThemedView type="backgroundElement" style={styles.infoCard}>
                <InfoRow label={t('transferDetails.fromWarehouse')} value={transfer.fromWarehouse} theme={theme} />
                <InfoRow label={t('transferDetails.toWarehouse')} value={transfer.toWarehouse} theme={theme} />
                <InfoRow label={t('transferDetails.reference')} value={transfer.reference} theme={theme} />
                <InfoRow
                  label={t('transferDetails.date')}
                  value={formatDateTime(transfer.transactionDate)}
                  theme={theme}
                />
                {transfer.description ? (
                  <InfoRow
                    label={t('transferDetails.note')}
                    value={transfer.description}
                    theme={theme}
                    numberOfLines={2}
                  />
                ) : null}
                <InfoRow label={t('transferDetails.userRequest')} value={transfer.userRequest} theme={theme} last />
              </ThemedView>

              <ThemedText type="smallBold">
                {t('transferDetails.items', { count: transfer.items.length })}
              </ThemedText>
              <ScrollView style={styles.list} bounces={false} showsVerticalScrollIndicator={false}>
                {transfer.items.map((item, index) => (
                  <ItemRow key={item.id} item={item} index={index} theme={theme} />
                ))}
              </ScrollView>

              <Pressable
                onPress={handleSendTelegram}
                disabled={sending}
                style={({ pressed }) => [
                  styles.telegramButton,
                  { backgroundColor: theme.tintSoft },
                  (pressed || sending) && styles.pressed,
                ]}>
                {sending ? (
                  <ActivityIndicator color={theme.tint} />
                ) : (
                  <>
                    <Ionicons name="paper-plane-outline" size={18} color={theme.tint} />
                    <ThemedText style={[styles.telegramText, { color: theme.tint }]}>
                      {t('transferDetails.sendToTelegram')}
                    </ThemedText>
                  </>
                )}
              </Pressable>

              {editable ? (
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => onDecline(transfer.id)}
                    style={({ pressed }) => [styles.declineButton, pressed && styles.pressed]}>
                    <Ionicons name="close" size={18} color={DANGER} />
                    <ThemedText style={[styles.actionText, { color: DANGER }]}>{t('common.decline')}</ThemedText>
                  </Pressable>
                  <Pressable
                    onPress={() => onApprove(transfer.id)}
                    style={({ pressed }) => [styles.approveButton, pressed && styles.pressed]}>
                    <Ionicons name="checkmark" size={18} color="#ffffff" />
                    <ThemedText style={styles.approveText}>{t('common.approve')}</ThemedText>
                  </Pressable>
                </View>
              ) : (
                <ThemedText type="small" themeColor="textSecondary" style={styles.note}>
                  {t('transferDetails.statusNote', { status: t(`status.${transfer.status}`) })}
                </ThemedText>
              )}
            </>
          ) : null}
        </ThemedView>
      </View>
    </Modal>
  );
}

/**
 * Rebuild the refill report for a transfer. For a daily refill (its description
 * carries the branch + sales date) it re-fetches that day's branch sales so the
 * Less/Over columns are accurate; otherwise it falls back to just the
 * transferred items.
 */
async function buildTransferReport(
  transfer: StockTransfer,
  branches: { id: string; name: string }[],
) {
  const salesDate =
    transfer.description.match(/\d{4}-\d{2}-\d{2}/)?.[0] ?? transfer.transactionDate.slice(0, 10);
  const branch = branches.find(
    (b) =>
      b.name === transfer.toWarehouse ||
      transfer.toWarehouse.includes(b.name) ||
      transfer.description.includes(b.name),
  );

  const transferredQty = new Map<string, number>();
  for (const it of transfer.items) {
    if (it.itemId) transferredQty.set(it.itemId, it.qty);
    if (it.itemCode) transferredQty.set(it.itemCode, it.qty);
  }

  let rows: ReturnType<typeof toReportRow>[] | null = null;
  if (branch) {
    try {
      const sales = await fetchBranchSales({ date: salesDate, branchId: branch.id });
      if (sales.items.length > 0) {
        const soldRows = sales.items.map((s) =>
          toReportRow(
            s.itemName,
            s.qtySold,
            transferredQty.get(s.itemId) ?? transferredQty.get(s.itemCode) ?? 0,
          ),
        );
        // Sold items don't cover manually-added stock (new items that weren't
        // sold that day). Append any transferred item not in the sales list so
        // the report matches the transfer, not just the day's sales.
        const soldKeys = new Set<string>();
        for (const s of sales.items) {
          if (s.itemId) soldKeys.add(s.itemId);
          if (s.itemCode) soldKeys.add(s.itemCode);
        }
        const extraRows = transfer.items
          .filter(
            (it) =>
              !(it.itemId && soldKeys.has(it.itemId)) &&
              !(it.itemCode && soldKeys.has(it.itemCode)),
          )
          .map((it) => toReportRow(it.itemName, 0, it.qty));
        rows = [...soldRows, ...extraRows];
      }
    } catch {
      // Fall back to the transferred items below.
    }
  }
  if (!rows) {
    rows = transfer.items.map((it) => toReportRow(it.itemName, it.qty, it.qty));
  }

  const reportMeta = {
    branchName: branch?.name ?? transfer.toWarehouse,
    sourceName: transfer.fromWarehouse,
    date: salesDate,
    createdDate: transfer.transactionDate.slice(0, 10),
    bmName: '',
    deliveryPerson: '',
  };
  return { rows, reportMeta };
}

function InfoRow({
  label,
  value,
  theme,
  last,
  numberOfLines = 1,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  last?: boolean;
  numberOfLines?: number;
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
      <ThemedText type="smallBold" style={styles.infoValue} numberOfLines={numberOfLines}>
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
    // Taller than the font so tall Khmer glyphs aren't clipped at the top.
    lineHeight: 30,
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
  telegramButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: Spacing.three,
  },
  telegramText: {
    fontSize: 15,
    fontWeight: '700',
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
