import { useRouter, type Href } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

import { fetchBranchSales, type BranchSalesSummary } from "@/api/daily-sales";
import { fetchStockDashboard } from "@/api/dashboard";
import { getWarehouses, type ApiOption } from "@/api/purchase-orders";
import { HomeHeader } from "@/components/home-header";
import { SkeletonRows, SkeletonStatGrid } from "@/components/skeleton";
import { StatCard } from "@/components/stat-card";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { Branch } from "@/constants/branches";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/auth";
import type { DashboardData, LowStockItem } from "@/data/dashboard";
import { useResponsive } from "@/hooks/use-responsive";
import { useTheme } from "@/hooks/use-theme";

/** The single primary brand color used across the whole dashboard. */
const BRAND = "#232843";

const EMPTY_BRANCHES: Branch[] = [];

/** Preferred default source warehouse for a refill. */
const DEFAULT_WAREHOUSE = "ស្តុកធំ+online";

/** Local YYYY-MM-DD (avoids the UTC shift of toISOString). */
function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Yesterday — refills are based on the previous day's sales. */
function yesterday() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d;
}

type QuickAction = {
  key: string;
  label: string;
  icon: string;
  href: Href;
};

const QUICK_ACTIONS: QuickAction[] = [
  {
    key: "count",
    label: "Stock Count",
    icon: "list-outline",
    href: "/stock-count",
  },
  {
    key: "adjust",
    label: "Adjustment",
    icon: "create-outline",
    href: "/stock-adjustment",
  },
  {
    key: "transfer",
    label: "Transfer",
    icon: "swap-horizontal-outline",
    href: "/transfers",
  },
  {
    key: "on-hand",
    label: "On Hand",
    icon: "cube-outline",
    href: "/stock-on-hand",
  },
];

