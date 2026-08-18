import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { useTranslation, type TranslateFn } from '@/contexts/i18n';
import type { Stat } from '@/data/dashboard';
import { formatDate, formatMoney } from '@/data/purchase-orders';
import { useTheme } from '@/hooks/use-theme';

const ERROR_COLOR = '#e5484d';

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

/**
 * The listed price, shown as a min–max range when the item sold at more than
 * one price during the period.
 */
function priceLabel(item: SaleSummaryItem) {
  if (item.minPrice !== item.maxPrice) {
    return `${formatMoney(item.minPrice)} – ${formatMoney(item.maxPrice)}`;
  }
  return formatMoney(item.unitPrice);
}

function summaryStats(t: TranslateFn, s: SaleSummaryTotals): Stat[] {
  return [
    { key: 'invoices', label: t('saleSummary.stat.invoices'), value: withThousands(s.totalInvoices), icon: 'receipt-outline', tone: 'brand' },
    { key: 'qty', label: t('saleSummary.stat.qtySold'), value: withThousands(s.totalQty), icon: 'layers-outline', tone: 'brand' },
    { key: 'items', label: t('saleSummary.stat.items'), value: withThousands(s.itemCount), icon: 'cube-outline', tone: 'brand' },
    {
      key: 'categories',
      label: t('saleSummary.stat.categories'),
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
  const { t } = useTranslation();

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
  // The summary covers the whole date range, so it comes from page 1 only and
  // is never recomputed while paging.
  const [summary, setSummary] = useState<SaleSummaryTotals | null>(null);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (
      from: Date,
      to: Date,
      branchId: string | undefined,
      q: string,
      targetPage: number,
      mode: 'replace' | 'append',
    ) => {
      if (mode === 'append') setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const result = await fetchSalesSummary({
          dateFrom: ymd(from),
          dateTo: ymd(to),
          branchId,
          categorySearch: q,
          page: targetPage,
        });
        // Pagination is by category: whole groups are appended, and each group
        // already carries every one of its items.
        setCategories((prev) =>
          mode === 'append' ? [...prev, ...result.categories] : result.categories,
        );
        if (mode === 'replace') {
          setSummary(result.summary);
          // A search narrows the result set enough that expanding everything
          // by default is more useful than making the user open each category.
          setExpanded(q ? new Set(result.categories.map((c) => c.categoryId)) : new Set());
        } else if (q) {
          setExpanded((prev) => {
            const next = new Set(prev);
            result.categories.forEach((c) => next.add(c.categoryId));
            return next;
          });
        }
        setPage(result.meta.currentPage);
        setLastPage(result.meta.lastPage);
      } catch (e) {
        setError(e instanceof Error ? e.message : t('common.loadReportError'));
        if (mode === 'replace') {
          setCategories([]);
          setSummary(null);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [t],
  );

  function toggleCategory(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Initial load + debounced category search; any filter change restarts at
  // page 1.
  useEffect(() => {
    const timer = setTimeout(
      () => load(dateFrom, dateTo, branch?.id, search, 1, 'replace'),
      search ? 350 : 0,
    );
    return () => clearTimeout(timer);
  }, [dateFrom, dateTo, branch, search, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(dateFrom, dateTo, branch?.id, search, 1, 'replace').finally(() =>
      setRefreshing(false),
    );
  }, [load, dateFrom, dateTo, branch, search]);

  const loadMore = useCallback(() => {
    if (loading || loadingMore || refreshing) return;
    // Nothing to page through on an empty list, and guard against a missing
    // page count so onEndReached can't fire an endless append loop.
    if (categories.length === 0) return;
    if (!lastPage || page >= lastPage) return;
    load(dateFrom, dateTo, branch?.id, search, page + 1, 'append');
  }, [
    loading,
    loadingMore,
    refreshing,
    categories.length,
    page,
    lastPage,
    load,
    dateFrom,
    dateTo,
    branch,
    search,
  ]);

  const retry = useCallback(() => {
    load(dateFrom, dateTo, branch?.id, search, 1, 'replace');
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
      <ScreenHeader title={t('settings.row.saleSummaryReport')} subtitle={t('saleSummary.subtitle')} onBack={() => router.back()} />

      <View style={styles.filters}>
        <View style={styles.dateRow}>
          <DateField
            label={t('filters.from')}
            value={formatDate(dateFrom.toISOString())}
            onPress={() => openDatePicker('from')}
            theme={theme}
          />
          <DateField
            label={t('filters.to')}
            value={formatDate(dateTo.toISOString())}
            onPress={() => openDatePicker('to')}
            theme={theme}
          />
        </View>

        <Pressable onPress={() => setBranchSheet(true)} style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={styles.selectBox}>
            <Ionicons name="business-outline" size={18} color={theme.textSecondary} />
            <ThemedText numberOfLines={1} style={[styles.selectValue, { color: theme.text }]}>
              {branch?.name ?? t('filters.allBranches')}
            </ThemedText>
            <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
          </ThemedView>
        </Pressable>

        <ThemedView type="backgroundElement" style={styles.searchBar}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder={t('filters.searchCategory')}
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
                      {t('common.cancel')}
                    </ThemedText>
                  </Pressable>
                  <ThemedText type="smallBold">
                    {datePicker === 'from' ? t('filters.dateFrom') : t('filters.dateTo')}
                  </ThemedText>
                  <Pressable
                    onPress={() => {
                      if (datePicker === 'from') setDateFrom(tempDate);
                      else if (datePicker === 'to') setDateTo(tempDate);
                      setDatePicker(null);
                    }}
                    hitSlop={Spacing.two}>
                    <ThemedText type="smallBold" style={{ color: theme.tint }}>
                      {t('common.done')}
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
        ListHeaderComponent={
          loading ? (
            <SkeletonStatGrid />
          ) : summary ? (
            <View style={styles.statsGrid}>
              {summaryStats(t, summary).map((stat) => (
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
          ) : error ? (
            <ErrorState message={error} onRetry={retry} theme={theme} />
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {t('saleSummary.empty')}
            </ThemedText>
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <View style={styles.footer}>
              <ActivityIndicator color={theme.tint} />
            </View>
          ) : error && categories.length > 0 ? (
            <ErrorState message={error} onRetry={retry} theme={theme} />
          ) : null
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

/** Surfaces the API message (including the 400 `error` payload) with a retry. */
function ErrorState({
  message,
  onRetry,
  theme,
}: {
  message: string;
  onRetry: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const { t } = useTranslation();
  return (
    <Pressable onPress={onRetry} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.errorCard}>
        <Ionicons name="alert-circle-outline" size={20} color={ERROR_COLOR} />
        <View style={styles.cardMain}>
          <ThemedText type="small" style={{ color: ERROR_COLOR }}>
            {message}
          </ThemedText>
          <ThemedText type="smallBold" style={{ color: theme.tint }}>
            {t('common.tapToRetry')}
          </ThemedText>
        </View>
      </ThemedView>
    </Pressable>
  );
}

/** One label/value pair inside an item card. */
function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText type="small" numberOfLines={1}>
        {value}
      </ThemedText>
    </View>
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
  const { t } = useTranslation();
  return (
    <View style={styles.categorySection}>
      <Pressable onPress={onToggle} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.categoryHeader}>
          <View style={styles.cardMain}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {category.categoryName || t('common.uncategorized')}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {category.itemCount} {category.itemCount === 1 ? t('common.item') : t('common.items')} ·{' '}
              {withThousands(category.totalQty)} {t('common.qty')}
            </ThemedText>
          </View>
          <View style={styles.qtyWrap}>
            <ThemedText type="smallBold" style={{ fontSize: 18 }}>
              {formatMoney(category.totalRevenue)}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('saleSummary.field.revenue')}
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
  const { t } = useTranslation();
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardTop}>
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
            {item.itemCode} · {item.invoiceCount}{' '}
            {item.invoiceCount === 1 ? t('common.invoice') : t('common.invoices')}
          </ThemedText>
        </View>
        <View style={styles.qtyWrap}>
          <ThemedText type="smallBold" style={{ fontSize: 18 }}>
            {withThousands(item.qtySold)}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('common.qtySold')}
          </ThemedText>
        </View>
      </View>

      <View style={styles.metrics}>
        <Metric label={t('saleSummary.field.unitPrice')} value={priceLabel(item)} />
        <Metric label={t('saleSummary.field.avgSoldPrice')} value={formatMoney(item.avgSoldPrice)} />
        <Metric label={t('saleSummary.field.subtotal')} value={formatMoney(item.subtotal)} />
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
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  footer: {
    paddingVertical: Spacing.four,
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
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  metrics: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: Spacing.two,
  },
  metric: {
    width: '33.33%',
    gap: Spacing.half,
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
