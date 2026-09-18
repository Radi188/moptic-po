import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

import { fetchCategories } from '@/api/categories';
import {
  fetchStockCount,
  fetchStockCountItems,
  submitStockCountItems,
  variantLabel,
  type StockCountDetail,
  type StockCountItem,
  type SubmitCountLine,
} from '@/api/stock-count';
import { ListLoadingOverlay } from '@/components/list-loading-overlay';
import { OptionSheet } from '@/components/option-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { ALL_CATEGORIES, ALL_ITEMS_PER_PAGE } from '@/constants/stock-count';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/inventory';
import { SkeletonList } from '@/components/skeleton';
import { useTranslation } from '@/contexts/i18n';
import { useStockCountComplete } from '@/hooks/use-stock-count-complete';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';
const OVER = '#30A46C';
const SHORT = '#e5484d';

const OVERAGE_REASON_KEYS = [
  'reason.foundExtra',
  'reason.customerReturn',
  'reason.supplierOver',
  'reason.previousMiscount',
  'reason.dataEntryError',
  'reason.other',
] as const;
const SHORTAGE_REASON_KEYS = [
  'reason.damaged',
  'reason.expired',
  'reason.lostMissing',
  'reason.theft',
  'reason.soldNotRecorded',
  'reason.previousMiscount',
  'reason.dataEntryError',
  'reason.other',
] as const;

type Edit = { counted: string; reason: string };