export default function HomeScreen() {
  const { session } = useAuth();
  const theme = useTheme();
  const router = useRouter();
  const { isTablet } = useResponsive();
  const branchId = session?.branch.id ?? "";
  const branches = session?.branches ?? EMPTY_BRANCHES;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [refillSales, setRefillSales] = useState<
    Record<string, BranchSalesSummary>
  >({});
  const [refillLoading, setRefillLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [source, setSource] = useState<ApiOption | null>(null);

  // Resolve the default source warehouse so a branch tap can jump straight
  // into its refill screen (mirrors the Stock Refill list default).
  useEffect(() => {
    let active = true;
    getWarehouses()
      .then((options) => {
        if (!active) return;
        const preferred =
          options.find((o) => o.name === DEFAULT_WAREHOUSE) ??
          options.find((o) => o.name.toLowerCase().includes("online"));
        setSource((prev) => prev ?? preferred ?? options[0] ?? null);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Dashboard stats / low-stock for the active branch.
  const loadDashboard = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchStockDashboard(branchId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load dashboard.");
    }
  }, [branchId]);

  // Yesterday's sales per branch, to surface which branches need a refill.
  const loadRefill = useCallback(async () => {
    const date = ymd(yesterday());
    const results = await Promise.all(
      branches.map(async (b) => {
        try {
          const res = await fetchBranchSales({ date, branchId: b.id });
          return [b.id, res.summary] as const;
        } catch {
          return [b.id, null] as const;
        }
      }),
    );
    const map: Record<string, BranchSalesSummary> = {};
    for (const [bid, summary] of results) if (summary) map[bid] = summary;
    setRefillSales(map);
  }, [branches]);

  // Re-fetch whenever the active branch changes (header / settings switch).
  useEffect(() => {
    setLoading(true);
    loadDashboard().finally(() => setLoading(false));
  }, [loadDashboard]);

  useEffect(() => {
    setRefillLoading(true);
    loadRefill().finally(() => setRefillLoading(false));
  }, [loadRefill]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    Promise.all([loadDashboard(), loadRefill()]).finally(() =>
      setRefreshing(false),
    );
  }, [loadDashboard, loadRefill]);

  // Tapping a branch jumps straight into its refill screen for yesterday's
  // sales. With no sales, prompt the user to create a stock transfer instead.
  function openBranchRefill(branch: Branch) {
    const summary = refillSales[branch.id];
    const sold = summary && summary.itemCount > 0;
    if (!sold) {
      Alert.alert(
        "No sales yesterday",
        `${branch.name || `Branch ${branch.id}`} had no sales yesterday. Please create a stock transfer instead.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Create transfer",
            onPress: () =>
              router.push({ pathname: "/transfer/[id]", params: { id: "new" } }),
          },
        ],
      );
      return;
    }
    if (!source) {
      // Warehouses still loading — fall back to the refill list.
      router.push("/stock-refill");
      return;
    }
    router.push({
      pathname: "/stock-refill/[branchId]",
      params: {
        branchId: branch.id,
        branchName: branch.name,
        // Branches map 1:1 to a warehouse with the same id in this backend.
        warehouseId: branch.id,
        date: ymd(yesterday()),
        sourceId: source.id,
        sourceName: source.name,
      },
    });
  }

  return (
    <ThemedView style={styles.container}>
      <HomeHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textSecondary}
            colors={[theme.tint]}
          />
        }
      >
        <ThemedText type="small" themeColor="textSecondary">
          Welcome back{session ? `, ${session.username}` : ""} — here&apos;s
          today&apos;s overview.
        </ThemedText>

        <RefillHero />

        {error ? (
          <ThemedView type="backgroundElement" style={styles.errorCard}>
            <Ionicons
              name="cloud-offline-outline"
              size={28}
              color={theme.textSecondary}
            />
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={styles.errorText}
            >
              {error}
            </ThemedText>
          </ThemedView>
        ) : (
          <>
            {loading || !data ? (
              <SkeletonStatGrid />
            ) : (
              <View style={styles.statsGrid}>
                {data.stats.map((stat) => (
                  <StatCard key={stat.key} stat={stat} />
                ))}
              </View>
            )}

            <SectionHeader title="Quick actions" />
            <View style={styles.quickActions}>
              {QUICK_ACTIONS.map((action) => (
                <QuickActionButton key={action.key} action={action} />
              ))}
            </View>

            <View style={[styles.bottomRow, isTablet && styles.bottomRowTablet]}>
              <View style={[styles.bottomCol, isTablet && styles.bottomColTablet]}>
                <SectionHeader title="Low stock alerts" actionLabel="See all" />
                <ThemedView type="backgroundElement" style={styles.list}>
                  {loading || !data ? (
                    <SkeletonRows count={3} />
                  ) : data.lowStock.length === 0 ? (
                    <EmptyRow icon="checkmark-circle-outline" text="No low stock alerts." />
                  ) : (
                    data.lowStock.map((item, index) => (
                      <LowStockRow key={item.id} item={item} divider={index > 0} />
                    ))
                  )}
                </ThemedView>
              </View>

              <View style={[styles.bottomCol, isTablet && styles.bottomColTablet]}>
                <SectionHeader title="Branches to refill" actionLabel="See all" />
                <ThemedView type="backgroundElement" style={styles.list}>
                  {loading ? (
                    <SkeletonRows count={3} />
                  ) : branches.length === 0 ? (
                    <EmptyRow
                      icon="storefront-outline"
                      text="No branches available."
                    />
                  ) : (
                    branches.map((branch, index) => (
                      <RefillRow
                        key={`${branch.id}-${index}`}
                        branch={branch}
                        summary={refillSales[branch.id]}
                        loading={refillLoading}
                        divider={index > 0}
                        onPress={() => openBranchRefill(branch)}
                      />
                    ))
                  )}
                </ThemedView>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </ThemedView>
  );
}

/** Prominent primary CTA for the stock user's main daily task. */
function RefillHero() {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push("/stock-refill")}
      accessibilityLabel="Stock Refill"
      style={({ pressed }) => [styles.hero, pressed && styles.pressed]}
    >
      <View style={styles.heroIcon}>
        <Ionicons name="repeat-outline" size={26} color="#ffffff" />
      </View>
      <View style={styles.heroText}>
        <ThemedText style={styles.heroTitle}>Stock Refill</ThemedText>
        <ThemedText style={styles.heroSubtitle} numberOfLines={1}>
          Refill branches by daily sales
        </ThemedText>
      </View>
      <Ionicons name="chevron-forward" size={22} color="#ffffff" />
    </Pressable>
  );
}

function QuickActionButton({ action }: { action: QuickAction }) {
  const router = useRouter();
  const theme = useTheme();
  const iconName = action.icon as React.ComponentProps<typeof Ionicons>["name"];
  return (
    <Pressable
      onPress={() => router.push(action.href)}
      accessibilityLabel={action.label}
      style={({ pressed }) => [styles.quickAction, pressed && styles.pressed]}
    >
      <View style={[styles.quickIcon, { backgroundColor: theme.tintSoft }]}>
        <Ionicons name={iconName} size={24} color={theme.tint} />
      </View>
      <ThemedText type="small" numberOfLines={2} style={styles.quickLabel}>
        {action.label}
      </ThemedText>
    </Pressable>
  );
}

function SectionHeader({
  title,
  actionLabel,
}: {
  title: string;
  actionLabel?: string;
}) {
  const theme = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <ThemedText type="smallBold" style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {actionLabel ? (
        <Pressable
          hitSlop={Spacing.two}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <ThemedText type="link" style={{ color: theme.tint }}>
            {actionLabel}
          </ThemedText>
        </Pressable>
      ) : null}
    </View>
  );
}

function EmptyRow({ icon, text }: { icon: string; text: string }) {
  const theme = useTheme();
  const iconName = icon as React.ComponentProps<typeof Ionicons>["name"];
  return (
    <View style={styles.emptyRow}>
      <Ionicons name={iconName} size={18} color={theme.textSecondary} />
      <ThemedText type="small" themeColor="textSecondary">
        {text}
      </ThemedText>
    </View>
  );
}

function LowStockRow({
  item,
  divider,
}: {
  item: LowStockItem;
  divider: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.row,
        divider && { borderTopColor: theme.background, borderTopWidth: 1 },
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: theme.tintSoft }]}>
        <Ionicons name="cube-outline" size={20} color={theme.tint} />
      </View>
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {item.name}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {item.sku}
        </ThemedText>
      </View>
      <View style={styles.rowRight}>
        <ThemedText type="smallBold">{item.qty} left</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          min {item.reorderLevel}
        </ThemedText>
      </View>
    </View>
  );
}

function RefillRow({
  branch,
  summary,
  loading,
  divider,
  onPress,
}: {
  branch: Branch;
  summary?: BranchSalesSummary;
  loading: boolean;
  divider: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  const sold = summary && summary.itemCount > 0;
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`Refill ${branch.name}`}
      style={({ pressed }) => [
        styles.row,
        divider && { borderTopColor: theme.background, borderTopWidth: 1 },
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.rowIcon, { backgroundColor: theme.tintSoft }]}>
        <Ionicons name="storefront-outline" size={20} color={theme.tint} />
      </View>
      <View style={styles.rowText}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {branch.name || `Branch ${branch.id}`}
        </ThemedText>
        {loading && !summary ? (
          <ThemedText type="small" themeColor="textSecondary">
            Loading sales…
          </ThemedText>
        ) : sold ? (
          <ThemedText type="small" themeColor="textSecondary">
            {summary!.itemCount} {summary!.itemCount === 1 ? "item" : "items"} ·{" "}
            {summary!.totalQty} sold yesterday
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            No sales yesterday
          </ThemedText>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  body: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
    width: "100%",
    maxWidth: MaxContentWidth,
    alignSelf: "center",
  },
  hero: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    backgroundColor: BRAND,
    borderRadius: Spacing.four,
    padding: Spacing.three,
  },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  heroText: {
    flex: 1,
    gap: Spacing.half,
  },
  heroTitle: {
    color: "#ffffff",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "700",
  },
  heroSubtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 13,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: Spacing.three,
  },
  // Bottom lists stack on phones, sit side-by-side on tablets.
  bottomRow: {
    gap: Spacing.three,
  },
  bottomRowTablet: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  bottomCol: {
    gap: Spacing.three,
  },
  bottomColTablet: {
    flex: 1,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: Spacing.six,
  },
  errorCard: {
    borderRadius: Spacing.three,
    alignItems: "center",
    justifyContent: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  errorText: {
    textAlign: "center",
  },
  emptyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.two,
    paddingVertical: Spacing.three,
  },
  quickActions: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  quickAction: {
    alignItems: "center",
    gap: Spacing.two,
    flex: 1,
  },
  quickIcon: {
    width: 52,
    height: 52,
    borderRadius: Spacing.four,
    alignItems: "center",
    justifyContent: "center",
  },
  quickLabel: {
    textAlign: "center",
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: Spacing.one,
  },
  sectionTitle: {
    fontSize: 16,
  },
  list: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  rowRight: {
    alignItems: "flex-end",
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
