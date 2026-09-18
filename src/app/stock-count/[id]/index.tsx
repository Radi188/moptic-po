import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { fetchCategories, toCategoryOptions, type CategoryOption } from '@/api/categories';
import {
  fetchStockCount,
  fetchStockCountItems,
  reopenStockCount,
  summarizeStockCountItems,
  type StockCountDetail,
  type StockCountProgress,
} from '@/api/stock-count';
import { ScreenHeader } from '@/components/screen-header';
import { SkeletonList } from '@/components/skeleton';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ALL_CATEGORIES, ALL_ITEMS_PER_PAGE } from '@/constants/stock-count';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useTranslation } from '@/contexts/i18n';
import { formatMoney } from '@/data/inventory';
import { useStockCountComplete } from '@/hooks/use-stock-count-complete';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';
const OVER = '#30A46C';
const SHORT = '#e5484d';

export default function StockCountOverviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();

  const [header, setHeader] = useState<StockCountDetail | null>(null);
  const [options, setOptions] = useState<CategoryOption[]>([]);
  const [progress, setProgress] = useState<Record<string, StockCountProgress>>({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reopening, setReopening] = useState(false);
  const requestId = useRef(0);

  const locked = header?.status === 'completed';

  const loadHeader = useCallback(() => {
    fetchStockCount(id)
      .then(setHeader)
      .catch(() => {});
  }, [id]);

  /**
   * Every sub-category, flattened out of the main → sub tree, since that is the
   * level items are filed under. All of them stay listed; the count's own lines
   * are tallied alongside so each row can show what this count holds for it.
   */
  const load = useCallback(async () => {
    const reqId = ++requestId.current;
    setError(null);
    try {
      const [categories, page] = await Promise.all([
        fetchCategories(),
        fetchStockCountItems({ id, perPage: ALL_ITEMS_PER_PAGE }),
      ]);
      if (reqId !== requestId.current) return;
      setOptions(toCategoryOptions(categories));

      // One pass over the count's lines gives every sub-category its tally.
      const byCategory = new Map<string, typeof page.items>();
      for (const it of page.items) {
        if (!it.categoryId) continue;
        const list = byCategory.get(it.categoryId);
        if (list) list.push(it);
        else byCategory.set(it.categoryId, [it]);
      }
      const next: Record<string, StockCountProgress> = {};
      for (const [categoryId, list] of byCategory) {
        next[categoryId] = summarizeStockCountItems(list);
      }
      setProgress(next);
    } catch (e) {
      if (reqId !== requestId.current) return;
      setError(e instanceof Error ? e.message : t('count.categoriesLoadError'));
      setOptions([]);
    } finally {
      if (reqId === requestId.current) setLoading(false);
    }
  }, [id, t]);

  // Runs on mount too, and again whenever a category screen hands focus back.
  useFocusEffect(
    useCallback(() => {
      loadHeader();
      load();
    }, [loadHeader, load]),
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHeader();
    load().finally(() => setRefreshing(false));
  }, [loadHeader, load]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? options.filter(
          (o) => o.name.toLowerCase().includes(q) || o.parent.toLowerCase().includes(q),
        )
      : options;
    // Categories this count actually holds items for come first; the rest stay
    // listed so nothing is hidden.
    return [...matched].sort(
      (a, b) => (progress[b.id]?.total ?? 0 ? 1 : 0) - (progress[a.id]?.total ?? 0 ? 1 : 0),
    );
  }, [options, search, progress]);

  const refreshAll = useCallback(() => {
    loadHeader();
    load();
  }, [loadHeader, load]);

  // No category — this signs off every line still open.
  const { completing, confirmComplete } = useStockCountComplete({
    id,
    categoryId: '',
    categoryName: '',
    onDone: refreshAll,
  });

  function confirmReopen() {
    Alert.alert(t('count.reopenTitle'), t('count.reopenBody'), [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('count.reopen'), style: 'destructive', onPress: runReopen },
    ]);
  }

  async function runReopen() {
    setReopening(true);
    try {
      await reopenStockCount(id);
      refreshAll();
    } catch (e) {
      Alert.alert(
        t('transfers.updateFailedTitle'),
        e instanceof Error ? e.message : t('count.reopenFailBody'),
      );
    } finally {
      setReopening(false);
    }
  }

  function openCategory(categoryId: string, name: string) {
    router.push({
      pathname: '/stock-count/[id]/[categoryId]',
      params: { id, categoryId, name },
    });
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={header?.reference || t('settings.row.stockCount')}
        subtitle={locked ? t('count.subtitleLocked') : t('count.subtitleCategories')}
        onBack={() => router.back()}
      />

      <FlatList
        data={visible}
        keyExtractor={(row) => row.id}
        contentContainerStyle={styles.list}
        keyboardShouldPersistTaps="handled"
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
          <View style={styles.headerArea}>
            {header && <TotalsCard header={header} theme={theme} />}
            <Pressable
              onPress={() => openCategory(ALL_CATEGORIES, '')}
              style={({ pressed }) => [pressed && styles.pressed]}>
              <ThemedView type="backgroundElement" style={styles.allRow}>
                <Ionicons name="albums-outline" size={20} color={theme.text} />
                <View style={styles.rowInfo}>
                  <ThemedText type="smallBold">{t('count.allItems')}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('count.allItemsHint')}
                  </ThemedText>
                </View>
                <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
              </ThemedView>
            </Pressable>

            <ThemedView type="backgroundElement" style={styles.searchBar}>
              <Ionicons name="search" size={18} color={theme.textSecondary} />
              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder={t('count.searchCategory')}
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.searchInput, { color: theme.text }]}
              />
            </ThemedView>

            <ThemedText type="small" themeColor="textSecondary" style={styles.sectionLabel}>
              {t('count.subCategoriesTitle', { n: visible.length })}
            </ThemedText>
          </View>
        }
        renderItem={({ item }) => (
          <CategoryRow
            option={item}
            progress={progress[item.id]}
            theme={theme}
            onPress={() => openCategory(item.id, item.name)}
          />
        )}
        ListEmptyComponent={
          loading ? (
            <SkeletonList />
          ) : (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {error ?? t('count.noCategories')}
            </ThemedText>
          )
        }
      />

      <View style={[styles.bar, { borderTopColor: theme.backgroundElement }]}>
        {locked ? (
          <Pressable
            onPress={confirmReopen}
            disabled={reopening}
            style={({ pressed }) => [
              styles.reopenBtn,
              { borderColor: theme.textSecondary },
              (pressed || reopening) && styles.pressed,
            ]}>
            {reopening ? (
              <ActivityIndicator color={theme.textSecondary} />
            ) : (
              <>
                <Ionicons name="lock-open-outline" size={18} color={theme.text} />
                <ThemedText style={styles.btnText}>{t('count.reopen')}</ThemedText>
              </>
            )}
          </Pressable>
        ) : (
          <Pressable
            onPress={confirmComplete}
            disabled={completing}
            style={({ pressed }) => [styles.completeBtn, (pressed || completing) && styles.pressed]}>
            {completing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.completeText}>{t('count.completeAll')}</ThemedText>
            )}
          </Pressable>
        )}
      </View>
    </ThemedView>
  );
}

