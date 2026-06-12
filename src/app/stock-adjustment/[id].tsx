import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { isApiConfigured } from '@/api/config';
import { type ApiItem } from '@/api/items';
import { getWarehouses, type ApiOption } from '@/api/purchase-orders';
import {
  createStockAdjustment,
  fetchStockAdjustment,
  type AdjustType,
  type CreateStockAdjustmentBody,
  type StockAdjustment,
} from '@/api/stock-adjustments';
import { ItemSearchSheet } from '@/components/item-search-sheet';
import { OptionSheet } from '@/components/option-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { formatMoney } from '@/data/inventory';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';
const DARK = '#232843';
const INCREASE = '#30A46C';
const DECREASE = '#e5484d';

const ADJUST_TYPES: { key: AdjustType; label: string; icon: 'add' | 'remove' }[] = [
  { key: 'increase', label: 'Increase', icon: 'add' },
  { key: 'decrease', label: 'Decrease', icon: 'remove' },
];

export default function StockAdjustmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === 'new' ? <AdjustmentForm /> : <AdjustmentDetail id={id} />;
}

// ---- Create form ----

function AdjustmentForm() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();

  const [warehouse, setWarehouse] = useState('');
  const [item, setItem] = useState<ApiItem | null>(null);
  const [adjustType, setAdjustType] = useState<AdjustType>('increase');
  const [qty, setQty] = useState('1');
  const [description, setDescription] = useState('');

  const [warehouseOptions, setWarehouseOptions] = useState<ApiOption[]>([]);
  const [warehouseSheet, setWarehouseSheet] = useState(false);
  const [itemSheet, setItemSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Load warehouse dropdown options (with ids) from the API.
  useEffect(() => {
    let active = true;
    getWarehouses()
      .then((options) => {
        if (active) setWarehouseOptions(options);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  async function handleSave() {
    if (submitting) return;
    if (!warehouse) {
      setError('Please select a warehouse.');
      return;
    }
    if (!item) {
      setError('Please select an item.');
      return;
    }
    const adjustQty = parseInt(qty, 10);
    if (!adjustQty || adjustQty <= 0) {
      setError('Enter a quantity greater than zero.');
      return;
    }

    if (!isApiConfigured()) {
      // No backend configured — nothing to persist locally yet.
      router.back();
      return;
    }

    const body: CreateStockAdjustmentBody = {
      warehouse_id: Number(warehouseOptions.find((o) => o.name === warehouse)?.id ?? 0),
      branch_login_id: Number(session?.branch.id ?? 0),
      item_id: Number(item.id),
      adjust_qty: adjustQty,
      adjust_type: adjustType,
      description: description.trim(),
      stock_unique_id: null,
    };

    setError(null);
    setSubmitting(true);
    try {
      await createStockAdjustment(body);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save adjustment.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="New Adjustment"
        subtitle="Adjust stock on hand"
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SelectField
            label="Warehouse"
            value={warehouse}
            placeholder="Please select warehouse"
            icon="business-outline"
            onPress={() => setWarehouseSheet(true)}
            theme={theme}
          />

          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              Item
            </ThemedText>
            <Pressable
              onPress={() => setItemSheet(true)}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.input}>
                {item ? (
                  <View style={styles.itemRow}>
                    <ThemedView type="backgroundSelected" style={styles.thumb}>
                      {item.image ? (
                        <Image
                          source={{ uri: item.image }}
                          style={styles.thumbImage}
                          contentFit="cover"
                        />
                      ) : (
                        <Ionicons name="image-outline" size={18} color={theme.textSecondary} />
                      )}
                    </ThemedView>
                    <View style={styles.itemInfo}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {item.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {item.code}
                      </ThemedText>
                    </View>
                    <Ionicons name="swap-horizontal" size={18} color={theme.textSecondary} />
                  </View>
                ) : (
                  <View style={styles.selectRow}>
                    <Ionicons name="cube-outline" size={18} color={theme.textSecondary} />
                    <ThemedText style={[styles.selectValue, { color: theme.textSecondary }]}>
                      Please select an item
                    </ThemedText>
                    <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
                  </View>
                )}
              </ThemedView>
            </Pressable>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              Adjustment Type
            </ThemedText>
            <View style={styles.segment}>
              {ADJUST_TYPES.map((type) => {
                const active = adjustType === type.key;
                return (
                  <Pressable
                    key={type.key}
                    onPress={() => setAdjustType(type.key)}
                    style={({ pressed }) => [styles.flex, pressed && styles.pressed]}>
                    <ThemedView
                      type={active ? 'backgroundSelected' : 'backgroundElement'}
                      style={[styles.segmentItem, active && { borderColor: BRAND }]}>
                      <Ionicons
                        name={type.icon}
                        size={18}
                        color={active ? BRAND : theme.textSecondary}
                      />
                      <ThemedText
                        type="smallBold"
                        style={{ color: active ? theme.text : theme.textSecondary }}>
                        {type.label}
                      </ThemedText>
                    </ThemedView>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              Quantity
            </ThemedText>
            <ThemedView type="backgroundElement" style={styles.input}>
              <TextInput
                value={qty}
                onChangeText={(t) => setQty(t.replace(/[^0-9]/g, ''))}
                placeholder="0"
                placeholderTextColor={theme.textSecondary}
                keyboardType="number-pad"
                style={[styles.inputText, { color: theme.text }]}
              />
            </ThemedView>
          </View>

          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              Description (optional)
            </ThemedText>
            <ThemedView type="backgroundElement" style={[styles.input, styles.inputMultiline]}>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Reason for adjustment"
                placeholderTextColor={theme.textSecondary}
                multiline
                style={[styles.inputText, { color: theme.text }]}
              />
            </ThemedView>
          </View>

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <Pressable
            onPress={handleSave}
            disabled={submitting}
            style={({ pressed }) => [styles.saveButton, (pressed || submitting) && styles.pressed]}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.saveButtonText}>Save Adjustment</ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={warehouseSheet}
        title="Select warehouse"
        options={warehouseOptions.map((option) => option.name)}
        selected={warehouse}
        onSelect={(value) => {
          setWarehouse(value);
          setError(null);
          setWarehouseSheet(false);
        }}
        onClose={() => setWarehouseSheet(false)}
      />
      <ItemSearchSheet
        visible={itemSheet}
        selectedCodes={item ? [item.code] : []}
        onAdd={(picked) => {
          setItem(picked);
          setError(null);
          setItemSheet(false);
        }}
        onClose={() => setItemSheet(false)}
      />
    </ThemedView>
  );
}

// ---- Read-only detail ----

function formatDateTime(iso: string) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function AdjustmentDetail({ id }: { id: string }) {
  const router = useRouter();
  const theme = useTheme();

  const [adjustment, setAdjustment] = useState<StockAdjustment | null>(null);
  const [warehouses, setWarehouses] = useState<ApiOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchStockAdjustment(id)
      .then((a) => {
        if (active) setAdjustment(a);
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : 'Failed to load adjustment.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  // The adjustment row only carries warehouse_id, so resolve its name.
  useEffect(() => {
    let active = true;
    getWarehouses()
      .then((options) => {
        if (active) setWarehouses(options);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const increase = adjustment?.adjustType === 'increase';
  const color = increase ? INCREASE : DECREASE;
  const warehouseName =
    adjustment?.warehouse ||
    warehouses.find((w) => w.id === adjustment?.warehouseId)?.name ||
    adjustment?.warehouseId ||
    '—';

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={adjustment?.reference || 'Adjustment'}
        subtitle="Adjustment detail"
        onBack={() => router.back()}
      />
      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={BRAND} />
        </View>
      ) : error || !adjustment ? (
        <View style={styles.centered}>
          <ThemedText themeColor="textSecondary">
            {error ?? 'This adjustment no longer exists.'}
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <ThemedView type="backgroundElement" style={styles.summaryCard}>
            <View style={[styles.iconTile, { backgroundColor: `${color}1A` }]}>
              <Ionicons
                name={increase ? 'trending-up' : 'trending-down'}
                size={26}
                color={color}
              />
            </View>
            <ThemedText type="smallBold" numberOfLines={2} style={styles.summaryTitle}>
              {adjustment.itemName || adjustment.reference}
            </ThemedText>
            <ThemedText type="title" style={{ color }}>
              {increase ? '+' : '−'}
              {adjustment.qty}
            </ThemedText>
            <View style={[styles.typePill, { backgroundColor: `${color}22` }]}>
              <ThemedText type="small" style={{ color, fontWeight: '700' }}>
                {increase ? 'Increase' : 'Decrease'}
              </ThemedText>
            </View>
          </ThemedView>

          <ThemedView type="backgroundElement" style={styles.card}>
            <DetailRow label="Reference" value={adjustment.reference} theme={theme} />
            <DetailRow label="Item" value={adjustment.itemName || '—'} theme={theme} divider />
            <DetailRow label="Item code" value={adjustment.itemCode || '—'} theme={theme} divider />
            <DetailRow label="Warehouse" value={warehouseName} theme={theme} divider />
            <DetailRow
              label="Quantity"
              value={`${increase ? '+' : '−'}${adjustment.qty}`}
              theme={theme}
              divider
            />
            {adjustment.cost > 0 ? (
              <DetailRow
                label="Unit cost"
                value={formatMoney(adjustment.cost)}
                theme={theme}
                divider
              />
            ) : null}
            {adjustment.totalCost > 0 ? (
              <DetailRow
                label="Total cost"
                value={formatMoney(adjustment.totalCost)}
                theme={theme}
                divider
              />
            ) : null}
            {adjustment.user ? (
              <DetailRow label="Adjusted by" value={adjustment.user} theme={theme} divider />
            ) : null}
            {adjustment.date ? (
              <DetailRow
                label="Date"
                value={formatDateTime(adjustment.date)}
                theme={theme}
                divider
              />
            ) : null}
          </ThemedView>

          {adjustment.description ? (
            <View style={styles.fieldGroup}>
              <ThemedText type="small" themeColor="textSecondary">
                Description
              </ThemedText>
              <ThemedView type="backgroundElement" style={styles.card}>
                <ThemedText style={styles.descriptionText}>{adjustment.description}</ThemedText>
              </ThemedView>
            </View>
          ) : null}
        </ScrollView>
      )}
    </ThemedView>
  );
}

function DetailRow({
  label,
  value,
  theme,
  divider,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  divider?: boolean;
}) {
  return (
    <View
      style={[styles.detailRow, divider && { borderTopColor: theme.background, borderTopWidth: 1 }]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.detailValue} numberOfLines={2}>
        {value}
      </ThemedText>
    </View>
  );
}

// ---- Shared field ----

function SelectField({
  label,
  value,
  placeholder,
  icon,
  onPress,
  theme,
}: {
  label: string;
  value: string;
  placeholder?: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <View style={styles.fieldGroup}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="backgroundElement" style={styles.input}>
          <View style={styles.selectRow}>
            <Ionicons name={icon} size={18} color={theme.textSecondary} />
            <ThemedText
              numberOfLines={1}
              style={[styles.selectValue, { color: value ? theme.text : theme.textSecondary }]}>
              {value || placeholder}
            </ThemedText>
            <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
          </View>
        </ThemedView>
      </Pressable>
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
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  body: {
    padding: Spacing.four,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  fieldGroup: {
    gap: Spacing.one,
  },
  input: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 52,
    justifyContent: 'center',
  },
  inputMultiline: {
    minHeight: 88,
    paddingVertical: Spacing.two,
  },
  inputText: {
    fontSize: 16,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  selectValue: {
    flex: 1,
    fontSize: 16,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.two,
  },
  thumb: {
    width: 44,
    height: 44,
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
  segment: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  segmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 52,
    borderRadius: Spacing.three,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  error: {
    color: '#e5484d',
  },
  saveButton: {
    height: 52,
    borderRadius: Spacing.three,
    backgroundColor: DARK,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  summaryCard: {
    borderRadius: Spacing.four,
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.four,
  },
  summaryTitle: {
    textAlign: 'center',
  },
  iconTile: {
    width: 56,
    height: 56,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  typePill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 2,
    borderRadius: Spacing.five,
    marginTop: Spacing.one,
  },
  card: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  descriptionText: {
    paddingVertical: Spacing.three,
  },
  pressed: {
    opacity: 0.7,
  },
});
