import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
import { useFocusEffect, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

import {
  fetchStockAdjustments,
  type StockAdjustment,
} from "@/api/stock-adjustments";
import { ListLoadingOverlay } from "@/components/list-loading-overlay";
import { ScreenHeader } from "@/components/screen-header";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/auth";
import { useTheme } from "@/hooks/use-theme";

const BRAND = "#232843";
const INCREASE = "#30A46C";
const DECREASE = "#e5484d";

function formatDateTime(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

/** Local YYYY-MM-DD (avoids the UTC shift of toISOString). */
function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function StockAdjustmentListScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const branchId = session?.branch.id;

  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [dateTo, setDateTo] = useState(() => new Date());
  const [datePicker, setDatePicker] = useState<"from" | "to" | null>(null);
  const [tempDate, setTempDate] = useState(() => new Date());
  const [items, setItems] = useState<StockAdjustment[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const firstFocus = useRef(true);

  const load = useCallback(
    async (q: string, nextPage: number, append: boolean) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await fetchStockAdjustments({
          page: nextPage,
          search: q,
          branchId,
          dateFrom: ymd(dateFrom),
          dateTo: ymd(dateTo),
        });
        if (id !== requestId.current) return;
        setItems((prev) =>
          append ? [...prev, ...result.items] : result.items,
        );
        setPage(result.page);
        setLastPage(result.lastPage);
        setTotal(result.total);
      } catch (e) {
        if (id === requestId.current && !append) {
          setError(
            e instanceof Error ? e.message : "Failed to load adjustments.",
          );
          setItems([]);
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [branchId, dateFrom, dateTo],
  );

  // Initial load + debounced search. Reloads when returning from the form too.
  useEffect(() => {
    const t = setTimeout(() => load(search, 1, false), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  // Reload when returning to the list (e.g. after creating an adjustment),
  // skipping the very first focus since the effect above already loaded.
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      load(search, 1, false);
    }, [load, search]),
  );

  function loadMore() {
    if (loading || loadingMore || page >= lastPage) return;
    load(search, page + 1, true);
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(search, 1, false).finally(() => setRefreshing(false));
  }, [load, search]);

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
  }

  // iOS: apply the temp value picked in the modal.
  function confirmDate() {
    if (datePicker === "from") setDateFrom(tempDate);
    else if (datePicker === "to") setDateTo(tempDate);
    setDatePicker(null);
  }

  function newAdjustment() {
    router.push({ pathname: "/stock-adjustment/[id]", params: { id: "new" } });
  }

  function openAdjustment(id: string) {
    router.push({ pathname: "/stock-adjustment/[id]", params: { id } });
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Stock Adjustment"
        subtitle={`${total} ${total === 1 ? "record" : "records"}`}
        onBack={() => router.back()}
        right={
          <Pressable
            onPress={newAdjustment}
            style={({ pressed }) => [
              styles.newButton,
              pressed && styles.pressed,
            ]}
          >
            <Ionicons name="add" size={20} color="#ffffff" />
            <ThemedText style={styles.newButtonText}>New</ThemedText>
          </Pressable>
        }
      />

      <View style={styles.controls}>
        <ThemedView type="backgroundElement" style={styles.searchBar}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search item or reference"
            placeholderTextColor={theme.textSecondary}
            autoCapitalize="none"
            autoCorrect={false}
            style={[styles.searchInput, { color: theme.text }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={Spacing.two}>
              <Ionicons
                name="close-circle"
                size={18}
                color={theme.textSecondary}
              />
            </Pressable>
          )}
        </ThemedView>

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
                {formatDate(dateFrom)}
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
                {formatDate(dateTo)}
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
          <Pressable
            style={styles.dateBackdrop}
            onPress={() => setDatePicker(null)}
          >
            <Pressable onPress={(e) => e.stopPropagation()}>
              <ThemedView style={styles.datePickerCard}>
                <View style={styles.datePickerHeader}>
                  <Pressable
                    onPress={() => setDatePicker(null)}
                    hitSlop={Spacing.two}
                  >
                    <ThemedText type="small" themeColor="textSecondary">
                      Cancel
                    </ThemedText>
                  </Pressable>
                  <ThemedText type="smallBold">
                    {datePicker === "from" ? "Date From" : "Date To"}
                  </ThemedText>
                  <Pressable onPress={confirmDate} hitSlop={Spacing.two}>
                    <ThemedText type="smallBold" style={{ color: BRAND }}>
                      Done
                    </ThemedText>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="inline"
                  themeVariant={
                    theme.background === "#000000" ? "dark" : "light"
                  }
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
        keyExtractor={(item, index) => `${item.id}-${index}`}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textSecondary}
            colors={[BRAND]}
          />
        }
        renderItem={({ item }) => (
          <AdjustmentCard
            adjustment={item}
            onPress={() => openAdjustment(item.id)}
            theme={theme}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={BRAND} />
            </View>
          ) : (
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.empty}
            >
              {error ?? "No stock adjustments yet."}
            </ThemedText>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={theme.textSecondary} />
            </View>
          ) : null
        }
      />

      <ListLoadingOverlay visible={loading && items.length > 0} />
    </ThemedView>
  );
}

function AdjustmentCard({
  adjustment,
  onPress,
  theme,
}: {
  adjustment: StockAdjustment;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const increase = adjustment.adjustType === "increase";
  const color = increase ? INCREASE : DECREASE;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.iconTile, { backgroundColor: `${color}1A` }]}>
            <Ionicons
              name={increase ? "trending-up" : "trending-down"}
              size={22}
              color={color}
            />
          </View>
          <View style={styles.cardMain}>
            <View style={styles.refRow}>
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={styles.refText}
              >
                {adjustment.itemName || adjustment.reference}
              </ThemedText>
              <ThemedText type="smallBold" style={{ color }}>
                {increase ? "+" : "−"}
                {adjustment.qty}
              </ThemedText>
            </View>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              numberOfLines={1}
            >
              {adjustment.itemCode || adjustment.reference}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.cardFooter, { borderTopColor: theme.background }]}>
          <View style={styles.inlineRow}>
            <Ionicons
              name="receipt-outline"
              size={13}
              color={theme.textSecondary}
            />
            <ThemedText
              type="small"
              themeColor="textSecondary"
              numberOfLines={1}
            >
              {adjustment.reference}
            </ThemedText>
          </View>
          <View style={styles.inlineRow}>
            <Ionicons
              name="calendar-outline"
              size={13}
              color={theme.textSecondary}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {formatDateTime(adjustment.date)}
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
    paddingBottom: Spacing.three,
    gap: Spacing.three,
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
  dateRow: {
    flexDirection: "row",
    gap: Spacing.three,
  },
  dateCol: {
    flex: 1,
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
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
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
  footer: {
    paddingVertical: Spacing.three,
    alignItems: "center",
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
    justifyContent: "space-between",
    gap: Spacing.two,
  },
  refText: {
    flex: 1,
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
  pressed: {
    opacity: 0.7,
  },
});
