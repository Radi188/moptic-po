import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";

import { isApiConfigured } from "@/api/config";
import {
  fetchPurchaseInvoice,
  fetchPurchaseInvoices,
  fetchPurchaseOrder,
  fetchPurchaseOrders,
  getWarehouses,
  type ApiOption,
} from "@/api/purchase-orders";
import { CreateInvoiceSheet } from "@/components/create-invoice-sheet";
import { OptionSheet } from "@/components/option-sheet";
import { ListLoadingOverlay } from "@/components/list-loading-overlay";
import { PurchaseOrderDetailsSheet } from "@/components/purchase-order-details-sheet";
import { StatusBadge } from "@/components/status-badge";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import {
  formatDate,
  formatDateTime,
  formatMoney,
  STATUS_META,
  type PurchaseOrder,
} from "@/data/purchase-orders";
import { SkeletonList } from "@/components/skeleton";
import { useTranslation } from "@/contexts/i18n";
import { useResponsive } from "@/hooks/use-responsive";
import { useTheme } from "@/hooks/use-theme";

const BRAND = "#232843";

function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function PurchaseOrdersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { t, language } = useTranslation();
  const km = language === "km";
  const { isTablet } = useResponsive();

  const [tab, setTab] = useState<"orders" | "invoices">("orders");
  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState<ApiOption | null>(null);
  const [warehouseOptions, setWarehouseOptions] = useState<ApiOption[]>([]);
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [dateTo, setDateTo] = useState(() => new Date());
  const [warehouseSheet, setWarehouseSheet] = useState(false);
  const [datePicker, setDatePicker] = useState<"from" | "to" | null>(null);
  const [tempDate, setTempDate] = useState(() => new Date());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [items, setItems] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);

  const [invoiceVisible, setInvoiceVisible] = useState(false);
  const [invoiceOrder, setInvoiceOrder] = useState<PurchaseOrder | null>(null);

  // Warehouse dropdown options.
  useEffect(() => {
    getWarehouses()
      .then(setWarehouseOptions)
      .catch(() => {});
  }, []);

  // Resolve a warehouse id (all the list rows carry) to its display name.
  const warehouseNameById = useMemo(() => {
    const map = new Map(warehouseOptions.map((o) => [o.id, o.name]));
    return (id: string) => map.get(id) ?? "";
  }, [warehouseOptions]);

  const load = useCallback(
    (targetPage: number, mode: "replace" | "append") => {
      if (mode === "append") setLoadingMore(true);
      else setLoading(true);
      setError(null);
      // Invoices only support search server-side; orders also filter by
      // warehouse and date range.
      const request =
        tab === "invoices"
          ? fetchPurchaseInvoices({ page: targetPage, search })
          : fetchPurchaseOrders({
              page: targetPage,
              search,
              warehouse,
              dateFrom: ymd(dateFrom),
              dateTo: ymd(dateTo),
            });
      return request
        .then((res) => {
          setItems((prev) =>
            mode === "append" ? [...prev, ...res.items] : res.items,
          );
          setTotal(res.total);
          setTotalPages(res.totalPages);
          setPage(res.page);
        })
        .catch((e) =>
          setError(
            e instanceof Error
              ? e.message
              : t(tab === "invoices" ? "po.invoiceLoadError" : "po.loadError"),
          ),
        )
        .finally(() => {
          setLoading(false);
          setLoadingMore(false);
        });
    },
    [tab, search, warehouse, dateFrom, dateTo, t],
  );

  // Reload from the first page on mount, refocus, or when filters change.
  useFocusEffect(
    useCallback(() => {
      load(1, "replace");
    }, [load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(1, "replace").finally(() => setRefreshing(false));
  }, [load]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || refreshing) return;
    // Nothing to page through on an empty list, and guard against a missing/NaN
    // page count so onEndReached can't fire an endless append loop.
    if (items.length === 0) return;
    if (!totalPages || page >= totalPages) return;
    load(page + 1, "append");
  }, [loading, loadingMore, refreshing, items.length, page, totalPages, load]);

  function changeSearch(text: string) {
    setSearch(text);
    setPage(1);
  }

  function openDatePicker(which: "from" | "to") {
    setTempDate(which === "from" ? dateFrom : dateTo);
    setDatePicker(which);
  }

  // Android: native dialog fires once with the chosen date.
  function onAndroidDateChange(event: DateTimePickerEvent, selectedDate?: Date) {
    const which = datePicker;
    setDatePicker(null);
    if (event.type === "dismissed" || !selectedDate) return;
    if (which === "from") setDateFrom(selectedDate);
    else setDateTo(selectedDate);
    setPage(1);
  }

  // iOS: apply the temp value picked in the modal.
  function confirmDate() {
    if (datePicker === "from") setDateFrom(tempDate);
    else if (datePicker === "to") setDateTo(tempDate);
    setPage(1);
    setDatePicker(null);
  }

  function changeTab(next: "orders" | "invoices") {
    if (next === tab) return;
    setTab(next);
    setItems([]);
    setPage(1);
  }

  function openOrder(id: string) {
    setSelected(null);
    setDetailLoading(true);
    setDetailVisible(true);
    const fetchDetail =
      tab === "invoices" ? fetchPurchaseInvoice : fetchPurchaseOrder;
    fetchDetail(id)
      .then((o) => setSelected(o ?? null))
      .catch(() => setDetailVisible(false))
      .finally(() => setDetailLoading(false));
  }

  function closeDetail() {
    setDetailVisible(false);
    setSelected(null);
  }

  function openCreateInvoice(order: PurchaseOrder) {
    setDetailVisible(false);
    setInvoiceOrder(order);
    setInvoiceVisible(true);
  }

  function closeInvoice() {
    setInvoiceVisible(false);
    setInvoiceOrder(null);
  }

  function onInvoiceCreated() {
    closeInvoice();
    setSelected(null);
    // The order is now invoiced — refresh the list so its badge updates.
    load(1, "replace");
  }

  function newOrder() {
    router.push({ pathname: "/purchase-order/[id]", params: { id: "new" } });
  }

  function editOrder(id: string) {
    closeDetail();
    router.push({ pathname: "/purchase-order/[id]", params: { id } });
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <View>
          <ThemedText
            style={[
              styles.title,
              isTablet && styles.titleTablet,
              km && (isTablet ? styles.titleTabletKm : styles.titleKm),
            ]}>
            {tab === "invoices" ? t("po.invoiceTitle") : t("po.title")}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {tab === "invoices"
              ? t("po.invoiceCount", { count: total })
              : t("po.count", { count: total })}
          </ThemedText>
        </View>
        {tab === "orders" && (
          <Pressable
            onPress={newOrder}
            style={({ pressed }) => [
              styles.newButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={20} color="#ffffff" />
            <ThemedText style={styles.newButtonText}>
              {t("common.new")}
            </ThemedText>
          </Pressable>
        )}
      </View>

      <ThemedView type="backgroundElement" style={styles.tabs}>
        <Pressable
          onPress={() => changeTab("orders")}
          style={({ pressed }) => [
            styles.tab,
            tab === "orders" && styles.tabActive,
            pressed && styles.pressed,
          ]}
        >
          <ThemedText
            type="smallBold"
            style={
              tab === "orders" ? styles.tabTextActive : { color: theme.textSecondary }
            }
          >
            {t("po.tabOrders")}
          </ThemedText>
        </Pressable>
        <Pressable
          onPress={() => changeTab("invoices")}
          style={({ pressed }) => [
            styles.tab,
            tab === "invoices" && styles.tabActive,
            pressed && styles.pressed,
          ]}
        >
          <ThemedText
            type="smallBold"
            style={
              tab === "invoices"
                ? styles.tabTextActive
                : { color: theme.textSecondary }
            }
          >
            {t("po.tabInvoices")}
          </ThemedText>
        </Pressable>
      </ThemedView>

      {tab === "orders" && (
      <View style={styles.controls}>
        <Pressable
          onPress={() => setWarehouseSheet(true)}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              {t("filters.warehouse")}
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.selectBox}>
              <Ionicons
                name="business-outline"
                size={18}
                color={theme.textSecondary}
              />
              <ThemedText
                numberOfLines={1}
                style={[
                  styles.selectValue,
                  { color: warehouse ? theme.text : theme.textSecondary },
                ]}
              >
                {warehouse?.name ?? t("filters.allWarehouses")}
              </ThemedText>
              <Ionicons
                name="chevron-down"
                size={18}
                color={theme.textSecondary}
              />
            </ThemedView>
          </View>
        </Pressable>

        <View style={styles.dateRow}>
          <Pressable
            onPress={() => openDatePicker("from")}
            style={({ pressed }) => [styles.dateCol, pressed && styles.pressed]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              {t("filters.dateFrom")}
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.selectBox}>
              <Ionicons
                name="calendar-outline"
                size={18}
                color={theme.textSecondary}
              />
              <ThemedText style={[styles.selectValue, { color: theme.text }]}>
                {formatDate(dateFrom.toISOString())}
              </ThemedText>
            </ThemedView>
          </Pressable>

          <Pressable
            onPress={() => openDatePicker("to")}
            style={({ pressed }) => [styles.dateCol, pressed && styles.pressed]}
          >
            <ThemedText type="small" themeColor="textSecondary">
              {t("filters.dateTo")}
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.selectBox}>
              <Ionicons
                name="calendar-outline"
                size={18}
                color={theme.textSecondary}
              />
              <ThemedText style={[styles.selectValue, { color: theme.text }]}>
                {formatDate(dateTo.toISOString())}
              </ThemedText>
            </ThemedView>
          </Pressable>
        </View>
      </View>
      )}

      {datePicker && Platform.OS === "android" && (
        <DateTimePicker
          value={datePicker === "from" ? dateFrom : dateTo}
          mode="date"
          display="default"
          onChange={onAndroidDateChange}
        />
      )}

      {Platform.OS === "ios" && (
        <Modal
          visible={datePicker !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setDatePicker(null)}
        >
          <Pressable style={styles.dateBackdrop} onPress={() => setDatePicker(null)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <ThemedView style={styles.datePickerCard}>
                <View style={styles.datePickerHeader}>
                  <Pressable onPress={() => setDatePicker(null)} hitSlop={Spacing.two}>
                    <ThemedText type="small" themeColor="textSecondary">
                      {t("common.cancel")}
                    </ThemedText>
                  </Pressable>
                  <ThemedText type="smallBold">
                    {datePicker === "from"
                      ? t("filters.dateFrom")
                      : t("filters.dateTo")}
                  </ThemedText>
                  <Pressable onPress={confirmDate} hitSlop={Spacing.two}>
                    <ThemedText type="smallBold" style={{ color: theme.tint }}>
                      {t("common.done")}
                    </ThemedText>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="inline"
                  themeVariant={theme.background !== "#ffffff" ? "dark" : "light"}
                  onChange={(_event, selectedDate) => {
                    if (selectedDate) setTempDate(selectedDate);
                  }}
                />
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        key={isTablet ? "grid" : "list"}
        numColumns={isTablet ? 2 : 1}
        columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textSecondary}
            colors={[theme.tint]}
          />
        }
        renderItem={({ item }) => (
          <View style={isTablet ? styles.gridItem : undefined}>
            <OrderCard
              order={item}
              warehouseName={warehouseNameById(item.warehouse)}
              onPress={() => openOrder(item.id)}
              onLongPress={
                isApiConfigured() ? undefined : () => editOrder(item.id)
              }
            />
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <SkeletonList />
          ) : (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.empty}
            >
              {error ??
                (tab === "invoices" ? t("po.invoiceEmpty") : t("po.empty"))}
            </ThemedText>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={theme.tint} />
            </View>
          ) : null
        }
      />

      <PurchaseOrderDetailsSheet
        visible={detailVisible}
        loading={detailLoading}
        order={selected}
        onClose={closeDetail}
        onEdit={tab === "orders" ? editOrder : undefined}
        onCreateInvoice={tab === "orders" ? openCreateInvoice : undefined}
      />

      <CreateInvoiceSheet
        visible={invoiceVisible}
        order={invoiceOrder}
        onClose={closeInvoice}
        onCreated={onInvoiceCreated}
      />

      <OptionSheet
        visible={warehouseSheet}
        title={t("filters.selectWarehouse")}
        options={[t("filters.allWarehouses"), ...warehouseOptions.map((o) => o.name)]}
        selected={warehouse?.name ?? t("filters.allWarehouses")}
        onSelect={(value) => {
          setWarehouse(
            value === t("filters.allWarehouses")
              ? null
              : (warehouseOptions.find((o) => o.name === value) ?? null),
          );
          setPage(1);
          setWarehouseSheet(false);
        }}
        onClose={() => setWarehouseSheet(false)}
      />

      <ListLoadingOverlay visible={loading && items.length > 0} />
    </ThemedView>
  );
}

