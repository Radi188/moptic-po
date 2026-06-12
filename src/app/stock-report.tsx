import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { fetchPurchaseOrders } from '@/api/purchase-orders';
import { fetchStockSummary, type WarehouseMovement } from '@/api/stock-summary';
import { fetchTransfers } from '@/api/transfers';
import { ScreenHeader } from '@/components/screen-header';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import {
  formatDate,
  formatDateTime,
  formatMoney,
  type PurchaseOrder,
} from '@/data/purchase-orders';
import { STATUS_META as TRANSFER_STATUS, type StockTransfer } from '@/data/transfers';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';
const IN = '#30A46C';
const OUT = '#e5484d';

function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

type ListState<T> = { items: T[]; total: number; page: number; lastPage: number };
const emptyList = <T,>(): ListState<T> => ({ items: [], total: 0, page: 1, lastPage: 1 });

export default function StockReportScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const branchId = session?.branch.id;

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [dateTo, setDateTo] = useState(() => new Date());
  const [datePicker, setDatePicker] = useState<'from' | 'to' | null>(null);
  const [tempDate, setTempDate] = useState(() => new Date());

  const [movements, setMovements] = useState<WarehouseMovement[]>([]);
  const [purchases, setPurchases] = useState<ListState<PurchaseOrder>>(emptyList);
  const [transfers, setTransfers] = useState<ListState<StockTransfer>>(emptyList);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [morePO, setMorePO] = useState(false);
  const [moreTR, setMoreTR] = useState(false);

  const load = useCallback(
    async (from: Date, to: Date) => {
      setLoading(true);
      setError(null);
      const range = { dateFrom: ymd(from), dateTo: ymd(to) };
      try {
        const [summary, po, tr] = await Promise.all([
          fetchStockSummary({ ...range, branchId }),
          fetchPurchaseOrders({ page: 1, ...range }),
          fetchTransfers({ page: 1, ...range }),
        ]);
        setMovements(summary);
        setPurchases({ items: po.items, total: po.total, page: po.page, lastPage: po.totalPages });
        setTransfers({ items: tr.items, total: tr.total, page: tr.page, lastPage: tr.totalPages });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load report.');
      } finally {
        setLoading(false);
      }
    },
    [branchId],
  );

  useEffect(() => {
    load(dateFrom, dateTo);
  }, [dateFrom, dateTo, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(dateFrom, dateTo).finally(() => setRefreshing(false));
  }, [load, dateFrom, dateTo]);

  async function loadMorePurchases() {
    if (morePO || purchases.page >= purchases.lastPage) return;
    setMorePO(true);
    try {
      const next = await fetchPurchaseOrders({
        page: purchases.page + 1,
        dateFrom: ymd(dateFrom),
        dateTo: ymd(dateTo),
      });
      setPurchases((prev) => ({
        items: [...prev.items, ...next.items],
        total: next.total,
        page: next.page,
        lastPage: next.totalPages,
      }));
    } catch {
      // keep current list on failure
    } finally {
      setMorePO(false);
    }
  }

  async function loadMoreTransfers() {
    if (moreTR || transfers.page >= transfers.lastPage) return;
    setMoreTR(true);
    try {
      const next = await fetchTransfers({
        page: transfers.page + 1,
        dateFrom: ymd(dateFrom),
        dateTo: ymd(dateTo),
      });
      setTransfers((prev) => ({
        items: [...prev.items, ...next.items],
        total: next.total,
        page: next.page,
        lastPage: next.totalPages,
      }));
    } catch {
      // keep current list on failure
    } finally {
      setMoreTR(false);
    }
  }

  function openDatePicker(which: 'from' | 'to') {
    setTempDate(which === 'from' ? dateFrom : dateTo);
    setDatePicker(which);
  }

  function onAndroidDateChange(event: DateTimePickerEvent, selected?: Date) {
    const which = datePicker;
    setDatePicker(null);
    if (event.type === 'dismissed' || !selected) return;
    if (which === 'from') setDateFrom(selected);
    else setDateTo(selected);
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader title="Stock Report" subtitle="Movement by period" onBack={() => router.back()} />

      <View style={styles.dateRow}>
        <DateField label="From" value={formatDate(dateFrom.toISOString())} onPress={() => openDatePicker('from')} theme={theme} />
        <DateField label="To" value={formatDate(dateTo.toISOString())} onPress={() => openDatePicker('to')} theme={theme} />
      </View>

      {datePicker && Platform.OS === 'android' && (
        <DateTimePicker
          value={datePicker === 'from' ? dateFrom : dateTo}
          mode="date"
          display="default"
          onChange={onAndroidDateChange}
        />
      )}
      {Platform.OS === 'ios' && (
        <Modal visible={datePicker !== null} transparent animationType="fade" onRequestClose={() => setDatePicker(null)}>
          <Pressable style={styles.dateBackdrop} onPress={() => setDatePicker(null)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <ThemedView style={styles.datePickerCard}>
                <View style={styles.datePickerHeader}>
                  <Pressable onPress={() => setDatePicker(null)} hitSlop={Spacing.two}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Cancel
                    </ThemedText>
                  </Pressable>
                  <ThemedText type="smallBold">{datePicker === 'from' ? 'Date From' : 'Date To'}</ThemedText>
                  <Pressable
                    onPress={() => {
                      if (datePicker === 'from') setDateFrom(tempDate);
                      else if (datePicker === 'to') setDateTo(tempDate);
                      setDatePicker(null);
                    }}
                    hitSlop={Spacing.two}>
                    <ThemedText type="smallBold" style={{ color: BRAND }}>
                      Done
                    </ThemedText>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="inline"
                  themeVariant={theme.background === '#000000' ? 'dark' : 'light'}
                  onChange={(_e, selected) => {
                    if (selected) setTempDate(selected);
                  }}
                />
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <ThemedText themeColor="textSecondary">{error}</ThemedText>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.body}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.textSecondary} colors={[BRAND]} />
          }>
          <SectionTitle title="Stock Movement" />
          {movements.length === 0 ? (
            <EmptyCard text="No movement for this period." />
          ) : (
            movements.map((m) => <MovementCard key={m.warehouseId} m={m} theme={theme} />)
          )}

          <SectionTitle title="Purchases" badge={`${purchases.total}`} />
          {purchases.items.length === 0 ? (
            <EmptyCard text="No purchases in this period." />
          ) : (
            <ThemedView type="backgroundElement" style={styles.card}>
              {purchases.items.map((po, i) => (
                <PurchaseRow key={`${po.id}-${i}`} po={po} divider={i > 0} theme={theme} />
              ))}
            </ThemedView>
          )}
          {purchases.page < purchases.lastPage && (
            <ShowMore loading={morePO} onPress={loadMorePurchases} theme={theme} />
          )}

          <SectionTitle title="Stock Transfers" badge={`${transfers.total}`} />
          {transfers.items.length === 0 ? (
            <EmptyCard text="No transfers in this period." />
          ) : (
            <ThemedView type="backgroundElement" style={styles.card}>
              {transfers.items.map((t, i) => (
                <TransferRow key={`${t.id}-${i}`} t={t} divider={i > 0} theme={theme} />
              ))}
            </ThemedView>
          )}
          {transfers.page < transfers.lastPage && (
            <ShowMore loading={moreTR} onPress={loadMoreTransfers} theme={theme} />
          )}
        </ScrollView>
      )}
    </ThemedView>
  );
}

