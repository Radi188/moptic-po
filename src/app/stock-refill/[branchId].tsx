import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';

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
  const { session } = useAuth();

  const [rows, setRows] = useState<SoldItem[]>([]);
  const [qtys, setQtys] = useState<Record<string, string>>({});
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
      date: params.date,
      description: `Daily refill — ${params.branchName} (${params.date})`,
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
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create transfer.');
    } finally {
      setSubmitting(false);
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

          <View style={styles.sectionHeader}>
            <ThemedText type="smallBold" style={styles.sectionTitle}>
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
              (pressed || submitting || selectedCount === 0) && styles.pressed,
            ]}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.submitText}>
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
}: {
  row: SoldItem;
  value: string;
  available: number;
  stockLoading: boolean;
  onChange: (v: string) => void;
  divider: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const entered = parseInt(value, 10) || 0;
  const over = entered > available;
  const stockColor = available <= 0 ? '#e5484d' : theme.textSecondary;

  return (
    <View
      style={[styles.itemRow, divider && { borderTopColor: theme.background, borderTopWidth: 1 }]}>
      <ThemedView type="backgroundSelected" style={styles.thumb}>
        {row.image ? (
          <Image source={{ uri: row.image }} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Ionicons name="cube-outline" size={18} color={theme.textSecondary} />
        )}
      </ThemedView>
      <View style={styles.itemInfo}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {row.itemName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {row.itemCode}
        </ThemedText>
        <View style={styles.metaRow}>
          <View style={styles.metaPill}>
            <Ionicons name="cart-outline" size={12} color={theme.textSecondary} />
            <ThemedText type="small" themeColor="textSecondary">
              Sold {row.qtySold}
            </ThemedText>
          </View>
          <View style={styles.metaPill}>
            <Ionicons name="cube-outline" size={12} color={stockColor} />
            <ThemedText type="small" style={{ color: stockColor }}>
              {stockLoading ? 'Checking…' : `In stock ${available}`}
            </ThemedText>
          </View>
        </View>
      </View>
      <ThemedView
        type="background"
        style={[styles.qtyInputWrap, over && { borderWidth: 1, borderColor: '#e5484d' }]}>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="0"
          placeholderTextColor={theme.textSecondary}
          keyboardType="number-pad"
          style={[styles.qtyInput, { color: over ? '#e5484d' : theme.text }]}
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
