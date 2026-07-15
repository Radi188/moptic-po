import { Image } from "expo-image";
import { useFocusEffect, useRouter } from "expo-router";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "react-native-vector-icons/Ionicons";

import { fetchInventory } from "@/api/inventory";
import { ListLoadingOverlay } from "@/components/list-loading-overlay";
import { ProductDetailsSheet } from "@/components/product-details-sheet";
import { SkeletonList } from "@/components/skeleton";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useTranslation } from "@/contexts/i18n";
import {
  deleteProduct,
  formatMoney,
  type InventoryProduct,
} from "@/data/inventory";
import { useResponsive } from "@/hooks/use-responsive";
import { useTheme } from "@/hooks/use-theme";

const BRAND = "#232843";

export default function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { t, language } = useTranslation();
  const km = language === "km";
  const { isTablet } = useResponsive();

  const [search, setSearch] = useState("");
  const [items, setItems] = useState<InventoryProduct[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<InventoryProduct | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (q: string, nextPage: number, append: boolean, reset = false) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
        // Clear the current rows so the skeleton shows while a fresh result
        // loads (e.g. after clearing the search to get all items back).
        if (reset) setItems([]);
      }
      try {
        const result = await fetchInventory({ page: nextPage, search: q });
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
            e instanceof Error ? e.message : t("inventory.loadError"),
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
    [t],
  );

  // Initial load + debounced search; reloads when the active branch changes.
  // `reset` clears the list first so the skeleton shows on a fresh search.
  useEffect(() => {
    const t = setTimeout(() => load(search, 1, false, true), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, load]);

  // Refresh when the tab regains focus (e.g. after creating/editing a product
  // on the form screen), skipping the very first focus to avoid double-loading
  // alongside the mount effect above.
  const firstFocus = useRef(true);
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

  function newProduct() {
    router.push({ pathname: "/inventory-item/[id]", params: { id: "new" } });
  }

  function editProduct(product: InventoryProduct) {
    setSelected(null);
    // Pass the row we already have so the form doesn't have to re-fetch it (the
    // list comes from the API, not the local store the form used to read).
    router.push({
      pathname: "/inventory-item/[id]",
      params: { id: product.id, product: JSON.stringify(product) },
    });
  }

  function removeProduct(id: string) {
    deleteProduct(id);
    setSelected(null);
    setItems((prev) => prev.filter((p) => p.id !== id));
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
            {t("inventory.title")}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t("inventory.productCount", { count: total })}
          </ThemedText>
        </View>
        <Pressable
          onPress={newProduct}
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}
        >
          <Ionicons name="add" size={20} color="#ffffff" />
          <ThemedText style={styles.newButtonText}>{t("inventory.new")}</ThemedText>
        </Pressable>
      </View>

      <View style={styles.controls}>
        <ThemedView type="backgroundElement" style={styles.searchBar}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t("inventory.searchPlaceholder")}
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
      </View>

      <FlatList
        data={items}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        key={isTablet ? "grid" : "list"}
        numColumns={isTablet ? 2 : 1}
        columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
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
            <ProductCard
              product={item}
              onPress={() => setSelected(item)}
              onLongPress={() => editProduct(item)}
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
              {error ?? t("inventory.empty")}
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

      <ProductDetailsSheet
        product={selected}
        onClose={() => setSelected(null)}
        onEdit={editProduct}
        onDelete={removeProduct}
      />

      <ListLoadingOverlay visible={loading && items.length > 0} />
    </ThemedView>
  );
}

function ProductCard({
  product,
  onPress,
  onLongPress,
}: {
  product: InventoryProduct;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => pressed && styles.pressed}
    >
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.iconTile, { backgroundColor: theme.tintSoft }]}>
            {product.thumbnail ? (
              <Image
                source={{ uri: product.thumbnail }}
                style={styles.iconTileImage}
                contentFit="cover"
              />
            ) : (
              <Ionicons name="cube-outline" size={22} color={theme.tint} />
            )}
          </View>
          <View style={styles.cardMain}>
            <View style={styles.refRow}>
              <ThemedText
                type="smallBold"
                numberOfLines={1}
                style={styles.nameText}
              >
                {product.name}
              </ThemedText>
              <View style={styles.flexSpacer} />
              <ThemedText type="smallBold" style={styles.price}>
                {formatMoney(product.price)}
              </ThemedText>
            </View>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              numberOfLines={1}
            >
              {product.code}
            </ThemedText>
          </View>
        </View>

        {/* <View style={[styles.cardFooter, { borderTopColor: theme.background }]}>
          <View style={styles.inlineRow}>
            <Ionicons
              name="pricetag-outline"
              size={13}
              color={theme.textSecondary}
            />
            <ThemedText type="small" themeColor="textSecondary">
              {product.category || "—"}
            </ThemedText>
          </View>
        </View> */}
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
    overflow: "hidden",
  },
  iconTileImage: {
    width: "100%",
    height: "100%",
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
  nameText: {
    flexShrink: 1,
  },
  flexSpacer: {
    flex: 1,
  },
  price: {
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
  pressed: {
    opacity: 0.7,
  },
});