export default function StockCountCategoryScreen() {
  const params = useLocalSearchParams<{ id: string; categoryId: string; name?: string }>();
  const id = params.id;
  // The route always carries a segment; `all` means "no category filter". The
  // backend matches `id = X OR main_id = X`, so a sub id filters on its own.
  const categoryId = params.categoryId === ALL_CATEGORIES ? '' : (params.categoryId ?? '');
  const router = useRouter();
  const theme = useTheme();
  const { t } = useTranslation();
  const overageReasons = OVERAGE_REASON_KEYS.map((k) => t(k));
  const shortageReasons = SHORTAGE_REASON_KEYS.map((k) => t(k));

  const [header, setHeader] = useState<StockCountDetail | null>(null);
  const [items, setItems] = useState<StockCountItem[]>([]);
  const [search, setSearch] = useState('');
  const [onlyDiscrepancy, setOnlyDiscrepancy] = useState(false);
  // The overview passes the name through; resolve it only on a cold deep link.
  const [resolvedName, setResolvedName] = useState(params.name ?? '');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [reasonFor, setReasonFor] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const locked = header?.status === 'completed';
  const categoryName = resolvedName;
  // Every line of the selected category is finalized — nothing left to complete
  // here. Only trustworthy on an unfiltered list, which is the whole category.
  const categoryLocked =
    !!categoryId &&
    !search.trim() &&
    !onlyDiscrepancy &&
    items.length > 0 &&
    items.every((it) => it.completed);

  const loadHeader = useCallback(() => {
    fetchStockCount(id)
      .then(setHeader)
      .catch(() => {});
  }, [id]);

  const load = useCallback(
    async (q: string, only: boolean) => {
      const reqId = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const result = await fetchStockCountItems({
          id,
          categoryId,
          search: q,
          onlyDiscrepancy: only,
          perPage: ALL_ITEMS_PER_PAGE,
        });
        if (reqId !== requestId.current) return;
        setItems(result.items);
      } catch (e) {
        if (reqId === requestId.current) {
          setError(e instanceof Error ? e.message : t('count.loadItemsError'));
          setItems([]);
        }
      } finally {
        if (reqId === requestId.current) setLoading(false);
      }
    },
    [id, categoryId, t],
  );

  useEffect(() => {
    loadHeader();
  }, [loadHeader]);

  useEffect(() => {
    if (!categoryId || params.name) return;
    fetchCategories()
      .then((list) => {
        // The id can be either level of the tree, so check the subs too.
        for (const main of list) {
          if (main.id === categoryId) return setResolvedName(main.name.trim());
          const sub = main.subCategories.find((c) => c.id === categoryId);
          if (sub) return setResolvedName(sub.name.trim() || main.name.trim());
        }
      })
      .catch(() => {});
  }, [categoryId, params.name]);

  useEffect(() => {
    const t = setTimeout(() => load(search, onlyDiscrepancy), search ? 350 : 0);
    return () => clearTimeout(t);
  }, [search, onlyDiscrepancy, load]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHeader();
    load(search, onlyDiscrepancy).finally(() => setRefreshing(false));
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
      if (!it || it.completed || edit.counted === '') continue;
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
      await load(search, onlyDiscrepancy);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('count.saveError'));
    } finally {
      setSaving(false);
    }
  }

  const refreshAfterComplete = useCallback(() => {
    setEdits({});
    loadHeader();
    load(search, onlyDiscrepancy);
  }, [loadHeader, load, search, onlyDiscrepancy]);

  const { completing, confirmComplete } = useStockCountComplete({
    id,
    categoryId,
    categoryName,
    onDone: refreshAfterComplete,
  });

  function onCompletePress() {
    if (pending.length > 0) {
      Alert.alert(t('count.unsavedTitle'), t('count.unsavedBody'));
      return;
    }
    confirmComplete();
  }

  /**
   * Variants are ordinary items, so each is its own count line. Sort them in
   * under their parent instead of leaving them scattered by item code.
   */
  const ordered = useMemo(() => {
    const byItemId = new Map(items.map((it) => [it.itemId, it]));
    const children = new Map<string, StockCountItem[]>();
    for (const it of items) {
      const parentId = it.variantOf?.parentItemId;
      if (!parentId || !byItemId.has(parentId)) continue;
      const list = children.get(parentId);
      if (list) list.push(it);
      else children.set(parentId, [it]);
    }
    const out: { item: StockCountItem; isChild: boolean }[] = [];
    for (const it of items) {
      // A variant whose parent is also on this list is emitted with the parent.
      if (it.variantOf && byItemId.has(it.variantOf.parentItemId)) continue;
      out.push({ item: it, isChild: false });
      for (const child of children.get(it.itemId) ?? []) {
        out.push({ item: child, isChild: true });
      }
    }
    return out;
  }, [items]);

  const reasonItem = reasonFor ? items.find((it) => it.detailId === reasonFor) : null;
  const reasonDiff = reasonItem
    ? (parseInt(countedOf(reasonItem), 10) || 0) - reasonItem.systemQty
    : 0;

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={categoryName || t('count.allItems')}
        subtitle={
          locked || categoryLocked
            ? t('count.subtitleLocked')
            : header?.reference || t('count.subtitleActive')
        }
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={80}>
        <FlatList
          data={ordered}
          keyExtractor={(row, index) => `${row.item.detailId}-${index}`}
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
              <View style={styles.filterRow}>
                <ThemedView type="backgroundElement" style={styles.searchBar}>
                  <Ionicons name="search" size={18} color={theme.textSecondary} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={t('filters.searchItem')}
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
                    {t('count.diff')}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          }
          renderItem={({ item: row }) => (
            <CountItemRow
              item={row.item}
              isVariant={row.isChild}
              counted={countedOf(row.item)}
              reason={reasonOf(row.item)}
              locked={locked || row.item.completed}
              onCounted={(v) => setCounted(row.item, v)}
              onOpenReason={() => setReasonFor(row.item.detailId)}
              theme={theme}
            />
          )}
          ListEmptyComponent={
            loading ? (
              <SkeletonList />
            ) : (
              <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                {error ?? t('count.noItems')}
              </ThemedText>
            )
          }
        />

        {!locked && missingReasons > 0 && (
          <View style={[styles.hint, { backgroundColor: `${SHORT}18` }]}>
            <Ionicons name="alert-circle-outline" size={16} color={SHORT} />
            <ThemedText type="small" style={styles.hintText}>
              {t('count.needReasonHint', { n: missingReasons })}
            </ThemedText>
          </View>
        )}

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
                  {pending.length > 0 ? t('count.saveWithCount', { count: pending.length }) : t('common.save')}
                </ThemedText>
              )}
            </Pressable>
            {categoryLocked ? (
              <View style={styles.doneNote}>
                <Ionicons name="lock-closed" size={16} color={OVER} />
                <ThemedText type="small" numberOfLines={1} style={{ color: OVER }}>
                  {t('count.categoryCompleted')}
                </ThemedText>
              </View>
            ) : (
              <Pressable
                onPress={onCompletePress}
                disabled={completing}
                style={({ pressed }) => [
                  styles.completeBtn,
                  (pressed || completing) && styles.pressed,
                ]}>
                {completing ? (
                  <ActivityIndicator color="#ffffff" />
                ) : (
                  <ThemedText numberOfLines={1} style={styles.completeText}>
                    {t('count.complete')}
                  </ThemedText>
                )}
              </Pressable>
            )}
          </View>
        )}
      </KeyboardAvoidingView>

      <ListLoadingOverlay visible={loading && items.length > 0} />

      <OptionSheet
        visible={reasonFor !== null}
        title={reasonDiff > 0 ? t('count.overageReason') : t('count.shortageReason')}
        options={reasonDiff > 0 ? overageReasons : shortageReasons}
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
  const { t } = useTranslation();
  const totals = header.totals;
  return (
    <ThemedView type="backgroundElement" style={styles.totals}>
      <Stat label={t('field.items')} value={totals.totalItems} theme={theme} />
      <Stat label={t('count.counted')} value={totals.countedItems} theme={theme} />
      <Stat label={t('count.shortage')} value={formatMoney(totals.shortageValue)} color={SHORT} theme={theme} />
      <Stat label={t('count.overage')} value={formatMoney(totals.overageValue)} color={OVER} theme={theme} />
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
  isVariant,
  counted,
  reason,
  locked,
  onCounted,
  onOpenReason,
  theme,
}: {
  item: StockCountItem;
  /** Indented under the parent product it varies from. */
  isVariant: boolean;
  counted: string;
  reason: string;
  locked: boolean;
  onCounted: (v: string) => void;
  onOpenReason: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  const { t } = useTranslation();
  const hasCount = counted !== '';
  const diff = hasCount ? (parseInt(counted, 10) || 0) - item.systemQty : 0;
  const diffColor = diff > 0 ? OVER : diff < 0 ? SHORT : theme.textSecondary;
  const variant = item.variantOf ? variantLabel(item.variantOf) : '';

  return (
    <ThemedView type="backgroundElement" style={[styles.card, isVariant && styles.variantCard]}>
      <View style={styles.cardTop}>
        <View style={styles.cardInfo}>
          <View style={styles.nameRow}>
            {isVariant && (
              <Ionicons name="return-down-forward" size={14} color={theme.textSecondary} />
            )}
            <ThemedText type="smallBold" numberOfLines={1} style={styles.name}>
              {item.itemName}
            </ThemedText>
          </View>
          {!!variant && (
            <View style={[styles.variantBadge, { backgroundColor: theme.background }]}>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {variant}
              </ThemedText>
            </View>
          )}
          {item.variants.length > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('count.variantCount', { n: item.variants.length })}
            </ThemedText>
          )}
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {item.itemCode}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('count.system')}: {item.systemQty}
          </ThemedText>
        </View>
        <View style={styles.actualWrap}>
          <ThemedText type="small" themeColor="textSecondary">
            {t('count.counted')}
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
              {diff > 0 ? t('count.over', { n: diff }) : t('count.short', { n: Math.abs(diff) })}
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
                {reason || (diff > 0 ? t('count.selectOverageReason') : t('count.selectShortageReason'))}
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
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.two,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  hintText: {
    flex: 1,
    color: SHORT,
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
  variantCard: {
    marginLeft: Spacing.four,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  name: {
    flex: 1,
  },
  variantBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
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
  completeBtn: {
    flex: 1,
    height: 50,
    borderRadius: Spacing.three,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneNote: {
    flex: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    height: 50,
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
