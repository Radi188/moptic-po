import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import {
  fetchStockCounts,
  type StockCount,
  type StockCountStatus,
} from '@/api/stock-count';
import { ListLoadingOverlay } from '@/components/list-loading-overlay';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { SkeletonList } from '@/components/skeleton';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';

type StatusFilter = 'all' | StockCountStatus;
const STATUSES: StatusFilter[] = ['all', 'open', 'completed'];

const STATUS_META: Record<StockCountStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: '#F5A623' },
  completed: { label: 'Completed', color: '#30A46C' },
};

function formatDate(s: string) {
  if (!s) return '';
  const d = new Date(s.includes('T') ? s : `${s}T00:00:00`);
  if (Number.isNaN(d.getTime())) return s;
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export default function StockCountListScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const branchId = session?.branch.id;

  const [status, setStatus] = useState<StatusFilter>('all');
  const [items, setItems] = useState<StockCount[]>([]);
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
    async (statusVal: StatusFilter, nextPage: number, append: boolean) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else {
        setLoading(true);
        setError(null);
      }
      try {
        const result = await fetchStockCounts({ page: nextPage, branchId, status: statusVal });
        if (id !== requestId.current) return;
        setItems((prev) => (append ? [...prev, ...result.items] : result.items));
        setPage(result.page);
        setLastPage(result.lastPage);
        setTotal(result.total);
      } catch (e) {
        if (id === requestId.current && !append) {
          setError(e instanceof Error ? e.message : 'Failed to load counts.');
          setItems([]);
        }
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [branchId],
  );

  useEffect(() => {
    load(status, 1, false);
  }, [status, load]);

  // Refresh when returning (after starting or completing a count).
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      load(status, 1, false);
    }, [load, status]),
  );

  function loadMore() {
    if (loading || loadingMore || page >= lastPage) return;
    load(status, page + 1, true);
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    load(status, 1, false).finally(() => setRefreshing(false));
  }, [load, status]);

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="Stock Count"
        subtitle={`${total} ${total === 1 ? 'count' : 'counts'}`}
        onBack={() => router.back()}
        right={
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => router.push('/stock-count/loss')}
              hitSlop={Spacing.two}
              style={({ pressed }) => [styles.iconBtn, pressed && styles.pressed]}>
              <Ionicons name="trending-down-outline" size={20} color={theme.text} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/stock-count/new')}
              style={({ pressed }) => [styles.newButton, pressed && styles.pressed]}>
              <Ionicons name="add" size={20} color="#ffffff" />
              <ThemedText style={styles.newButtonText}>New</ThemedText>
            </Pressable>
          </View>
        }
      />

      <View style={styles.controls}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}>
          {STATUSES.map((s) => (
            <Chip
              key={s}
              label={s === 'all' ? 'All' : STATUS_META[s].label}
              color={s === 'all' ? BRAND : STATUS_META[s].color}
              active={status === s}
              onPress={() => setStatus(s)}
              theme={theme}
            />
          ))}
        </ScrollView>
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
            colors={[theme.tint]}
          />
        }
        renderItem={({ item }) => (
          <CountCard
            count={item}
            onPress={() => router.push({ pathname: '/stock-count/[id]', params: { id: item.id } })}
            theme={theme}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <SkeletonList />
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {error ?? 'No stock counts yet. Tap New to start one.'}
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

function Chip({
  label,
  color,
  active,
  onPress,
  theme,
}: {
  label: string;
  color: string;
  active: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: active ? color : theme.backgroundElement },
        pressed && styles.pressed,
      ]}>
      <ThemedText type="small" style={active ? styles.chipActive : { color: theme.textSecondary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

function CountCard({
  count,
  onPress,
  theme,
}: {
  count: StockCount;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const meta = STATUS_META[count.status];

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.card}>
        <View style={styles.cardRow}>
          <View style={[styles.iconTile, { backgroundColor: `${meta.color}1A` }]}>
            <Ionicons name="clipboard-outline" size={22} color={meta.color} />
          </View>
          <View style={styles.cardMain}>
            <View style={styles.refRow}>
              <ThemedText type="smallBold" numberOfLines={1} style={styles.refText}>
                {count.reference}
              </ThemedText>
              <View style={[styles.badge, { backgroundColor: `${meta.color}22` }]}>
                <ThemedText style={[styles.badgeText, { color: meta.color }]}>
                  {meta.label}
                </ThemedText>
              </View>
            </View>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
              {count.warehouseName || `Warehouse ${count.warehouseId}`}
            </ThemedText>
          </View>
        </View>

        <View style={[styles.cardFooter, { borderTopColor: theme.background }]}>
          <View style={styles.inlineRow}>
            <Ionicons name="calendar-outline" size={13} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              {formatDate(count.countDate)}
            </ThemedText>
          </View>
          <View style={styles.inlineRow}>
            <Ionicons name="list-outline" size={13} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              {count.countedItems}/{count.totalItems} counted
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
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingBottom: Spacing.three,
  },
  chips: {
    gap: Spacing.two,
    paddingHorizontal: Spacing.four,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    height: 34,
    borderRadius: Spacing.five,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipActive: {
    color: '#ffffff',
    fontWeight: '700',
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
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: Spacing.two,
  },
  badgeText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '700',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    flexShrink: 1,
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
