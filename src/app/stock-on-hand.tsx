import { Image } from "expo-image";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

import { getWarehouses, type ApiOption } from "@/api/purchase-orders";
import {
  fetchStockOnHand,
  fetchStockOnHandSummary,
  type StockOnHandItem,
  type StockOnHandSummary,
} from "@/api/stock-on-hand";
import { ListLoadingOverlay } from "@/components/list-loading-overlay";
import { OptionSheet } from "@/components/option-sheet";
import { ScreenHeader } from "@/components/screen-header";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/auth";
import type { Stat } from "@/data/dashboard";
import { formatMoney } from "@/data/inventory";
import { useTheme } from "@/hooks/use-theme";

const BRAND = "#232843";
const ALL_WAREHOUSES = "All warehouses";
const ALL_CATEGORIES = "All categories";

function withThousands(n: number) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function summaryStats(s: StockOnHandSummary): Stat[] {
  return [
    {
      key: "items",
      label: "Total Items",
      value: withThousands(s.totalItems),
      icon: "cube-outline",
      tone: "brand",
    },
    {
      key: "qty",
      label: "Stock Units",
      value: withThousands(s.totalQty),
      icon: "layers-outline",
      tone: "brand",
    },
    {
      key: "value",
      label: "Stock Value",
      value: formatMoney(s.stockValue),
      icon: "cash-outline",
      tone: "success",
    },
    {
      key: "retail",
      label: "Retail Value",
      value: formatMoney(s.retailValue),
      icon: "pricetags-outline",
      tone: "success",
    },
    {
      key: "low",
      label: "Low Stock",
      value: withThousands(s.lowStock),
      icon: "alert-circle-outline",
      tone: "warning",
    },
    {
      key: "out",
      label: "Out of Stock",
      value: withThousands(s.outOfStock),
      icon: "close-circle-outline",
      tone: "danger",
    },
  ];
}

