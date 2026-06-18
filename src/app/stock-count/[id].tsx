import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {
  completeStockCount,
  fetchStockCount,
  fetchStockCountItems,
  submitStockCountItems,
  type StockCountDetail,
  type StockCountItem,
  type SubmitCountLine,
} from '@/api/stock-count';
import { ListLoadingOverlay } from '@/components/list-loading-overlay';
import { OptionSheet } from '@/components/option-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/inventory';
import { SkeletonList } from '@/components/skeleton';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';
const OVER = '#30A46C';
const SHORT = '#e5484d';

const OVERAGE_REASONS = [
  'Found extra stock',
  'Customer return not recorded',
  'Supplier over-delivery',
  'Previous miscount',
  'Data entry error',
  'Other',
];
const SHORTAGE_REASONS = [
  'Damaged',
  'Expired',
  'Lost or missing',
  'Theft',
  'Sold not recorded',
  'Previous miscount',
  'Data entry error',
  'Other',
];

type Edit = { counted: string; reason: string };

export default function StockCountDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();

  const [header, setHeader] = useState<StockCountDetail | null>(null);
  const [items, setItems] = useState<StockCountItem[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [search, setSearch] = useState('');
  const [onlyDiscrepancy, setOnlyDiscrepancy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);

  const locked = header?.status === 'completed';

  const loadHeader = useCallback(() => {
    fetchStockCount(id)
      .then(setHeader)
      .catch(() => {});
  }, [id]);

  const load = useCallback(
    async (q: string, only: boolean, nextPage: number, append: boolean) => {
      const reqId = ++requestId.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await fetchStockCountItems({
          id,
          page: nextPage,
          search: q,
          onlyDiscrepancy: only,
        });
        if (reqId !== requestId.current) return;
        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
        setPage(result.page);
        setLastPage(result.lastPage);
      } catch (e) {
        if (reqId === requestId.current && !append) {
          setError(e instanceof Error ? e.message : 'Failed to load items.');
          setItems([]);
        }
      } finally {
        if (reqId === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [id],
  );

  useEffect(() => {
    loadHeader();
  }, [loadHeader]);

  useEffect(() => {
    const t = setTimeout(() => load(search, onlyDiscrepancy, 1, false), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, onlyDiscrepancy, load]);

  function loadMore() {
    if (loading || loadingMore || page >= lastPage) return;
    load(search, onlyDiscrepancy, page + 1, true);
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHeader();
    load(search, onlyDiscrepancy, 1, false).finally(() => setRefreshing(false));
  }, [loadHeader, load, search, onlyDiscrepancy]);

  // Display helpers that prefer local edits, falling back to persisted values.
  const countedOf = (it: StockCountItem) =>
    edits[it.detailId]?.counted ?? (it.countedQty == null ? '' : String(it.countedQty));
  const reasonOf = (it: StockCountItem) => edits[it.detailId]?.reason ?? it.reason;

  function setCounted(it: StockCountItem, value: string) {
    const counted = value.replace(/[^0-9]/g, '');
    setEdits((prev) => ({
      ...prev,
      [it.detailId]: { counted, reason: prev[it.detailId]?.reason ?? it.reason },
    }));
  }

  function setReason(detailId: string, reason: string) {
    setEdits((prev) => ({
      ...prev,
      [detailId]: { counted: prev[detailId]?.counted ?? '', reason },
    }));
  }

  // Build the lines the user has actually entered/changed.
  function dirtyLines() {
    const byId = new Map(items.map((it) => [it.detailId, it]));
    const lines: { it: StockCountItem; counted: number; reason: string; diff: number }[] = [];
    for (const [detailId, edit] of Object.entries(edits)) {
      const it = byId.get(detailId);
      if (!it || edit.counted === '') continue;
      const counted = parseInt(edit.counted, 10) || 0;
      lines.push({ it, counted, reason: edit.reason, diff: counted - it.systemQty });
    }
    return lines;
  }

  const pending = dirtyLines();
  const missingReasons = pending.filter((l) => l.diff !== 0 && !l.reason.trim()).length;
  const canSave = pending.length > 0 && missingReasons === 0 && !saving && !locked;

  async function handleSave() {
    if (!canSave) return;
    const payload: SubmitCountLine[] = pending.map((l) => ({
      detail_id: l.it.detailId,
      counted_qty: l.counted,
      reason: l.reason.trim() || undefined,
    }));
    setSaving(true);
    setError(null);
    try {
      await submitStockCountItems(id, payload);
      setEdits({});
      loadHeader();
      await load(search, onlyDiscrepancy, 1, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save counts.');
    } finally {
      setSaving(false);
    }
  }

  function confirmComplete() {
    if (pending.length > 0) {
      Alert.alert('Unsaved counts', 'Save your counts before completing the count.');
      return;
    }
    Alert.alert(
      'Complete count?',
      'This finalizes the count and locks further edits. Stock will be adjusted to the counted quantities.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Complete', style: 'destructive', onPress: runComplete },
      ],
    );
  }

  async function runComplete() {
    setCompleting(true);
    try {
      await completeStockCount(id);
      loadHeader();
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not complete the count.');
    } finally {
      setCompleting(false);
    }
  }

  const reasonItem = reasonFor ? items.find((it) => it.detailId === reasonFor) : null;
  const reasonDiff = reasonItem
    ? (parseInt(countedOf(reasonItem), 10) || 0) - reasonItem.systemQty
    : 0;

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={header?.reference || 'Stock Count'}
        subtitle={locked ? 'Completed · view only' : 'Count & reconcile'}
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}>
        <FlatList
          data={items}
          keyExtractor={(it, index) => `${it.detailId}-${index}`}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
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
          ListHeaderComponent={
            <View style={styles.headerArea}>
              {header && <TotalsCard header={header} theme={theme} />}
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
                </ThemedView>
                <Pressable
                  onPress={() => setOnlyDiscrepancy((v) => !v)}
                  style={({ pressed }) => [
                    styles.toggle,
                    {
                      backgroundColor: onlyDiscrepancy ? BRAND : theme.backgroundElement,
                    },
                    pressed && styles.pressed,
                  ]}>
                  <Ionicons
                    name="git-compare-outline"
                    size={16}
                    color={onlyDiscrepancy ? '#ffffff' : theme.textSecondary}
                  />
                  <ThemedText
                    type="small"
                    style={onlyDiscrepancy ? styles.toggleActive : { color: theme.textSecondary }}>
                    Diff
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <CountItemRow
              item={item}
              counted={countedOf(item)}
              reason={reasonOf(item)}
              locked={locked}
              onCounted={(v) => setCounted(item, v)}
              onOpenReason={() => setReasonFor(item.detailId)}
              theme={theme}
            />
          )}
          ListEmptyComponent={
            loading ? (
              <SkeletonList />
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {error ?? 'No items.'}
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

        {!locked && (
          <View style={[styles.bar, { borderTopColor: theme.backgroundElement }]}>
            <Pressable
              onPress={handleSave}
              disabled={!canSave}
              style={({ pressed }) => [
                styles.saveBtn,
                { borderColor: theme.tint },
                (pressed || !canSave) && styles.pressed,
              ]}>
              {saving ? (
                <ActivityIndicator color={theme.tint} />
              ) : (
                <ThemedText style={[styles.saveText, { color: theme.tint }]}>
                  {pending.length > 0 ? `Save (${pending.length})` : 'Save'}
                </ThemedText>
              )}
            </Pressable>
            <Pressable
              onPress={confirmComplete}
              disabled={completing}
              style={({ pressed }) => [styles.completeBtn, (pressed || completing) && styles.pressed]}>
              {completing ? (
                <ActivityIndicator color="#ffffff" />
              ) : (
                <ThemedText style={styles.completeText}>Complete</ThemedText>
              )}
            </Pressable>
          </View>
        )}
      </KeyboardAvoidingView>

      <ListLoadingOverlay visible={loading && items.length > 0} />

      <OptionSheet
        visible={reasonFor !== null}
        title={reasonDiff > 0 ? 'Overage reason' : 'Shortage reason'}
        options={reasonDiff > 0 ? OVERAGE_REASONS : SHORTAGE_REASONS}
        selected={reasonItem ? reasonOf(reasonItem) || undefined : undefined}
        onSelect={(value) => {
          if (reasonFor) setReason(reasonFor, value);
          setReasonFor(null);
        }}
        onClose={() => setReasonFor(null)}
      />
    </ThemedView>
  );
}

