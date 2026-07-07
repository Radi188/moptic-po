import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {
  fetchSalesSummary,
  type SaleSummaryCategory,
  type SaleSummaryItem,
  type SaleSummaryTotals,
} from '@/api/sales-summary';
import { BranchPickerSheet } from '@/components/branch-picker-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { SkeletonList, SkeletonStatGrid } from '@/components/skeleton';
import { StatCard } from '@/components/stat-card';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import type { Branch } from '@/constants/branches';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import type { Stat } from '@/data/dashboard';
import { formatDate } from '@/data/purchase-orders';
import { useTheme } from '@/hooks/use-theme';

function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function withThousands(n: number) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function summaryStats(s: SaleSummaryTotals): Stat[] {
  return [
    { key: 'invoices', label: 'Invoices', value: withThousands(s.totalInvoices), icon: 'receipt-outline', tone: 'brand' },
    { key: 'qty', label: 'Qty Sold', value: withThousands(s.totalQty), icon: 'layers-outline', tone: 'brand' },
    { key: 'items', label: 'Items', value: withThousands(s.itemCount), icon: 'cube-outline', tone: 'brand' },
    {
      key: 'categories',
      label: 'Categories',
      value: withThousands(s.categoryCount),
      icon: 'pricetags-outline',
      tone: 'brand',
    },
  ];
}

export default function SaleSummaryReportScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();

  const [branch, setBranch] = useState<Branch | null>(session?.branch ?? null);
  const [branchSheet, setBranchSheet] = useState(false);

  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return d;
  });
  const [dateTo, setDateTo] = useState(() => new Date());
  const [datePicker, setDatePicker] = useState<'from' | 'to' | null>(null);
  const [tempDate, setTempDate] = useState(() => new Date());

  const [search, setSearch] = useState('');
  const [categories, setCategories] = useState<SaleSummaryCategory[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<SaleSummaryTotals | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (from: Date, to: Date, branchId: string | undefined, q: string) => {
      setLoading(true);
      setError(null);
      try {
        const report = await fetchSalesSummary({
          dateFrom: ymd(from),
          dateTo: ymd(to),
          branchId,
          search: q,
        });
        setCategories(report.categories);
        setSummary(report.summary);
        // A search narrows the result set enough that expanding everything
        // by default is more useful than making the user open each category.
        setExpanded(q ? new Set(report.categories.map((c) => c.categoryId)) : new Set());
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load report.');
        setCategories([]);
        setSummary(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  function toggleCategory(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Initial load + debounced search; reloads immediately on date/branch changes.
  useEffect(() => {
    const t = setTimeout(() => load(dateFrom, dateTo, branch?.id, search), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [dateFrom, dateTo, branch, search, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(dateFrom, dateTo, branch?.id, search).finally(() => setRefreshing(false));
  }, [load, dateFrom, dateTo, branch, search]);

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
      <ScreenHeader title="Sale Summary Report" subtitle="Sales by item" onBack={() => router.back()} />

      <View style={styles.filters}>
        <View style={styles.dateRow}>
          <DateField
            label="From"
            value={formatDate(dateFrom.toISOString())}
            onPress={() => openDatePicker('from')}
            theme={theme}
          />
          <DateField
            label="To"
            value={formatDate(dateTo.toISOString())}
            onPress={() => openDatePicker('to')}
            theme={theme}
          />
        </View>

        <Pressable onPress={() => setBranchSheet(true)} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={styles.selectBox}>
            <Ionicons name="business-outline" size={18} color={theme.textSecondary} />
            <ThemedText numberOfLines={1} style={[styles.selectValue, { color: theme.text }]}>
              {branch?.name ?? 'All branches'}
            </ThemedText>
            <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
          </ThemedView>
        </Pressable>

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
            <Pressable onPress={() => setSearch('')} hitSlop={Spacing.two}>
              <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
            </Pressable>
          )}
        </ThemedView>
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
        <Modal
          visible={datePicker !== null}
          transparent
          animationType="fade"
          onRequestClose={() => setDatePicker(null)}>
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
                    {datePicker === 'from' ? 'Date From' : 'Date To'}
                  </ThemedText>
                  <Pressable
                    onPress={() => {
                      if (datePicker === 'from') setDateFrom(tempDate);
                      else if (datePicker === 'to') setDateTo(tempDate);
                      setDatePicker(null);
                    }}
                    hitSlop={Spacing.two}>
                    <ThemedText type="smallBold" style={{ color: theme.tint }}>
                      Done
                    </ThemedText>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={tempDate}
                  mode="date"
                  display="inline"
                  themeVariant={theme.background !== '#ffffff' ? 'dark' : 'light'}
                  onChange={(_e, selected) => {
                    if (selected) setTempDate(selected);
                  }}
                />
              </ThemedView>
            </Pressable>
          </Pressable>
        </Modal>
      )}

      <BranchPickerSheet
        visible={branchSheet}
        selectedId={branch?.id}
        onSelect={(b) => {
          setBranch(b);
          setBranchSheet(false);
        }}
        onClose={() => setBranchSheet(false)}
      />

      <FlatList
        data={categories}
        keyExtractor={(category, index) => `${category.categoryId}-${index}`}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textSecondary}
            colors={[theme.tint]}
          />
        }
        ListHeaderComponent={
          loading ? (
            <SkeletonStatGrid />
          ) : summary ? (
            <View style={styles.statsGrid}>
              {summaryStats(summary).map((stat) => (
                <StatCard key={stat.key} stat={stat} />
              ))}
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <CategorySection
            category={item}
            expanded={expanded.has(item.categoryId)}
            onToggle={() => toggleCategory(item.categoryId)}
            theme={theme}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <SkeletonList />
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {error ?? 'No sales for this period.'}
            </ThemedText>
          )
        }
      />
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

function CategorySection({
  category,
  expanded,
  onToggle,
  theme,
}: {
  category: SaleSummaryCategory;
  expanded: boolean;
  onToggle: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.categorySection}>
      <Pressable onPress={onToggle} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.categoryHeader}>
          <View style={styles.cardMain}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {category.categoryName || 'Uncategorized'}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {category.itemCount} {category.itemCount === 1 ? 'item' : 'items'}
            </ThemedText>
          </View>
          <View style={styles.qtyWrap}>
            <ThemedText type="smallBold" style={{ fontSize: 18 }}>
              {withThousands(category.totalQty)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Qty sold
            </ThemedText>
          </View>
          <Ionicons
            name={expanded ? 'chevron-up' : 'chevron-down'}
            size={18}
            color={theme.textSecondary}
            style={styles.categoryChevron}
          />
        </ThemedView>
      </Pressable>

      {expanded && (
        <View style={styles.categoryItems}>
          {category.items.map((item, i) => (
            <ItemCard key={`${item.itemId}-${i}`} item={item} theme={theme} />
          ))}
        </View>
      )}
    </View>
  );
}

