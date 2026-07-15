import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createPurchaseInvoice } from '@/api/purchase-orders';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTranslation } from '@/contexts/i18n';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney, type PurchaseOrder } from '@/data/purchase-orders';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** Local "YYYY-MM-DD HH:mm:ss" — matches the purchase-order create body. */
function toApiDateTime(d: Date) {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

type Line = {
  itemId: string;
  itemCode: string;
  itemName: string;
  cost: number;
  qty: number;
  image?: string;
};

/**
 * Bottom-sheet modal to create a purchase invoice from a pending purchase order.
 * Prefills the PO's items and quantities; quantities can be adjusted and lines
 * removed before submitting. Posts { purchase_order_id, items[] }.
 */
export function CreateInvoiceSheet({
  visible,
  order,
  onClose,
  onCreated,
}: {
  visible: boolean;
  order: PurchaseOrder | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { session } = useAuth();

  const [lines, setLines] = useState<Line[]>([]);
  const [submitting, setSubmitting] = useState<'draft' | 'confirm' | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Prefill from the PO's items/qty whenever a different order opens.
  useEffect(() => {
    if (!order) return;
    setLines(
      order.items.map((it) => ({
        itemId: it.itemId,
        itemCode: it.itemCode,
        itemName: it.itemName,
        cost: it.cost,
        qty: it.qty,
        image: it.image,
      })),
    );
    setError(null);
  }, [order]);

  const total = lines.reduce((sum, l) => sum + l.cost * l.qty, 0);

  function changeQty(itemId: string, delta: number) {
    setLines((cur) =>
      cur.map((l) =>
        l.itemId === itemId ? { ...l, qty: Math.max(1, l.qty + delta) } : l,
      ),
    );
  }

  function removeLine(itemId: string) {
    setLines((cur) => cur.filter((l) => l.itemId !== itemId));
  }

  async function submit(confirm: boolean) {
    if (!order || submitting) return;
    if (lines.length === 0) {
      setError(t('createInvoice.empty'));
      return;
    }
    if (!order.vendorId) {
      setError(t('createInvoice.noVendor'));
      return;
    }
    setSubmitting(confirm ? 'confirm' : 'draft');
    setError(null);
    try {
      await createPurchaseInvoice({
        purchase_order_id: order.id,
        date: toApiDateTime(new Date()),
        vendor_id: order.vendorId,
        warehouse_id: order.warehouse,
        branch_login_id: session?.branch.id ?? '',
        discount_amount: order.discountAmount ?? 0,
        note: '',
        confirm,
        items: lines.map((l) => ({
          item_id: l.itemId,
          item_code: l.itemCode,
          item_name: l.itemName,
          cost: l.cost,
          qty: l.qty,
          discount_amount: 0,
          is_unique: false,
        })),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('createInvoice.error'));
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
          <ThemedView style={styles.handle} type="backgroundSelected" />

          {order ? (
            <>
              <ThemedText type="subtitle" style={styles.title}>
                {t('createInvoice.title')}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" style={styles.sub}>
                {t('createInvoice.forOrder', { ref: order.reference })}
                {order.vendor ? ` · ${order.vendor}` : ''}
              </ThemedText>

              <ScrollView style={styles.list} bounces={false} showsVerticalScrollIndicator={false}>
                {lines.length === 0 ? (
                  <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                    {t('createInvoice.empty')}
                  </ThemedText>
                ) : (
                  lines.map((line, index) => (
                    <View
                      key={line.itemId}
                      style={[
                        styles.itemRow,
                        index > 0 && { borderTopColor: theme.background, borderTopWidth: 1 },
                      ]}>
                      <ThemedView type="backgroundSelected" style={styles.thumb}>
                        {line.image ? (
                          <Image source={{ uri: line.image }} style={styles.thumbImage} contentFit="cover" />
                        ) : (
                          <Ionicons name="image-outline" size={18} color={theme.textSecondary} />
                        )}
                      </ThemedView>
                      <View style={styles.itemInfo}>
                        <ThemedText type="smallBold" numberOfLines={1}>
                          {line.itemName}
                        </ThemedText>
                        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                          {line.itemCode}
                        </ThemedText>
                        <View style={styles.qtyRow}>
                          <Stepper icon="remove" onPress={() => changeQty(line.itemId, -1)} theme={theme} />
                          <ThemedText type="smallBold" style={styles.qtyValue}>
                            {line.qty}
                          </ThemedText>
                          <Stepper icon="add" onPress={() => changeQty(line.itemId, 1)} theme={theme} />
                          <ThemedText type="small" themeColor="textSecondary">
                            × {formatMoney(line.cost)}
                          </ThemedText>
                        </View>
                      </View>
                      <View style={styles.itemRight}>
                        <ThemedText type="smallBold">{formatMoney(line.cost * line.qty)}</ThemedText>
                        <Pressable onPress={() => removeLine(line.itemId)} hitSlop={Spacing.two}>
                          <Ionicons name="trash-outline" size={18} color="#e5484d" />
                        </Pressable>
                      </View>
                    </View>
                  ))
                )}
              </ScrollView>

              <ThemedView type="backgroundElement" style={styles.summary}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('poDetails.total')}
                </ThemedText>
                <ThemedText type="smallBold" style={{ color: theme.tint }}>
                  {formatMoney(total)}
                </ThemedText>
              </ThemedView>

              {error && (
                <ThemedText type="small" style={styles.error}>
                  {error}
                </ThemedText>
              )}

              <View style={styles.actionRow}>
                <Pressable
                  onPress={() => submit(false)}
                  disabled={submitting !== null}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.draftButton,
                    { borderColor: theme.tint },
                    (pressed || submitting !== null) && styles.pressed,
                  ]}>
                  {submitting === 'draft' ? (
                    <ActivityIndicator color={theme.tint} />
                  ) : (
                    <ThemedText style={[styles.draftText, { color: theme.tint }]}>
                      {t('createInvoice.draft')}
                    </ThemedText>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => submit(true)}
                  disabled={submitting !== null}
                  style={({ pressed }) => [
                    styles.actionButton,
                    styles.confirmButton,
                    (pressed || submitting !== null) && styles.pressed,
                  ]}>
                  {submitting === 'confirm' ? (
                    <ActivityIndicator color="#ffffff" />
                  ) : (
                    <ThemedText style={styles.submitText}>{t('createInvoice.confirm')}</ThemedText>
                  )}
                </Pressable>
              </View>
            </>
          ) : null}
        </ThemedView>
      </View>
    </Modal>
  );
}

function Stepper({
  icon,
  onPress,
  theme,
}: {
  icon: 'add' | 'remove';
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepper,
        { borderColor: theme.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <Ionicons name={icon} size={16} color={theme.text} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    borderTopLeftRadius: Spacing.five,
    borderTopRightRadius: Spacing.five,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: Spacing.three,
  },
  title: {
    fontSize: 20,
  },
  sub: {
    marginTop: Spacing.half,
    marginBottom: Spacing.two,
  },
  list: {
    maxHeight: 360,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.six,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
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
  itemInfo: {
    flex: 1,
    gap: Spacing.one,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  qtyValue: {
    minWidth: 20,
    textAlign: 'center',
  },
  stepper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: Spacing.three,
    padding: Spacing.three,
    marginTop: Spacing.two,
  },
  error: {
    color: '#e5484d',
    marginTop: Spacing.two,
  },
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  actionButton: {
    flex: 1,
    height: 52,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  draftButton: {
    borderWidth: 1.5,
  },
  draftText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButton: {
    backgroundColor: '#3E63DD',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