function CategoryRow({
  option,
  progress,
  theme,
  onPress,
}: {
  option: CategoryOption;
  progress: StockCountProgress | undefined;
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const total = progress?.total ?? 0;
  const done = total > 0 && progress?.counted === total;

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [pressed && styles.pressed]}>
      <ThemedView type="backgroundElement" style={[styles.row, total === 0 && styles.rowEmpty]}>
        <View style={styles.rowInfo}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {option.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {option.parent}
          </ThemedText>
        </View>
        {total > 0 ? (
          <ThemedText type="small" style={{ color: done ? OVER : theme.textSecondary }}>
            {t('count.progress', { counted: progress?.counted ?? 0, total })}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {t('count.noCategoryItems')}
          </ThemedText>
        )}
        <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
      </ThemedView>
    </Pressable>
  );
}

function TotalsCard({
  header,
  theme,
}: {
  header: StockCountDetail;
  theme: ReturnType<typeof useTheme>;
}) {
  const { t } = useTranslation();
  const totals = header.totals;
  return (
    <ThemedView type="backgroundElement" style={styles.totals}>
      <Stat label={t('field.items')} value={totals.totalItems} theme={theme} />
      <Stat label={t('count.counted')} value={totals.countedItems} theme={theme} />
      <Stat
        label={t('count.shortage')}
        value={formatMoney(totals.shortageValue)}
        color={SHORT}
        theme={theme}
      />
      <Stat
        label={t('count.overage')}
        value={formatMoney(totals.overageValue)}
        color={OVER}
        theme={theme}
      />
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

const styles = StyleSheet.create({
  container: {
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
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  rowEmpty: {
    opacity: 0.55,
  },
  rowInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.six,
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
  reopenBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    height: 50,
    borderRadius: Spacing.three,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnText: {
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
