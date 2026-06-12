import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { fetchBranchSales, type BranchSalesSummary } from '@/api/daily-sales';
import { getWarehouses, type ApiOption } from '@/api/purchase-orders';
import { ListLoadingOverlay } from '@/components/list-loading-overlay';
import { OptionSheet } from '@/components/option-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import type { Branch } from '@/constants/branches';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';
const EMPTY_BRANCHES: Branch[] = [];

function formatDate(d: Date) {
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** Local YYYY-MM-DD (avoids the UTC shift of toISOString). */
function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function StockRefillScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const branches = session?.branches ?? EMPTY_BRANCHES;

  const [date, setDate] = useState(() => new Date());
  const [datePicker, setDatePicker] = useState(false);
  const [tempDate, setTempDate] = useState(() => new Date());

  const [source, setSource] = useState<ApiOption | null>(null);
  const [warehouseOptions, setWarehouseOptions] = useState<ApiOption[]>([]);
  const [sourceSheet, setSourceSheet] = useState(false);

  const [summaries, setSummaries] = useState<Record<string, BranchSalesSummary>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Source warehouse options; default to the first warehouse.
  useEffect(() => {
    getWarehouses()
      .then((options) => {
        setWarehouseOptions(options);
        setSource((prev) => prev ?? options[0] ?? null);
      })
      .catch(() => {});
  }, []);

  const load = useCallback(
    async (d: Date) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        // One call per branch (the endpoint is scoped to a single branch).
        const results = await Promise.all(
          branches.map(async (b) => {
            try {
              const res = await fetchBranchSales({ date: ymd(d), branchId: b.id });
              return [b.id, res.summary] as const;
            } catch {
              return [b.id, null] as const;
            }
          }),
        );
        if (id !== requestId.current) return;
        const map: Record<string, BranchSalesSummary> = {};
        for (const [bid, summary] of results) if (summary) map[bid] = summary;
        setSummaries(map);
      } catch (e) {
        if (id === requestId.current) {
          setError(e instanceof Error ? e.message : 'Failed to load daily sales.');
          setSummaries({});
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [branches],
  );

  useEffect(() => {
    load(date);
  }, [date, load]);

  // Refresh when returning from a branch refill.
  useFocusEffect(
    useCallback(() => {
      load(date);
    }, [load, date]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(date).finally(() => setRefreshing(false));
  }, [load, date]);

  function openDatePicker() {
    setTempDate(date);
    setDatePicker(true);
  }

  function onAndroidDateChange(event: DateTimePickerEvent, selected?: Date) {
    setDatePicker(false);
    if (event.type === 'dismissed' || !selected) return;
    setDate(selected);
  }

  function openBranch(branch: Branch) {
    if (!source) {
      setError('Please select a source warehouse first.');
      return;
    }
    router.push({
      pathname: '/stock-refill/[branchId]',
      params: {
        branchId: branch.id,
        branchName: branch.name,
        // Branches map 1:1 to a warehouse with the same id in this backend.
        warehouseId: branch.id,
        date: ymd(date),
        sourceId: source.id,
        sourceName: source.name,
      },
    });
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Stock Refill"
        subtitle="Refill branches by daily sales"
        onBack={() => router.back()}
      />

      <View style={styles.controls}>
        <View style={styles.fieldGroup}>
          <ThemedText type="small" themeColor="textSecondary">
            Source warehouse
          </ThemedText>
          <Pressable
            onPress={() => setSourceSheet(true)}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundElement" style={styles.selectBox}>
              <Ionicons name="business-outline" size={18} color={theme.textSecondary} />
              <ThemedText
                numberOfLines={1}
                style={[styles.selectValue, { color: source ? theme.text : theme.textSecondary }]}>
                {source?.name ?? 'Select warehouse'}
              </ThemedText>
              <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
            </ThemedView>
          </Pressable>
        </View>

        <View style={styles.fieldGroup}>
          <ThemedText type="small" themeColor="textSecondary">
            Sales date
          </ThemedText>
          <Pressable onPress={openDatePicker} style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundElement" style={styles.selectBox}>
              <Ionicons name="calendar-outline" size={18} color={theme.textSecondary} />
              <ThemedText style={[styles.selectValue, { color: theme.text }]}>
                {formatDate(date)}
              </ThemedText>
            </ThemedView>
          </Pressable>
        </View>
      </View>

      {datePicker && Platform.OS === 'android' && (
        <DateTimePicker value={date} mode="date" display="default" onChange={onAndroidDateChange} />
      )}
      {Platform.OS === 'ios' && (
        <Modal visible={datePicker} transparent animationType="fade" onRequestClose={() => setDatePicker(false)}>
          <Pressable style={styles.dateBackdrop} onPress={() => setDatePicker(false)}>
            <Pressable onPress={(e) => e.stopPropagation()}>
              <ThemedView style={styles.datePickerCard}>
                <View style={styles.datePickerHeader}>
                  <Pressable onPress={() => setDatePicker(false)} hitSlop={Spacing.two}>
                    <ThemedText type="small" themeColor="textSecondary">
                      Cancel
                    </ThemedText>
                  </Pressable>
                  <ThemedText type="smallBold">Sales date</ThemedText>
                  <Pressable
                    onPress={() => {
                      setDate(tempDate);
                      setDatePicker(false);
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

      <FlatList
        data={branches}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={theme.textSecondary}
            colors={[BRAND]}
          />
        }
        renderItem={({ item }) => (
          <BranchCard
            branch={item}
            summary={summaries[item.id]}
            loading={loading}
            onPress={() => openBranch(item)}
            theme={theme}
          />
        )}
        ListEmptyComponent={
          <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
            {error ?? 'No branches available.'}
          </ThemedText>
        }
      />

      <OptionSheet
        visible={sourceSheet}
        title="Source warehouse"
        options={warehouseOptions.map((o) => o.name)}
        selected={source?.name}
        onSelect={(value) => {
          setSource(warehouseOptions.find((o) => o.name === value) ?? null);
          setError(null);
          setSourceSheet(false);
        }}
        onClose={() => setSourceSheet(false)}
      />

      <ListLoadingOverlay visible={loading && Object.keys(summaries).length > 0} />
    </ThemedView>
  );
}

function BranchCard({
  branch,
  summary,
  loading,
  onPress,
  theme,
}: {
  branch: Branch;
  summary?: BranchSalesSummary;
  loading: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const sold = summary && summary.itemCount > 0;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={[styles.iconTile, { backgroundColor: `${BRAND}1A` }]}>
          <Ionicons name="storefront-outline" size={22} color={BRAND} />
        </View>
        <View style={styles.cardMain}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {branch.name || `Branch ${branch.id}`}
          </ThemedText>
          {loading && !summary ? (
            <ThemedText type="small" themeColor="textSecondary">
              Loading sales…
            </ThemedText>
          ) : sold ? (
            <ThemedText type="small" themeColor="textSecondary">
              {summary!.itemCount} {summary!.itemCount === 1 ? 'item' : 'items'} ·{' '}
              {summary!.totalQty} sold
            </ThemedText>
          ) : (
            <ThemedText type="small" themeColor="textSecondary">
              No sales this day
            </ThemedText>
          )}
        </View>
        <Ionicons name="chevron-forward" size={20} color={theme.textSecondary} />
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  controls: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    flexDirection: 'row',
    gap: Spacing.three,
  },
  fieldGroup: {
    flex: 1,
    gap: Spacing.one,
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
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.six,
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
  },
  cardMain: {
    flex: 1,
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
