import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";

import { isApiConfigured } from "@/api/config";
import {
  fetchPurchaseOrder,
  fetchPurchaseOrders,
  getWarehouses,
  type ApiOption,
} from "@/api/purchase-orders";
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
  type PurchaseOrderPage,
} from "@/data/purchase-orders";
import { SkeletonList } from "@/components/skeleton";
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

  const [data, setData] = useState<PurchaseOrderPage>({
    items: [],
    total: 0,
    totalPages: 1,
    page: 1,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrder | null>(null);

  // Warehouse dropdown options.
  useEffect(() => {
    getWarehouses()
      .then(setWarehouseOptions)
      .catch(() => {});
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    fetchPurchaseOrders({
      page,
      search,
      warehouse,
      dateFrom: ymd(dateFrom),
      dateTo: ymd(dateTo),
    })
      .then(setData)
      .catch((e) =>
        setError(e instanceof Error ? e.message : "Failed to load orders."),
      )
      .finally(() => setLoading(false));
  }, [page, search, warehouse, dateFrom, dateTo]);

  useEffect(() => load(), [load]);
  useFocusEffect(load);

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

  function openOrder(id: string) {
    setSelected(null);
    setDetailLoading(true);
    setDetailVisible(true);
    fetchPurchaseOrder(id)
      .then((o) => setSelected(o ?? null))
      .catch(() => setDetailVisible(false))
      .finally(() => setDetailLoading(false));
  }

  function closeDetail() {
    setDetailVisible(false);
    setSelected(null);
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
          <ThemedText style={styles.title}>Purchase Orders</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {data.total} orders
          </ThemedText>
        </View>
        <Pressable
          onPress={newOrder}
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={20} color="#ffffff" />
          <ThemedText style={styles.newButtonText}>New</ThemedText>
        </Pressable>
      </View>

      <View style={styles.controls}>
        <Pressable
          onPress={() => setWarehouseSheet(true)}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              Warehouse
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
                {warehouse?.name ?? "All warehouses"}
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
              Date From
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
              Date To
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
                      Cancel
                    </ThemedText>
                  </Pressable>
                  <ThemedText type="smallBold">
                    {datePicker === "from" ? "Date From" : "Date To"}
                  </ThemedText>
                  <Pressable onPress={confirmDate} hitSlop={Spacing.two}>
                    <ThemedText type="smallBold" style={{ color: theme.tint }}>
                      Done
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
        data={data.items}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <OrderCard
            order={item}
            onPress={() => openOrder(item.id)}
            onLongPress={
              isApiConfigured() ? undefined : () => editOrder(item.id)
            }
          />
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
              {error ?? "No purchase orders match your filters."}
            </ThemedText>
          )
        }
        ListFooterComponent={
          data.items.length > 0 ? (
            <Pager
              page={data.page}
              totalPages={data.totalPages}
              onChange={setPage}
              theme={theme}
            />
          ) : null
        }
      />

      <PurchaseOrderDetailsSheet
        visible={detailVisible}
        loading={detailLoading}
        order={selected}
        onClose={closeDetail}
        onEdit={editOrder}
      />

      <OptionSheet
        visible={warehouseSheet}
        title="Select warehouse"
        options={["All warehouses", ...warehouseOptions.map((o) => o.name)]}
        selected={warehouse?.name ?? "All warehouses"}
        onSelect={(value) => {
          setWarehouse(
            value === "All warehouses"
              ? null
              : (warehouseOptions.find((o) => o.name === value) ?? null),
          );
          setPage(1);
          setWarehouseSheet(false);
        }}
        onClose={() => setWarehouseSheet(false)}
      />

      <ListLoadingOverlay visible={loading && data.items.length > 0} />
    </ThemedView>
  );
}

function OrderCard({
  order,
  onPress,
  onLongPress,
}: {
  order: PurchaseOrder;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const theme = useTheme();
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
              {order.status && <StatusBadge status={order.status} />}
              <View style={styles.flexSpacer} />
              <ThemedText type="smallBold" style={styles.cardTotal}>
                {formatMoney(order.totalAmount)}
              </ThemedText>
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
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </ThemedText>
          </View>
        </View>
      </ThemedView>
    </Pressable>
  );
}

function Pager({
  page,
  totalPages,
  onChange,
  theme,
}: {
  page: number;
  totalPages: number;
  onChange: (p: number) => void;
  theme: ReturnType<typeof useTheme>;
}) {
  if (totalPages <= 1) return null;

  return (
    <View style={styles.pager}>
      <PagerButton
        disabled={page === 1}
        onPress={() => onChange(page - 1)}
        theme={theme}
        icon="chevron-back"
      />
      <ThemedText type="smallBold" style={styles.pagerLabel}>
        Page {page} of {totalPages}
      </ThemedText>
      <PagerButton
        disabled={page === totalPages}
        onPress={() => onChange(page + 1)}
        theme={theme}
        icon="chevron-forward"
      />
    </View>
  );
}

function PagerButton({
  disabled,
  onPress,
  theme,
  icon,
}: {
  disabled: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
  icon: "chevron-back" | "chevron-forward";
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pagerItem,
        { borderColor: theme.backgroundElement },
        disabled && styles.pagerDisabled,
        pressed && styles.pressed,
      ]}
    >
      <Ionicons name={icon} size={16} color={theme.text} />
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
    alignItems: "center",
    gap: Spacing.two,
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
  pager: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: Spacing.two,
    paddingTop: Spacing.four,
  },
  pagerItem: {
    minWidth: 36,
    height: 36,
    paddingHorizontal: Spacing.one,
    borderRadius: Spacing.two,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pagerLabel: {
    marginHorizontal: Spacing.two,
  },
  pagerDisabled: {
    opacity: 0.4,
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
