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
import { fetchWarehouseStockMap } from '@/api/stock-on-hand';
import { createTransfer, type CreateTransferBody } from '@/api/transfers';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { SkeletonList } from '@/components/skeleton';
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

export default function BranchRefillScreen() {
  const params = useLocalSearchParams<{
    branchId: string;
    branchName: string;
    warehouseId: string;
    date: string;
    sourceId: string;
    sourceName: string;
  }>();
  const router = useRouter();
  const theme = useTheme();
  const { isTablet } = useResponsive();
  const { session } = useAuth();

  const [rows, setRows] = useState<SoldItem[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const [bmName, setBmName] = useState('');
  const [stock, setStock] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [stockLoading, setStockLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchBranchSales({ date: params.date, branchId: params.branchId })
      .then((result) => {
        if (active) setRows(result.items);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load sales.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [params.date, params.branchId]);

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

  const selectedCount = useMemo(
    () => rows.filter((r) => (parseInt(qtys[r.itemId] ?? '', 10) || 0) > 0).length,
    [rows, qtys],
  );

  function setQty(itemId: string, value: string) {
    setQtys((prev) => ({ ...prev, [itemId]: value.replace(/[^0-9]/g, '') }));
  }

  function fillFromSold() {
    const next: Record<string, string> = {};
    for (const r of rows) next[r.itemId] = String(r.qtySold);
    setQtys(next);
  }

  async function handleTransfer() {
    if (submitting) return;
    if (params.sourceId === params.warehouseId) {
      setError('Source and destination warehouses are the same.');
      return;
    }
    const items = rows
      .map((r) => ({ row: r, qty: parseInt(qtys[r.itemId] ?? '', 10) || 0 }))
      .filter((x) => x.qty > 0);
    if (items.length === 0) {
      setError('Enter a refill quantity for at least one item.');
      return;
    }
    const over = items.filter(({ row, qty }) => qty > available(row.itemId));
    if (over.length > 0) {
      setError(
        `Not enough stock in ${params.sourceName} for ${over.length} ${
          over.length === 1 ? 'item' : 'items'
        } (e.g. ${over[0].row.itemCode}: ${available(over[0].row.itemId)} available).`,
      );
      return;
    }

    const body: CreateTransferBody = {
      from_warehouse: Number(params.sourceId),
      to_warehouse: Number(params.warehouseId),
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
      const reportItems = rows.map((r) => ({
        row: r,
        qty: parseInt(qtys[r.itemId] ?? '', 10) || 0,
      }));
      await sendRefillReport(reportItems);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create transfer.');
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
        'Telegram not configured',
        'The Telegram bot token / chat ID are missing in this build, so the refill report was not sent.',
      );
      return;
    }
    try {
      const reportRows = items.map(({ row, qty }) =>
        toReportRow(row.itemName, row.qtySold, qty),
      );
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
        'Report not sent',
        `The transfer was created, but the Telegram report could not be sent.\n\n${
          e instanceof Error ? e.message : 'Unknown error.'
        }`,
      );
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={params.branchName || `Branch ${params.branchId}`}
        subtitle="Refill from daily sales"
        onBack={() => router.back()}
      />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <ThemedView type="backgroundElement" style={styles.routeCard}>
            <View style={styles.routeCol}>
              <ThemedText type="small" themeColor="textSecondary">
                From
              </ThemedText>
              <ThemedText type="smallBold" numberOfLines={1}>
                {params.sourceName}
              </ThemedText>
            </View>
            <Ionicons name="arrow-forward" size={18} color={theme.textSecondary} />
            <View style={styles.routeCol}>
              <ThemedText type="small" themeColor="textSecondary">
                To
              </ThemedText>
              <ThemedText type="smallBold" numberOfLines={1}>
                {params.branchName || `Branch ${params.branchId}`}
              </ThemedText>
            </View>
          </ThemedView>

          <View style={styles.fieldGroup}>
            <ThemedText
              type="small"
              themeColor="textSecondary"
              style={isTablet ? styles.labelTablet : undefined}>
              BM name (controls the branch)
            </ThemedText>
            <ThemedView
              type="backgroundElement"
              style={[styles.bmInputWrap, isTablet && styles.bmInputWrapTablet]}>
              <Ionicons name="person-outline" size={isTablet ? 22 : 18} color={theme.textSecondary} />
              <TextInput
                value={bmName}
                onChangeText={setBmName}
                placeholder="Enter BM name for the report"
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
              Sold items
            </ThemedText>
            {rows.length > 0 && (
              <Pressable onPress={fillFromSold} hitSlop={Spacing.two}>
                <ThemedText type="small" style={{ color: BRAND, fontWeight: '700' }}>
                  Fill from sold
                </ThemedText>
              </Pressable>
            )}
          </View>

          {loading ? (
            <SkeletonList />
          ) : rows.length === 0 ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
              {error ?? 'No items were sold by this branch on this day.'}
            </ThemedText>
          ) : (
            <ThemedView type="backgroundElement" style={styles.itemsCard}>
              {rows.map((row, index) => (
                <ItemRow
                  key={row.itemId}
                  row={row}
                  value={qtys[row.itemId] ?? ''}
                  available={available(row.itemId)}
                  stockLoading={stockLoading}
                  onChange={(v) => setQty(row.itemId, v)}
                  divider={index > 0}
                  theme={theme}
                  isTablet={isTablet}
                />
              ))}
            </ThemedView>
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
                Create Transfer{selectedCount > 0 ? ` (${selectedCount})` : ''}
              </ThemedText>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </ThemedView>
  );
}

function ItemRow({
  row,
  value,
  available,
  stockLoading,
  onChange,
  divider,
  theme,
  isTablet,
}: {
  row: SoldItem;
  value: string;
  available: number;
  stockLoading: boolean;
  onChange: (v: string) => void;
  divider: boolean;
  theme: ReturnType<typeof useTheme>;
  isTablet: boolean;
}) {
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
        <ThemedText
          type="smallBold"
          numberOfLines={1}
          style={isTablet ? styles.itemNameTablet : undefined}>
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
              Sold {row.qtySold}
            </ThemedText>
          </View>
          <View style={styles.metaPill}>
            <Ionicons name="cube-outline" size={isTablet ? 16 : 12} color={stockColor} />
            <ThemedText
              type="small"
              style={[{ color: stockColor }, isTablet && styles.metaTextTablet]}>
              {stockLoading ? 'Checking…' : `In stock ${available}`}
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