function DateField({
  label,
  value,
  onPress,
  theme,
}: {
  label: string;
  value: string;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.dateCol, pressed && styles.pressed]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.dateBox}>
        <Ionicons name="calendar-outline" size={18} color={theme.textSecondary} />
        <ThemedText style={[styles.dateValue, { color: theme.text }]}>{value}</ThemedText>
      </ThemedView>
    </Pressable>
  );
}

function SectionTitle({ title, badge }: { title: string; badge?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <ThemedText type="smallBold" style={styles.sectionTitleText}>
        {title}
      </ThemedText>
      {badge != null && (
        <View style={styles.countBadge}>
          <ThemedText type="small" style={styles.countBadgeText}>
            {badge}
          </ThemedText>
        </View>
      )}
    </View>
  );
}

function MovementCard({ m, theme }: { m: WarehouseMovement; theme: ReturnType<typeof useTheme> }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.movementHead}>
        <View style={styles.flexShrink}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {m.warehouseName || `Warehouse ${m.warehouseId}`}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Ending balance
          </ThemedText>
        </View>
        <View style={styles.endingWrap}>
          <ThemedText type="smallBold" style={styles.endingQty}>
            {m.endingQty.toLocaleString()}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatMoney(m.endingAmount)}
          </ThemedText>
        </View>
      </View>
      <View style={[styles.movementBody, { borderTopColor: theme.background }]}>
        <MoveRow label="Opening" qty={m.openingQty} amount={m.openingAmount} theme={theme} />
        <MoveRow label="Purchase" qty={m.purchaseQty} amount={m.purchaseAmount} kind="in" theme={theme} />
        <MoveRow label="Received" qty={m.receivedQty} amount={m.receivedAmount} kind="in" theme={theme} />
        <MoveRow label="Sale" qty={m.saleQty} amount={m.saleAmount} kind="out" theme={theme} />
        <MoveRow label="Transfer" qty={m.transferQty} amount={m.transferAmount} signed theme={theme} />
        <MoveRow label="Adjustment" qty={m.adjustmentQty} amount={m.adjustmentAmount} signed theme={theme} />
      </View>
    </ThemedView>
  );
}