function ItemCard({ item, theme }: { item: SaleSummaryItem; theme: ReturnType<typeof useTheme> }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={[styles.iconTile, { backgroundColor: theme.tintSoft }]}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.iconTileImage} contentFit="cover" />
        ) : (
          <Ionicons name="cube-outline" size={22} color={theme.tint} />
        )}
      </View>
      <View style={styles.cardMain}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {item.itemName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {item.itemCode} · {item.invoiceCount} {item.invoiceCount === 1 ? 'invoice' : 'invoices'}
        </ThemedText>
      </View>
      <View style={styles.qtyWrap}>
        <ThemedText type="smallBold" style={{ fontSize: 18 }}>
          {withThousands(item.qtySold)}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Qty sold
        </ThemedText>
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filters: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.two,
  },
  dateRow: {
    flexDirection: 'row',
    gap: Spacing.three,
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
  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 46,
    borderRadius: Spacing.three,
  },
  selectValue: {
    flex: 1,
    fontSize: 15,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 46,
    borderRadius: Spacing.three,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    height: '100%',
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.three,
    marginBottom: Spacing.three,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.six,
  },
  categorySection: {
    gap: Spacing.two,
  },
  categoryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  categoryChevron: {
    marginLeft: Spacing.one,
  },
  categoryItems: {
    gap: Spacing.two,
    paddingLeft: Spacing.three,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  iconTile: {
    width: 46,
    height: 46,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  iconTileImage: {
    width: '100%',
    height: '100%',
  },
  cardMain: {
    flex: 1,
  },
  qtyWrap: {
    alignItems: 'flex-end',
    gap: Spacing.half,
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
  pressed: {
    opacity: 0.7,
  },
});
