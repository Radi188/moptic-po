import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { isApiConfigured } from '@/api/config';
import {
  approveTransfer,
  declineTransfer,
  fetchTransfer,
  fetchTransfers,
} from '@/api/transfers';
import { ListLoadingOverlay } from '@/components/list-loading-overlay';
import { TransferDetailsSheet } from '@/components/transfer-details-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { SkeletonList } from '@/components/skeleton';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import {
  formatDateTime,
  STATUS_META,
  TRANSFER_STATUSES,
  type StockTransfer,
  type TransferStatus,
} from '@/data/transfers';

const BRAND = '#232843';
const DONE = '#30A46C';

type StatusFilter = 'all' | TransferStatus;

/** Local YYYY-MM-DD. */
function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * A transfer counts as "already refilled today" when it was created today and
 * its reference (description) carries yesterday's sales date — i.e. it's the
 * daily warehouse→branch refill for yesterday's sales. Resets each day.
 */
function isRefilledToday(transfer: StockTransfer) {
  const today = ymd(new Date());
  const yesterday = ymd(new Date(Date.now() - 86400000));
  const createdToday = transfer.transactionDate.slice(0, 10) === today;
  const salesDate = transfer.description.match(/\d{4}-\d{2}-\d{2}/)?.[0];
  return createdToday && salesDate === yesterday;
}

export default function TransfersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const theme = useTheme();
  const { isTablet } = useResponsive();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');

  const [items, setItems] = useState<StockTransfer[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const [detailVisible, setDetailVisible] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selected, setSelected] = useState<StockTransfer | null>(null);

  const load = useCallback(
    async (searchVal: string, statusVal: StatusFilter, nextPage: number, append: boolean) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await fetchTransfers({ page: nextPage, search: searchVal, status: statusVal });
        if (id !== requestId.current) return;
        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
        setPage(result.page);
        setLastPage(result.totalPages);
        setTotal(result.total);
      } catch (e) {
        if (id === requestId.current && !append) {
          setError(e instanceof Error ? e.message : 'Failed to load transfers.');
          setItems([]);
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [],
  );

  // Initial load + debounced reload on search/status change.
  useEffect(() => {
    const t = setTimeout(() => load(search, status, 1, false), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, status, load]);

  function loadMore() {
    if (loading || loadingMore || page >= lastPage) return;
    load(search, status, page + 1, true);
  }

  function newTransfer() {
    router.push({ pathname: '/transfer/[id]', params: { id: 'new' } });
  }

  function closeDetail() {
    setDetailVisible(false);
    setSelected(null);
  }

  function openTransfer(id: string) {
    setSelected(null);
    setDetailLoading(true);
    setDetailVisible(true);
    fetchTransfer(id)
      .then((t) => setSelected(t ?? null))
      .catch(() => setDetailVisible(false))
      .finally(() => setDetailLoading(false));
  }

  function editTransfer(id: string) {
    closeDetail();
    router.push({ pathname: '/transfer/[id]', params: { id } });
  }

  async function decide(id: string, next: TransferStatus) {
    try {
      if (next === 'approved') await approveTransfer(id);
      else await declineTransfer(id);
      closeDetail();
      load(search, status, 1, false);
    } catch (e) {
      Alert.alert('Failed', e instanceof Error ? e.message : 'Could not update the transfer.');
    }
  }

  return (
    <ThemedView style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
        <View>
          <ThemedText style={[styles.title, isTablet && styles.titleTablet]}>Stock Transfer</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {total} transfers
          </ThemedText>
        </View>
        <Pressable
          onPress={newTransfer}
          style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}>
          <Ionicons name="add" size={20} color="#ffffff" />
          <ThemedText style={styles.newButtonText}>New</ThemedText>
        </Pressable>
      </View>

      <View style={styles.controls}>
        <ThemedView type="backgroundElement" style={styles.searchBar}>
          <Ionicons name="search" size={18} color={theme.textSecondary} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search reference or warehouse"
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

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          <FilterChip
            label="All"
            color={BRAND}
            active={status === 'all'}
            onPress={() => setStatus('all')}
            theme={theme}
            isTablet={isTablet}
          />
          {TRANSFER_STATUSES.map((s) => (
            <FilterChip
              key={s}
              label={STATUS_META[s].label}
              color={STATUS_META[s].color}
              active={status === s}
              onPress={() => setStatus(s)}
              theme={theme}
              isTablet={isTablet}
            />
          ))}
        </ScrollView>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item, index) => `${item.id}-${index}`}
        key={isTablet ? 'grid' : 'list'}
        numColumns={isTablet ? 2 : 1}
        columnWrapperStyle={isTablet ? styles.columnWrapper : undefined}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
        renderItem={({ item }) => (
          <View style={isTablet ? styles.gridItem : undefined}>
            <TransferCard
              transfer={item}
              onPress={() => openTransfer(item.id)}
              onLongPress={isApiConfigured() ? undefined : () => editTransfer(item.id)}
            />
          </View>
        )}
        ListEmptyComponent={
          loading ? (
            <SkeletonList />
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {error ?? 'No stock transfers match your filters.'}
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

      <TransferDetailsSheet
        visible={detailVisible}
        loading={detailLoading}
        transfer={selected}
        onClose={closeDetail}
        onApprove={(id) => decide(id, 'approved')}
        onDecline={(id) => decide(id, 'declined')}
      />

      <ListLoadingOverlay visible={loading && items.length > 0} />
    </ThemedView>
  );
}