function OrderCard({
  order,
  warehouseName,
  onPress,
  onLongPress,
}: {
  order: PurchaseOrder;
  warehouseName?: string;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const theme = useTheme();
  const { t } = useTranslation();
  const statusColor = order.status ? STATUS_META[order.status].color : theme.tint;
  const itemCount = order.itemsCount ?? order.items.length;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.cardRow}>
          <View
            style={[styles.iconTile, { backgroundColor: `${statusColor}1A` }]}
          >
            <Ionicons name="receipt-outline" size={22} color={statusColor} />
          </View>
          <View style={styles.cardMain}>
            <View style={styles.refRow}>
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={styles.cardRef}
              >
                {order.reference}
              </ThemedText>
              <View style={styles.flexSpacer} />
              <View style={styles.priceCol}>
                <ThemedText type="smallBold" style={styles.cardTotal}>
                  {formatMoney(order.totalAmount)}
                </ThemedText>
                {order.status && (
                  <View>
                    <StatusBadge status={order.status} />
                  </View>
                )}
              </View>
            </View>
            <View style={styles.inlineRow}>
              <Ionicons
                name="storefront-outline"
                size={13}
                color={theme.textSecondary}
              />
              <ThemedText
                type="small"
                themeColor="textSecondary"
                numberOfLines={1}
              >
                {order.vendor}
              </ThemedText>
            </View>
            {warehouseName ? (
              <View style={styles.inlineRow}>
                <Ionicons
                  name="business-outline"
                  size={13}
                  color={theme.textSecondary}
                />
                <ThemedText
                  type="small"
                  themeColor="textSecondary"
                  numberOfLines={1}
                >
                  {warehouseName}
                </ThemedText>
              </View>
            ) : null}
          </View>
        </View>

        <View style={[styles.cardFooter, { borderTopColor: theme.background }]}>
          <View style={styles.inlineRow}>
            <Ionicons
              name="calendar-outline"
              size={13}
              color={theme.textSecondary}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {formatDateTime(order.transactionDate)}
            </ThemedText>
          </View>
          <View style={styles.inlineRow}>
            <Ionicons
              name="cube-outline"
              size={13}
              color={theme.textSecondary}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {itemCount} {itemCount === 1 ? t("common.item") : t("common.items")}
            </ThemedText>
          </View>
        </View>
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "700",
  },
  titleTablet: {
    fontSize: 32,
    lineHeight: 40,
  },
  // Khmer titles need more line height so tall stacked glyphs don't clip.
  titleKm: {
    lineHeight: 42,
  },
  titleTabletKm: {
    lineHeight: 50,
  },
  newButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    backgroundColor: BRAND,
    paddingLeft: Spacing.two,
    paddingRight: Spacing.three,
    height: 40,
    borderRadius: Spacing.five,
  },
  newButtonText: {
    color: "#ffffff",
    fontWeight: "600",
  },
  tabs: {
    flexDirection: "row",
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    padding: Spacing.half,
    borderRadius: Spacing.three,
    gap: Spacing.half,
  },
  tab: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    height: 38,
    borderRadius: Spacing.two,
  },
  tabActive: {
    backgroundColor: BRAND,
  },
  tabTextActive: {
    color: "#ffffff",
  },
  controls: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.three,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 46,
    borderRadius: Spacing.three,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: "100%",
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  selectBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 46,
    borderRadius: Spacing.three,
  },
  selectValue: {
    flex: 1,
    fontSize: 15,
  },
  dateRow: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  dateCol: {
    flex: 1,
    gap: Spacing.one,
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
  },
  columnWrapper: {
    gap: Spacing.three,
  },
  gridItem: {
    flex: 1,
  },
  empty: {
    textAlign: "center",
    paddingVertical: Spacing.six,
  },
  center: {
    paddingVertical: Spacing.six,
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.four,
    gap: Spacing.three,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
  },
  iconTile: {
    width: 46,
    height: 46,
    borderRadius: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
  },
  cardMain: {
    flex: 1,
    gap: Spacing.half,
  },
  refRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: Spacing.two,
  },
  priceCol: {
    alignItems: "flex-end",
    gap: Spacing.half,
  },
  cardRef: {
    fontSize: 15,
    flexShrink: 1,
  },
  flexSpacer: {
    flex: 1,
  },
  cardTotal: {
    fontSize: 15,
  },
  inlineRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    flexShrink: 1,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
  },
  footer: {
    paddingVertical: Spacing.four,
    alignItems: "center",
  },
  pressed: {
    opacity: 0.7,
  },
  dateBackdrop: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: Spacing.four,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
  },
  datePickerCard: {
    borderRadius: Spacing.four,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  datePickerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.one,
  },
});
