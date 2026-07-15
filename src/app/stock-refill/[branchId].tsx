import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

import { fetchBranchSales, type SoldItem } from '@/api/daily-sales';
import { type ApiItem } from '@/api/items';
import { getWarehouses, type ApiOption } from '@/api/purchase-orders';
import { fetchWarehouseStockMap } from '@/api/stock-on-hand';
import { createTransfer, type CreateTransferBody } from '@/api/transfers';
import { ItemSearchSheet } from '@/components/item-search-sheet';
import { OptionSheet } from '@/components/option-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { SkeletonList } from '@/components/skeleton';
import { useTranslation } from '@/contexts/i18n';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';
import { generateRefillReportPdf, toReportRow } from '@/lib/refill-report';
import { isTelegramConfigured, sendTelegramDocument } from '@/lib/telegram';

const BRAND = '#232843';

/** Local YYYY-MM-DD (avoids the UTC shift of toISOString). */
function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

/** Local "YYYY-MM-DD HH:mm:ss" timestamp for the moment the transfer is created. */
function nowDateTime() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${ymd(d)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/**
 * Resolve a branch's destination warehouse from the warehouse list. Branch ids
 * and warehouse ids are *different* namespaces in this backend (a branch id can
 * collide with an unrelated warehouse id), so we match on name the same way the
 * transfer report does: exact name, then either side containing the other. The
 * source warehouse is excluded so we never default to a self-transfer.
 */
function findBranchWarehouse(
  branchName: string,
  warehouses: ApiOption[],
  sourceId: string,
): ApiOption | null {
  const pool = warehouses.filter((w) => w.id !== sourceId);
  return (
    pool.find((w) => w.name === branchName) ??
    pool.find((w) => w.name.includes(branchName) || branchName.includes(w.name)) ??
    null
  );
}

export default function BranchRefillScreen() {
  const params = useLocalSearchParams<{
    branchId: string;
    branchName: string;
    date: string;
    sourceId: string;
    sourceName: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const { isTablet } = useResponsive();
  const { session } = useAuth();
  const { t } = useTranslation();

  const [rows, setRows] = useState<SoldItem[]>([]);
  // Catalog items the user adds on top of the sold items (e.g. brand-new stock).
  // Kept separate so the sales fetch effect can't clobber them.
  const [extraItems, setExtraItems] = useState<SoldItem[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [bmName, setBmName] = useState('');
  const [stock, setStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Destination warehouse: the branch's own warehouse, picked from the live
  // warehouse list (NOT the branch id). It defaults to a name match but stays
  // editable so the user can correct it before transferring.
  const [warehouseOptions, setWarehouseOptions] = useState<ApiOption[]>([]);
  const [destination, setDestination] = useState<ApiOption | null>(null);
  const [destSheet, setDestSheet] = useState(false);

  useEffect(() => {
    let active = true;
    getWarehouses()
      .then((options) => {
        if (!active) return;
        setWarehouseOptions(options);
        setDestination(
          (prev) => prev ?? findBranchWarehouse(params.branchName, options, params.sourceId),
        );
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [params.branchName, params.sourceId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchBranchSales({ date: params.date, branchId: params.branchId })
      .then((result) => {
        // Sort sold items A–Z by name so both the on-screen list and the
        // Telegram refill report (derived from `rows`) come out alphabetical.
        if (active) {
          setRows(
            [...result.items].sort((a, b) =>
              a.itemName.localeCompare(b.itemName, undefined, { sensitivity: 'base' }),
            ),
          );
        }
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : t('refill.loadSalesError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.date, params.branchId, t]);

  // On-hand quantities in the source warehouse (what's available to transfer out).
  useEffect(() => {
    let active = true;
    setStockLoading(true);
    fetchWarehouseStockMap(params.sourceId)
      .then((map) => {
        if (active) setStock(map);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setStockLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.sourceId]);

  const available = (itemId: string) => stock[itemId] ?? 0;

  // Sold items first, then any items the user added manually (kept at the
  // bottom of the on-screen list). The Telegram report sorts them A–Z instead.
  const allRows = useMemo(() => [...rows, ...extraItems], [rows, extraItems]);

  const selectedCount = useMemo(
    () => allRows.filter((r) => (parseInt(qtys[r.itemId] ?? '', 10) || 0) > 0).length,
    [allRows, qtys],
  );

  function setQty(itemId: string, value: string) {
    setQtys((prev) => ({ ...prev, [itemId]: value.replace(/[^0-9]/g, '') }));
  }

  function fillFromSold() {
    // Set the sold items to their sold qty, preserving any qty typed for the
    // manually added items.
    setQtys((prev) => {
      const next = { ...prev };
      for (const r of rows) next[r.itemId] = String(r.qtySold);
      return next;
    });
  }

  /** Add a catalog item picked from the search sheet (ignores duplicates). */
  function addItem(item: ApiItem) {
    setExtraItems((prev) => {
      if (prev.some((r) => r.itemId === item.id) || rows.some((r) => r.itemId === item.id)) {
        return prev;
      }
      return [
        ...prev,
        {
          itemId: item.id,
          itemCode: item.code,
          itemName: item.name,
          image: item.image ?? '',
          qtySold: 0,
          revenue: 0,
          cost: item.cost,
          profit: 0,
          invoiceCount: 0,
        },
      ];
    });
  }

  function removeItem(itemId: string) {
    setExtraItems((prev) => prev.filter((r) => r.itemId !== itemId));
    setQtys((prev) => {
      const next = { ...prev };
      delete next[itemId];
      return next;
    });
  }

  async function handleTransfer() {
    if (submitting) return;
    if (!destination) {
      setError(t('refill.selectDestFirst'));
      return;
    }
    if (params.sourceId === destination.id) {
      setError(t('refill.sameWarehouse'));
      return;
    }
    const items = allRows
      .map((r) => ({ row: r, qty: parseInt(qtys[r.itemId] ?? '', 10) || 0 }))
      .filter((x) => x.qty > 0);
    if (items.length === 0) {
      setError(t('refill.enterQty'));
      return;
    }
    const over = items.filter(({ row, qty }) => qty > available(row.itemId));
    if (over.length > 0) {
      setError(
        t('refill.notEnoughStock', {
          source: params.sourceName,
          count: over.length,
          unit: over.length === 1 ? t('common.item') : t('common.items'),
          code: over[0].row.itemCode,
          available: available(over[0].row.itemId),
        }),
      );
      return;
    }

    const body: CreateTransferBody = {
      from_warehouse: Number(params.sourceId),
      to_warehouse: Number(destination.id),
      branch_login_id: Number(session?.branch.id ?? 0),
      // The transfer is stamped with the exact moment it's created (now), not
      // the sales day. The sales date is kept in the description for reference.
      date: nowDateTime(),
      description: `Daily refill — ${params.branchName} · Sales date ${params.date}`,
      items: items.map(({ row, qty }) => ({
        item_id: Number(row.itemId),
        item_code: row.itemCode,
        item_name: row.itemName,
        qty,
        is_unique: 0,
      })),
    };

    setError(null);
    setSubmitting(true);
    try {
      await createTransfer(body);
      // The report lists every sold item with the exact transfer-out entered
      // (0 included), so shortages show up in the Less column — unlike the
      // transfer body above, which can only carry qty > 0 rows.
      const reportItems = allRows.map((r) => ({
        row: r,
        qty: parseInt(qtys[r.itemId] ?? '', 10) || 0,
      }));
      await sendRefillReport(reportItems);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('refill.createError'));
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * Generate the control-sheet PDF for the transferred items and push it to the
   * Telegram control group. The transfer has already been created at this point,
   * so a delivery failure is surfaced as an alert but never blocks completion.
   */
  async function sendRefillReport(items: { row: SoldItem; qty: number }[]) {
    if (!isTelegramConfigured()) {
      Alert.alert(
        t('transferDetails.telegramNotConfigured'),
        t('refill.telegramNotConfiguredBody'),
      );
      return;
    }
    try {
      // Sort the report A–Z by item name (sold + manually added interleaved),
      // even though the on-screen list keeps added items at the bottom.
      const reportRows = [...items]
        .sort((a, b) =>
          a.row.itemName.localeCompare(b.row.itemName, undefined, { sensitivity: 'base' }),
        )
        .map(({ row, qty }) => toReportRow(row.itemName, row.qtySold, qty));
      const uri = await generateRefillReportPdf(reportRows, {
        branchName: params.branchName || `Branch ${params.branchId}`,
        sourceName: params.sourceName,
        date: params.date,
        createdDate: ymd(new Date()),
        bmName: bmName.trim(),
      });
      await sendTelegramDocument({
        uri,
        filename: `refill-${params.branchName || params.branchId}-${params.date}.pdf`,
        caption:
          `Stock refill — ${params.branchName || params.branchId} (${params.date})` +
          (bmName.trim() ? `\nBM: ${bmName.trim()}` : ''),
      });
    } catch (e) {
      Alert.alert(
        t('refill.reportNotSent'),
        t('refill.reportNotSentBody', {
          error: e instanceof Error ? e.message : t('common.unknownError'),
        }),
      );
    }
  }

  // One item row, reused by the phone (stacked) and tablet (grid) layouts.
  const renderRow = (row: SoldItem, divider: boolean) => (
    <ItemRow
      key={row.itemId}
      row={row}
      value={qtys[row.itemId] ?? ''}
      available={available(row.itemId)}
      stockLoading={stockLoading}
      onChange={(v) => setQty(row.itemId, v)}
      onRemove={
        extraItems.some((r) => r.itemId === row.itemId) ? () => removeItem(row.itemId) : undefined
      }
      divider={divider}
      theme={theme}
      isTablet={isTablet}
    />
  );

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={params.branchName || t('home.branchFallback', { id: params.branchId })}
        subtitle={t('refill.subtitleFrom')}
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ThemedView type="backgroundElement" style={styles.routeCard}>
            <View style={styles.routeCol}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('filters.from')}
              </ThemedText>
              <ThemedText type="smallBold" numberOfLines={1}>
                {params.sourceName}
              </ThemedText>
            </View>
            <Ionicons name="arrow-forward" size={18} color={theme.textSecondary} />
            <Pressable
              style={styles.routeCol}
              onPress={() => setDestSheet(true)}
              hitSlop={Spacing.two}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('refill.toWarehouse')}
              </ThemedText>
              <View style={styles.destValueRow}>
                <ThemedText
                  type="smallBold"
                  numberOfLines={1}
                  style={[styles.destValue, { color: destination ? theme.text : theme.textSecondary }]}>
                  {destination?.name ?? t('filters.selectWarehouse')}
                </ThemedText>
                <Ionicons name="chevron-down" size={16} color={theme.textSecondary} />
              </View>
            </Pressable>
          </ThemedView>

          <View style={styles.fieldGroup}>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={isTablet ? styles.labelTablet : undefined}>
              {t('refill.bmLabel')}
            </ThemedText>
            <ThemedView
              type="backgroundElement"
              style={[styles.bmInputWrap, isTablet && styles.bmInputWrapTablet]}>
              <Ionicons name="person-outline" size={isTablet ? 22 : 18} color={theme.textSecondary} />
              <TextInput
                value={bmName}
                onChangeText={setBmName}
                placeholder={t('refill.bmPlaceholder')}
                placeholderTextColor={theme.textSecondary}
                autoCapitalize="words"
                style={[styles.bmInput, isTablet && styles.bmInputTablet, { color: theme.text }]}
              />
            </ThemedView>
          </View>

          <View style={styles.sectionHeader}>
            <ThemedText
              type="smallBold"
              style={[styles.sectionTitle, isTablet && styles.sectionTitleTablet]}>
              {t('refill.itemsToTransfer')}
            </ThemedText>
            {rows.length > 0 && (
              <Pressable onPress={fillFromSold} hitSlop={Spacing.two}>
                <ThemedText type="small" style={{ color: BRAND, fontWeight: '700' }}>
                  {t('refill.fillFromSold')}
                </ThemedText>
              </Pressable>
            )}
          </View>

          {loading ? (
            <SkeletonList />
          ) : allRows.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {error ?? t('refill.emptyItems')}
            </ThemedText>
          ) : (
            // One item per row (single column on phone and tablet) so the full
            // product name has the whole width to show.
            <ThemedView type="backgroundElement" style={styles.itemsCard}>
              {allRows.map((row, index) => renderRow(row, index > 0))}
            </ThemedView>
          )}

          {!loading && (
            <Pressable
              onPress={() => setPickerOpen(true)}
              style={({ pressed }) => [
                styles.addItemButton,
                { borderColor: theme.backgroundElement },
                pressed && styles.pressed,
              ]}>
              <Ionicons name="add-circle" size={20} color={BRAND} />
              <ThemedText type="smallBold" style={{ color: BRAND }}>
                {t('refill.addItem')}
              </ThemedText>
            </Pressable>
          )}

          {error && rows.length > 0 ? (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          ) : null}
        </ScrollView>

        <View style={[styles.footer, { borderTopColor: theme.backgroundElement }]}>
          <Pressable
            onPress={handleTransfer}
            disabled={submitting || selectedCount === 0}
            style={({ pressed }) => [
              styles.submit,
              isTablet && styles.submitTablet,
              (pressed || submitting || selectedCount === 0) && styles.pressed,
            ]}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={[styles.submitText, isTablet && styles.submitTextTablet]}>
                {t('refill.createTransfer')}{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={destSheet}
        title={t('refill.destWarehouse')}
        options={warehouseOptions.filter((o) => o.id !== params.sourceId).map((o) => o.name)}
        selected={destination?.name}
        onSelect={(value) => {
          setDestination(warehouseOptions.find((o) => o.name === value) ?? null);
          setError(null);
          setDestSheet(false);
        }}
        onClose={() => setDestSheet(false)}
      />

      <ItemSearchSheet
        visible={pickerOpen}
        selectedCodes={allRows.map((r) => r.itemCode)}
        onAdd={addItem}
        onClose={() => setPickerOpen(false)}
      />
    </ThemedView>
  );
}

function ItemRow({
  row,
  value,
  available,
  stockLoading,
  onChange,
  onRemove,
  divider,
  theme,
  isTablet,
}: {
  row: SoldItem;
  value: string;
  available: number;
  stockLoading: boolean;
  onChange: (v: string) => void;
  onRemove?: () => void;
  divider: boolean;
  theme: ReturnType<typeof useTheme>;
  isTablet: boolean;
}) {
  const { t } = useTranslation();
  const entered = parseInt(value, 10) || 0;
  const over = entered > available;
  const stockColor = available <= 0 ? '#e5484d' : theme.textSecondary;

  return (
    <View
      style={[
        styles.itemRow,
        isTablet && styles.itemRowTablet,
        divider && { borderTopColor: theme.background, borderTopWidth: 1 },
      ]}>
      <ThemedView type="backgroundSelected" style={[styles.thumb, isTablet && styles.thumbTablet]}>
        {row.image ? (
          <Image source={{ uri: row.image }} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Ionicons name="cube-outline" size={isTablet ? 26 : 18} color={theme.textSecondary} />
        )}
      </ThemedView>
      <View style={styles.itemInfo}>
        <ThemedText type="smallBold" style={isTablet ? styles.itemNameTablet : undefined}>
          {row.itemName}
        </ThemedText>
        <ThemedText
          type="small"
          themeColor="textSecondary"
          numberOfLines={1}
          style={isTablet ? styles.itemCodeTablet : undefined}>
          {row.itemCode}
        </ThemedText>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Ionicons name="cart-outline" size={isTablet ? 16 : 12} color={theme.textSecondary} />
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={isTablet ? styles.metaTextTablet : undefined}>
              {t('refill.sold', { n: row.qtySold })}
            </ThemedText>
          </View>
          <View style={styles.metaPill}>
            <Ionicons name="cube-outline" size={isTablet ? 16 : 12} color={stockColor} />
            <ThemedText
              type="small"
              style={[{ color: stockColor }, isTablet && styles.metaTextTablet]}>
              {stockLoading ? t('refill.checking') : t('refill.inStock', { n: available })}
            </ThemedText>
          </View>
        </View>
      </View>
      <ThemedView
        type="background"
        style={[
          styles.qtyInputWrap,
          isTablet && styles.qtyInputWrapTablet,
          over && { borderWidth: 1, borderColor: '#e5484d' },
        ]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="0"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          style={[styles.qtyInput, isTablet && styles.qtyInputTablet, { color: over ? '#e5484d' : theme.text }]}
        />
      </ThemedView>
      {onRemove ? (
        <Pressable onPress={onRemove} hitSlop={Spacing.two} style={styles.removeBtn}>
          <Ionicons name="close-circle" size={isTablet ? 24 : 20} color={theme.textSecondary} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  body: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  routeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.three,
  },
  routeCol: {
    flex: 1,
    gap: Spacing.half,
  },
  destValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  destValue: {
    flexShrink: 1,
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  bmInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    height: 46,
    borderRadius: Spacing.three,
  },
  bmInput: {
    flex: 1,
    fontSize: 15,
    height: '100%',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addItemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 48,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  removeBtn: {
    paddingLeft: Spacing.one,
  },
  sectionTitle: {
    fontSize: 16,
  },
  itemsCard: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  thumb: {
    width: 40,
    height: 40,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  itemInfo: {
    flex: 1,
    gap: Spacing.half,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  metaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
  },
  qtyInputWrap: {
    width: 64,
    height: 40,
    borderRadius: Spacing.two,
    justifyContent: 'center',
  },
  qtyInput: {
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  // Tablet overrides: larger text and taller controls to use the extra space.
  // Khmer glyphs are tall, so each size carries a generous lineHeight (~1.4x)
  // to avoid clipping the stacked marks.
  labelTablet: {
    fontSize: 15,
    lineHeight: 22,
  },
  bmInputWrapTablet: {
    height: 60,
    borderRadius: Spacing.four,
  },
  bmInputTablet: {
    fontSize: 18,
    lineHeight: 26,
  },
  sectionTitleTablet: {
    fontSize: 22,
    lineHeight: 32,
  },
  itemRowTablet: {
    paddingVertical: Spacing.four,
    gap: Spacing.four,
  },
  thumbTablet: {
    width: 56,
    height: 56,
    borderRadius: Spacing.three,
  },
  itemNameTablet: {
    fontSize: 18,
    lineHeight: 26,
  },
  itemCodeTablet: {
    fontSize: 15,
    lineHeight: 22,
  },
  metaTextTablet: {
    fontSize: 14,
    lineHeight: 20,
  },
  qtyInputWrapTablet: {
    width: 96,
    height: 60,
    borderRadius: Spacing.three,
  },
  qtyInputTablet: {
    fontSize: 24,
    lineHeight: 30,
  },
  submitTablet: {
    height: 64,
  },
  submitTextTablet: {
    fontSize: 20,
    lineHeight: 28,
  },
  center: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.six,
  },
  error: {
    color: '#e5484d',
  },
  footer: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.four,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  submit: {
    height: 52,
    borderRadius: Spacing.three,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