function FilterChip({
  label,
  color,
  active,
  onPress,
  theme,
  isTablet,
}: {
  label: string;
  color: string;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
  isTablet: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={Spacing.one}
      style={({ pressed }) => [
        styles.chip,
        isTablet && styles.chipTablet,
        { backgroundColor: active ? color : theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <ThemedText
        type="smallBold"
        style={[
          isTablet && styles.chipTextTablet,
          active ? styles.chipActiveText : { color: theme.textSecondary },
        ]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function TransferCard({
  transfer,
  onPress,
  onLongPress,
}: {
  transfer: StockTransfer;
  onPress: () => void;
  onLongPress?: () => void;
}) {
  const theme = useTheme();
  const statusColor = STATUS_META[transfer.status].color;
  const itemCount = transfer.itemsCount ?? transfer.items.length;
  const done = isRefilledToday(transfer);

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={300}
      style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.iconTile, { backgroundColor: `${statusColor}1A` }]}>
            <Ionicons name="swap-horizontal" size={22} color={statusColor} />
          </View>
          <View style={styles.cardMain}>
            <View style={styles.refRow}>
              {done && (
                <Ionicons
                  name="checkmark-circle"
                  size={18}
                  color={DONE}
                  accessibilityLabel="Already refilled today"
                />
              )}
              <ThemedText type="smallBold" numberOfLines={1} style={styles.refText}>
                {transfer.reference}
              </ThemedText>
              <View style={[styles.levelBadge, { backgroundColor: `${statusColor}22` }]}>
                <View style={[styles.dot, { backgroundColor: statusColor }]} />
                <ThemedText style={[styles.badgeText, { color: statusColor }]}>
                  {STATUS_META[transfer.status].label}
                </ThemedText>
              </View>
            </View>
            <View style={styles.inlineRow}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {transfer.fromWarehouse}
              </ThemedText>
              <Ionicons name="arrow-forward" size={12} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {transfer.toWarehouse}
              </ThemedText>
            </View>
          </View>
        </View>

        <View style={[styles.cardFooter, { borderTopColor: theme.background }]}>
          <View style={styles.inlineRow}>
            <Ionicons name="calendar-outline" size={13} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              {formatDateTime(transfer.transactionDate)}
            </ThemedText>
          </View>
          <View style={styles.inlineRow}>
            <Ionicons name="cube-outline" size={13} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              {itemCount} {itemCount === 1 ? 'item' : 'items'}
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  titleTablet: {
    fontSize: 32,
    lineHeight: 40,
  },
  newButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    backgroundColor: BRAND,
    paddingLeft: Spacing.two,
    paddingRight: Spacing.three,
    height: 40,
    borderRadius: Spacing.five,
  },
  newButtonText: {
    color: '#ffffff',
    fontWeight: '600',
  },
  controls: {
    paddingHorizontal: Spacing.four,
    gap: Spacing.three,
    paddingBottom: Spacing.three,
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
  chips: {
    gap: Spacing.two,
    paddingRight: Spacing.four,
    alignItems: 'center',
  },
  chip: {
    paddingHorizontal: Spacing.four,
    height: 44,
    borderRadius: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipTablet: {
    paddingHorizontal: Spacing.five,
    height: 56,
  },
  chipTextTablet: {
    fontSize: 18,
    lineHeight: 24,
  },
  chipActiveText: {
    color: '#ffffff',
    fontWeight: '700',
  },
  list: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  columnWrapper: {
    gap: Spacing.three,
  },
  gridItem: {
    flex: 1,
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
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
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
  refRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.two,
  },
  refText: {
    flex: 1,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    flexShrink: 1,
  },
  levelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: Spacing.two,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