function MoveRow({
  label,
  qty,
  amount,
  kind,
  signed,
  theme,
}: {
  label: string;
  qty: number;
  amount: number;
  kind?: 'in' | 'out';
  signed?: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const color = kind === 'in' ? IN : kind === 'out' ? OUT : signed && qty < 0 ? OUT : signed && qty > 0 ? IN : theme.text;
  const prefix = kind === 'in' ? '+' : kind === 'out' ? '−' : qty > 0 && signed ? '+' : '';
  return (
    <View style={styles.moveRow}>
      <ThemedText type="small" themeColor="textSecondary" style={styles.flexOne}>
        {label}
      </ThemedText>
      <View style={styles.moveRight}>
        <ThemedText type="smallBold" style={{ color }}>
          {prefix}
          {Math.abs(qty).toLocaleString()}
        </ThemedText>
        {amount ? (
          <ThemedText type="small" themeColor="textSecondary">
            {formatMoney(Math.abs(amount))}
          </ThemedText>
        ) : null}
      </View>
    </View>
  );
}

function PurchaseRow({
  po,
  divider,
  theme,
}: {
  po: PurchaseOrder;
  divider: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={[styles.listRow, divider && { borderTopColor: theme.background, borderTopWidth: 1 }]}>
      <View style={styles.listInfo}>
        <View style={styles.listTop}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.flexShrink}>
            {po.reference}
          </ThemedText>
          {po.status ? <StatusBadge status={po.status} /> : null}
        </View>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {po.vendor} · {formatDateTime(po.transactionDate)}
        </ThemedText>
      </View>
      <ThemedText type="smallBold">{formatMoney(po.totalAmount)}</ThemedText>
    </View>
  );
}

function TransferRow({
  t,
  divider,
  theme,
}: {
  t: StockTransfer;
  divider: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const meta = TRANSFER_STATUS[t.status];
  return (
    <View style={[styles.listRow, divider && { borderTopColor: theme.background, borderTopWidth: 1 }]}>
      <View style={styles.listInfo}>
        <View style={styles.listTop}>
          <ThemedText type="smallBold" numberOfLines={1} style={styles.flexShrink}>
            {t.reference}
          </ThemedText>
          <View style={[styles.dot, { backgroundColor: meta.color }]} />
          <ThemedText type="small" style={{ color: meta.color, fontWeight: '700' }}>
            {meta.label}
          </ThemedText>
        </View>
        <View style={styles.routeRow}>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.flexShrink}>
            {t.fromWarehouse}
          </ThemedText>
          <Ionicons name="arrow-forward" size={12} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.flexShrink}>
            {t.toWarehouse}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="small" themeColor="textSecondary">
        {formatDate(t.transactionDate)}
      </ThemedText>
    </View>
  );
}

function ShowMore({
  loading,
  onPress,
  theme,
}: {
  loading: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable onPress={onPress} disabled={loading} style={({ pressed }) => [styles.showMore, pressed && styles.pressed]}>
      {loading ? (
        <ActivityIndicator color={theme.textSecondary} />
      ) : (
        <ThemedText type="small" style={{ color: BRAND, fontWeight: '700' }}>
          Show more
        </ThemedText>
      )}
    </Pressable>
  );
}

function EmptyCard({ text }: { text: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.emptyCard}>
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  dateCol: {
    flex: 1,
    gap: Spacing.one,
  },
  dateBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 46,
    borderRadius: Spacing.three,
  },
  dateValue: {
    flex: 1,
    fontSize: 15,
  },
  body: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
  },
  sectionTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  sectionTitleText: {
    fontSize: 16,
  },
  countBadge: {
    backgroundColor: `${BRAND}1A`,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: Spacing.three,
  },
  countBadgeText: {
    color: BRAND,
    fontWeight: '700',
  },
  card: {
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.three,
  },
  movementHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  endingWrap: {
    alignItems: 'flex-end',
  },
  endingQty: {
    fontSize: 18,
  },
  flexShrink: {
    flexShrink: 1,
  },
  flexOne: {
    flex: 1,
  },
  movementBody: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingVertical: Spacing.two,
    gap: Spacing.two,
  },
  moveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  moveRight: {
    alignItems: 'flex-end',
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  listInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  listTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  showMore: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.three,
  },
  dateBackdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  datePickerCard: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  datePickerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.one,
  },
  emptyCard: {
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.five,
  },
  pressed: {
    opacity: 0.7,
  },
});