export default function StockOnHandScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const branchId = session?.branch.id;

  const [search, setSearch] = useState("");
  const [warehouse, setWarehouse] = useState<ApiOption | null>(null);
  const [warehouseOptions, setWarehouseOptions] = useState<ApiOption[]>([]);
  const [warehouseSheet, setWarehouseSheet] = useState(false);
  const [category, setCategory] = useState<ApiOption | null>(null);
  // Accumulated from loaded rows; never shrinks so filtering keeps all options.
  const [categoryOptions, setCategoryOptions] = useState<ApiOption[]>([]);
  const [categorySheet, setCategorySheet] = useState(false);
  const [inStock, setInStock] = useState(true);

  const [items, setItems] = useState<StockOnHandItem[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<StockOnHandSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const warehouseId = warehouse?.id;
  const categoryId = category?.id;

  // Warehouse dropdown options; default the filter to the first warehouse.
  useEffect(() => {
    getWarehouses()
      .then((options) => {
        setWarehouseOptions(options);
        setWarehouse((prev) => prev ?? options[0] ?? null);
      })
      .catch(() => {});
  }, []);

  // Summary totals (re-fetch when the warehouse changes).
  useEffect(() => {
    let active = true;
    fetchStockOnHandSummary({ warehouseId, branchId })
      .then((s) => {
        if (active) setSummary(s);
      })
      .catch(() => {
        if (active) setSummary(null);
      });
    return () => {
      active = false;
    };
  }, [warehouseId, branchId]);

  const load = useCallback(
    async (q: string, nextPage: number, append: boolean) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await fetchStockOnHand({
          page: nextPage,
          search: q,
          warehouseId,
          categoryId,
          branchId,
          inStock,
        });
        if (id !== requestId.current) return;
        setItems((prev) =>
          append ? [...prev, ...result.items] : result.items,
        );
        setPage(result.page);
        setLastPage(result.lastPage);
        setTotal(result.total);
        // Collect any new categories seen in this page.
        setCategoryOptions((prev) => {
          const map = new Map(prev.map((o) => [o.id, o]));
          for (const it of result.items) {
            if (it.categoryId && it.category && !map.has(it.categoryId)) {
              map.set(it.categoryId, { id: it.categoryId, name: it.category });
            }
          }
          return map.size === prev.length ? prev : [...map.values()];
        });
      } catch (e) {
        if (id === requestId.current && !append) {
          setError(
            e instanceof Error ? e.message : "Failed to load stock on hand.",
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
    [warehouseId, categoryId, branchId, inStock],
  );

  // Initial load + debounced search; reloads on filter changes.
  useEffect(() => {
    const t = setTimeout(() => load(search, 1, false), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  function loadMore() {
    if (loading || loadingMore || page >= lastPage) return;
    load(search, page + 1, true);
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([
      load(search, 1, false),
      fetchStockOnHandSummary({ warehouseId, branchId })
        .then(setSummary)
        .catch(() => {}),
    ]).finally(() => setRefreshing(false));
  }, [load, search, warehouseId, branchId]);

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Stock on Hand"
        subtitle={`${total} ${total === 1 ? "item" : "items"}`}
        onBack={() => router.back()}
      />

      <View style={styles.controls}>
        <View style={styles.filterRow}>
          <Pressable
            onPress={() => setWarehouseSheet(true)}
            style={({ pressed }) => [styles.flex, pressed && styles.pressed]}
          >
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
                {warehouse?.name ?? ALL_WAREHOUSES}
              </ThemedText>
              <Ionicons
                name="chevron-down"
                size={18}
                color={theme.textSecondary}
              />
            </ThemedView>
          </Pressable>

          <Pressable
            onPress={() => setCategorySheet(true)}
            style={({ pressed }) => [styles.flex, pressed && styles.pressed]}
          >
            <ThemedView type="backgroundElement" style={styles.selectBox}>
              <Ionicons
                name="pricetag-outline"
                size={18}
                color={theme.textSecondary}
              />
              <ThemedText
                numberOfLines={1}
                style={[
                  styles.selectValue,
                  { color: category ? theme.text : theme.textSecondary },
                ]}
              >
                {category?.name ?? ALL_CATEGORIES}
              </ThemedText>
              <Ionicons
                name="chevron-down"
                size={18}
                color={theme.textSecondary}
              />
            </ThemedView>
          </Pressable>
        </View>

        <View style={styles.filterRow}>
          <ThemedView type="backgroundElement" style={styles.searchBar}>
            <Ionicons name="search" size={18} color={theme.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search item"
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

          <Pressable
            onPress={() => setInStock((v) => !v)}
            style={({ pressed }) => [
              styles.toggle,
              { backgroundColor: inStock ? BRAND : theme.backgroundElement },
              pressed && styles.pressed,
            ]}
          >
            <Ionicons
              name={inStock ? "checkmark-circle" : "ellipse-outline"}
              size={16}
              color={inStock ? "#ffffff" : theme.textSecondary}
            />
            <ThemedText
              type="small"
              style={
                inStock
                  ? styles.toggleActiveText
                  : { color: theme.textSecondary }
              }
            >
              In stock
            </ThemedText>
          </Pressable>
        </View>
      </View>

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
        // ListHeaderComponent={
        //   summary ? (
        //     <View style={styles.statsGrid}>
        //       {summaryStats(summary).map((stat) => (
        //         <StatCard key={stat.key} stat={stat} />
        //       ))}
        //     </View>
        //   ) : null
        // }
        renderItem={({ item }) => <ItemCard item={item} theme={theme} />}
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
              {error ?? "No items found."}
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

      <OptionSheet
        visible={warehouseSheet}
        title="Select warehouse"
        options={[ALL_WAREHOUSES, ...warehouseOptions.map((o) => o.name)]}
        selected={warehouse?.name ?? ALL_WAREHOUSES}
        onSelect={(value) => {
          setWarehouse(
            value === ALL_WAREHOUSES
              ? null
              : (warehouseOptions.find((o) => o.name === value) ?? null),
          );
          setWarehouseSheet(false);
        }}
        onClose={() => setWarehouseSheet(false)}
      />

      <OptionSheet
        visible={categorySheet}
        title="Select category"
        options={[ALL_CATEGORIES, ...categoryOptions.map((o) => o.name)]}
        selected={category?.name ?? ALL_CATEGORIES}
        onSelect={(value) => {
          setCategory(
            value === ALL_CATEGORIES
              ? null
              : (categoryOptions.find((o) => o.name === value) ?? null),
          );
          setCategorySheet(false);
        }}
        onClose={() => setCategorySheet(false)}
      />

      <ListLoadingOverlay visible={loading && items.length > 0} />
    </ThemedView>
  );
}

function ItemCard({
  item,
  theme,
}: {
  item: StockOnHandItem;
  theme: ReturnType<typeof useTheme>;
}) {
  const out = item.qty <= 0;
  const qtyColor = out ? "#e5484d" : "#30A46C";

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={[styles.iconTile, { backgroundColor: `${BRAND}1A` }]}>
        {item.image ? (
          <Image
            source={{ uri: item.image }}
            style={styles.iconTileImage}
            contentFit="cover"
          />
        ) : (
          <Ionicons name="cube-outline" size={22} color={BRAND} />
        )}
      </View>
      <View style={styles.cardMain}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {item.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {item.code}
          {item.category ? ` · ${item.category}` : ""}
        </ThemedText>
        {item.value > 0 ? (
          <ThemedText type="small" themeColor="textSecondary">
            Price: {formatMoney(item.price)}
          </ThemedText>
        ) : null}
      </View>
      <View style={styles.qtyWrap}>
        <ThemedText type="smallBold" style={{ color: qtyColor, fontSize: 18 }}>
          {withThousands(item.qty)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          On hand
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  controls: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
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
  filterRow: {
    flexDirection: "row",
    gap: Spacing.two,
  },
  searchBar: {
    flex: 1,
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
  toggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    height: 46,
    borderRadius: Spacing.three,
  },
  toggleActiveText: {
    color: "#ffffff",
    fontWeight: "700",
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: Spacing.three,
    marginBottom: Spacing.three,
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
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  iconTile: {
    width: 46,
    height: 46,
    borderRadius: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  iconTileImage: {
    width: "100%",
    height: "100%",
  },
  cardMain: {
    flex: 1,
  },
  qtyWrap: {
    alignItems: "flex-end",
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