function TotalsCard({
  header,
  theme,
}: {
  header: StockCountDetail;
  theme: ReturnType<typeof useTheme>;
}) {
  const t = header.totals;
  return (
    <ThemedView type="backgroundElement" style={styles.totals}>
      <Stat label="Items" value={t.totalItems} theme={theme} />
      <Stat label="Counted" value={t.countedItems} theme={theme} />
      <Stat label="Shortage" value={formatMoney(t.shortageValue)} color={SHORT} theme={theme} />
      <Stat label="Overage" value={formatMoney(t.overageValue)} color={OVER} theme={theme} />
    </ThemedView>
  );
}

function Stat({
  label,
  value,
  color,
  theme,
}: {
  label: string;
  value: number | string;
  color?: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.stat}>
      <ThemedText type="smallBold" style={[styles.statValue, color ? { color } : null]}>
        {value}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
    </View>
  );
}

function CountItemRow({
  item,
  counted,
  reason,
  locked,
  onCounted,
  onOpenReason,
  theme,
}: {
  item: StockCountItem;
  counted: string;
  reason: string;
  locked: boolean;
  onCounted: (v: string) => void;
  onOpenReason: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const hasCount = counted !== '';
  const diff = hasCount ? (parseInt(counted, 10) || 0) - item.systemQty : 0;
  const diffColor = diff > 0 ? OVER : diff < 0 ? SHORT : theme.textSecondary;

  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {item.itemName}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {item.itemCode}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            System: {item.systemQty}
          </ThemedText>
        </View>
        <View style={styles.actualWrap}>
          <ThemedText type="small" themeColor="textSecondary">
            Counted
          </ThemedText>
          <ThemedView type="background" style={styles.actualInputWrap}>
            <TextInput
              value={counted}
              onChangeText={onCounted}
              editable={!locked}
              placeholder="—"
              placeholderTextColor={theme.textSecondary}
              keyboardType="number-pad"
              style={[styles.actualInput, { color: theme.text }]}
            />
          </ThemedView>
        </View>
      </View>

      {hasCount && diff !== 0 && (
        <View style={styles.diffArea}>
          <View style={[styles.diffBadge, { backgroundColor: `${diffColor}22` }]}>
            <Ionicons name={diff > 0 ? 'arrow-up' : 'arrow-down'} size={13} color={diffColor} />
            <ThemedText type="small" style={{ color: diffColor, fontWeight: '700' }}>
              {diff > 0 ? `Over ${diff}` : `Short ${Math.abs(diff)}`}
            </ThemedText>
          </View>
          <Pressable
            onPress={onOpenReason}
            disabled={locked}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="background" style={styles.reasonWrap}>
              <Ionicons name="pricetag-outline" size={15} color={theme.textSecondary} />
              <ThemedText
                numberOfLines={1}
                style={[styles.reasonValue, { color: reason ? theme.text : theme.textSecondary }]}>
                {reason || (diff > 0 ? 'Select overage reason' : 'Select shortage reason')}
              </ThemedText>
              {!locked && <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />}
            </ThemedView>
          </Pressable>
        </View>
      )}
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
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.six,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  headerArea: {
    gap: Spacing.three,
    marginBottom: Spacing.one,
  },
  totals: {
    flexDirection: 'row',
    borderRadius: Spacing.four,
    paddingVertical: Spacing.three,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: Spacing.half,
  },
  statValue: {
    fontSize: 18,
  },
  filterRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  searchBar: {
    flex: 1,
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
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    height: 46,
    borderRadius: Spacing.three,
  },
  toggleActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.six,
  },
  center: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
  },
  card: {
    padding: Spacing.three,
    borderRadius: Spacing.four,
    gap: Spacing.three,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  cardInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  actualWrap: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  actualInputWrap: {
    width: 72,
    height: 44,
    borderRadius: Spacing.two,
    justifyContent: 'center',
  },
  actualInput: {
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  diffArea: {
    gap: Spacing.two,
  },
  diffBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: Spacing.half,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: Spacing.five,
  },
  reasonWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    minHeight: 44,
  },
  reasonValue: {
    flex: 1,
    fontSize: 15,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  saveBtn: {
    flex: 1,
    height: 50,
    borderRadius: Spacing.three,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    fontSize: 16,
    fontWeight: '600',
  },
  completeBtn: {
    flex: 1,
    height: 50,
    borderRadius: Spacing.three,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
