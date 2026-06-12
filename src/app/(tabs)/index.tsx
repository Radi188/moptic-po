import { useRouter, type Href } from "expo-router";
import { useEffect, useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";
import Ionicons from "react-native-vector-icons/Ionicons";

import { fetchBranchSales, type BranchSalesSummary } from "@/api/daily-sales";
import { fetchStockDashboard } from "@/api/dashboard";
import { HomeHeader } from "@/components/home-header";
import { SkeletonRows, SkeletonStatGrid } from "@/components/skeleton";
import { StatCard } from "@/components/stat-card";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";
import type { Branch } from "@/constants/branches";
import { BottomTabInset, MaxContentWidth, Spacing } from "@/constants/theme";
import { useAuth } from "@/contexts/auth";
import type { DashboardData, LowStockItem } from "@/data/dashboard";
import { useTheme } from "@/hooks/use-theme";

/** The single primary brand color used across the whole dashboard. */
const BRAND = "#232843";

const EMPTY_BRANCHES: Branch[] = [];

/** Local YYYY-MM-DD (avoids the UTC shift of toISOString). */
function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
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
  const branchId = session?.branch.id ?? "";
  const branches = session?.branches ?? EMPTY_BRANCHES;

  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [refillSales, setRefillSales] = useState<
    Record<string, BranchSalesSummary>
  >({});
  const [refillLoading, setRefillLoading] = useState(true);

  // Re-fetch whenever the active branch changes (header / settings switch).
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchStockDashboard(branchId)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active)
          setError(
            e instanceof Error ? e.message : "Failed to load dashboard.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branchId]);

  // Yesterday's sales per branch, to surface which branches need a refill.
  useEffect(() => {
    let active = true;
    setRefillLoading(true);
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const date = ymd(yesterday);
    Promise.all(
      branches.map(async (b) => {
        try {
          const res = await fetchBranchSales({ date, branchId: b.id });
          return [b.id, res.summary] as const;
        } catch {
          return [b.id, null] as const;
        }
      }),
    )
      .then((results) => {
        if (!active) return;
        const map: Record<string, BranchSalesSummary> = {};
        for (const [bid, summary] of results) if (summary) map[bid] = summary;
        setRefillSales(map);
      })
      .finally(() => {
        if (active) setRefillLoading(false);
      });
    return () => {
      active = false;
    };
  }, [branches]);

  return (
    <ThemedView style={styles.container}>
      <HomeHeader />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
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
                    key={branch.id}
                    branch={branch}
                    summary={refillSales[branch.id]}
                    loading={refillLoading}
                    divider={index > 0}
                  />
                ))
              )}
            </ThemedView>
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
}: {
  branch: Branch;
  summary?: BranchSalesSummary;
  loading: boolean;
  divider: boolean;
}) {
  const router = useRouter();
  const theme = useTheme();
  const sold = summary && summary.itemCount > 0;
  return (
    <Pressable
      onPress={() => router.push("/stock-refill")}
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
