import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
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

import { isApiConfigured } from '@/api/config';
import { type ApiItem } from '@/api/items';
import {
  createPurchaseOrder,
  getVendors,
  getWarehouses,
  type ApiOption,
  type CreatePurchaseOrderBody,
} from '@/api/purchase-orders';
import { ItemSearchSheet } from '@/components/item-search-sheet';
import { OptionSheet } from '@/components/option-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { StatusBadge } from '@/components/status-badge';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import {
  addPurchaseOrder,
  canEditOrder,
  formatDate,
  formatDateTime,
  formatMoney,
  getPurchaseOrder,
  itemsAmount,
  itemTotal,
  updatePurchaseOrder,
  type PurchaseOrderItem,
} from '@/data/purchase-orders';

const BRAND = '#232843';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** Local "YYYY-MM-DD HH:mm:ss" — keeps the time so it isn't recorded as 12:00. */
function toApiDateTime(d: Date) {
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
  );
}

export default function PurchaseOrderFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();

  const isNew = id === 'new';
  const existing = useMemo(() => (isNew ? undefined : getPurchaseOrder(id)), [id, isNew]);
  const editable = isNew || (existing ? canEditOrder(existing.status) : false);

  const [date, setDate] = useState(() =>
    existing ? new Date(existing.transactionDate) : new Date(),
  );
  const [vendor, setVendor] = useState(existing?.vendor ?? '');
  const [warehouse, setWarehouse] = useState(existing?.warehouse ?? '');
  const [discount, setDiscount] = useState(existing ? String(existing.discountAmount) : '0');
  const [note, setNote] = useState(existing?.description ?? '');
  const [items, setItems] = useState<PurchaseOrderItem[]>(existing?.items ?? []);

  const [showDate, setShowDate] = useState(false);
  const [vendorSheet, setVendorSheet] = useState(false);
  const [warehouseSheet, setWarehouseSheet] = useState(false);
  const [itemSheet, setItemSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [vendorOptions, setVendorOptions] = useState<ApiOption[]>([]);
  const [warehouseOptions, setWarehouseOptions] = useState<ApiOption[]>([]);

  // Load vendor + warehouse dropdowns from the API (falls back to mock data).
  useEffect(() => {
    let active = true;
    Promise.all([getVendors(), getWarehouses()])
      .then(([vendors, warehouses]) => {
        if (!active) return;
        setVendorOptions(vendors);
        setWarehouseOptions(warehouses);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const amount = itemsAmount(items);
  const total = Math.max(0, amount - (parseFloat(discount) || 0));

  if (!isNew && !existing) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title="Not found" onBack={() => router.back()} />
        <View style={styles.centered}>
          <ThemedText themeColor="textSecondary">This order no longer exists.</ThemedText>
        </View>
      </ThemedView>
    );
  }

  function onChangeDate(event: DateTimePickerEvent, selected?: Date) {
    if (Platform.OS === 'android') setShowDate(false);
    if (event.type === 'dismissed') return;
    if (selected) setDate(selected);
  }

  function addItem(product: ApiItem) {
    setItems((current) => {
      const existingItem = current.find((item) => item.itemCode === product.code);
      if (existingItem) {
        return current.map((item) =>
          item.id === existingItem.id ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [
        ...current,
        {
          id: `poi-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
          itemId: product.id,
          itemCode: product.code,
          itemName: product.name,
          cost: product.cost,
          qty: 1,
          image: product.image,
        },
      ];
    });
  }

  function changeQty(itemId: string, delta: number) {
    setItems((current) =>
      current.map((item) =>
        item.id === itemId ? { ...item, qty: Math.max(1, item.qty + delta) } : item,
      ),
    );
  }

  function removeItem(itemId: string) {
    setItems((current) => current.filter((item) => item.id !== itemId));
  }

  async function handleSave() {
    if (submitting) return;
    if (!vendor) {
      setError('Please select a vendor.');
      return;
    }
    if (!warehouse) {
      setError('Please select a warehouse.');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one item.');
      return;
    }

    const input = {
      transactionDate: date.toISOString(),
      vendor,
      warehouse,
      discountAmount: parseFloat(discount) || 0,
      description: note.trim(),
      items,
    };

    // Editing stays local (no update endpoint specified yet).
    if (!isNew) {
      updatePurchaseOrder(id, input);
      router.back();
      return;
    }

    // Without an API URL configured, fall back to the in-memory store.
    if (!isApiConfigured()) {
      addPurchaseOrder(input);
      router.back();
      return;
    }

    // POST /api/v1/staff/purchase-orders — one-to-one with the form.
    const body: CreatePurchaseOrderBody = {
      date: toApiDateTime(date),
      discount_amount: parseFloat(discount) || 0,
      vendor_id: vendorOptions.find((option) => option.name === vendor)?.id ?? '',
      warehouse_id: warehouseOptions.find((option) => option.name === warehouse)?.id ?? '',
      branch_login_id: session?.branch.id ?? '',
      note: note.trim(),
      items: items.map((item) => ({
        item_id: item.itemId,
        item_code: item.itemCode,
        item_name: item.itemName,
        cost: item.cost,
        qty: item.qty,
        discount_amount: 0,
        is_unique: false,
      })),
    };

    setError(null);
    setSubmitting(true);
    try {
      await createPurchaseOrder(body);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create purchase order.');
    } finally {
      setSubmitting(false);
    }
  }

  // Read-only view for orders that can't be edited (reached via long-press).
  if (!editable && existing) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader
          title={existing.reference}
          subtitle="View only"
          right={existing.status ? <StatusBadge status={existing.status} /> : undefined}
          onBack={() => router.back()}
        />
        <ScrollView contentContainerStyle={styles.body}>
          <ThemedText type="small" themeColor="textSecondary">
            This order is {existing.status} and can&apos;t be edited.
          </ThemedText>
          <ThemedView type="backgroundElement" style={styles.readonlyCard}>
            <DetailRow label="Reference" value={existing.reference} />
            <DetailRow label="Transaction Date" value={formatDateTime(existing.transactionDate)} />
            <DetailRow label="Vendor" value={existing.vendor} />
            <DetailRow label="Warehouse" value={existing.warehouse} />
            <DetailRow label="Amount" value={formatMoney(existing.amount)} />
            <DetailRow label="Discount" value={formatMoney(existing.discountAmount)} />
            <DetailRow label="Total" value={formatMoney(existing.totalAmount)} accent last />
          </ThemedView>
        </ScrollView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={isNew ? 'Purchasing' : existing!.reference}
        subtitle={isNew ? 'New purchase order' : 'Edit order'}
        right={!isNew && existing?.status ? <StatusBadge status={existing.status} /> : undefined}
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SelectField
            label="Transaction Date"
            value={formatDate(date.toISOString())}
            icon="calendar-outline"
            onPress={() => setShowDate(true)}
            theme={theme}
          />
          {showDate && (
            <DateTimePicker value={date} mode="date" display="default" onChange={onChangeDate} />
          )}

          <SelectField
            label="Vendor"
            value={vendor}
            placeholder="Please select vendor"
            icon="storefront-outline"
            onPress={() => setVendorSheet(true)}
            theme={theme}
          />

          <SelectField
            label="Warehouse"
            value={warehouse}
            placeholder="Please select warehouse"
            icon="business-outline"
            onPress={() => setWarehouseSheet(true)}
            theme={theme}
          />

          <View style={styles.amountRow}>
            <ReadOnlyField label="Amount" value={formatMoney(amount)} style={styles.amountCol} />
            <View style={styles.amountCol}>
              <ThemedText type="small" themeColor="textSecondary">
                Discount Amount
              </ThemedText>
              <ThemedView type="backgroundElement" style={styles.input}>
                <TextInput
                  value={discount}
                  onChangeText={setDiscount}
                  keyboardType="decimal-pad"
                  placeholder="0"
                  placeholderTextColor={theme.textSecondary}
                  style={[styles.inputText, { color: theme.text }]}
                />
              </ThemedView>
            </View>
          </View>

          <ReadOnlyField label="Total Amount" value={formatMoney(total)} accent />

          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              Note
            </ThemedText>
            <ThemedView type="backgroundElement" style={[styles.input, styles.inputMultiline]}>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="Note"
                placeholderTextColor={theme.textSecondary}
                multiline
                style={[styles.inputText, { color: theme.text }]}
              />
            </ThemedView>
          </View>

          <Pressable
            onPress={() => setItemSheet(true)}
            style={({ pressed }) => [styles.chooseButton, pressed && styles.pressed]}>
            <Ionicons name="search" size={18} color="#ffffff" />
            <ThemedText style={styles.chooseButtonText}>Choose Items</ThemedText>
          </Pressable>

          <View style={styles.selectedHeader}>
            <ThemedText type="smallBold" style={styles.selectedTitle}>
              Selected Items
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </ThemedText>
          </View>

          {items.length === 0 ? (
            <ThemedView type="backgroundElement" style={styles.emptyCard}>
              <Ionicons name="cube-outline" size={32} color={theme.textSecondary} />
              <ThemedText type="small" themeColor="textSecondary">
                No items selected yet.
              </ThemedText>
            </ThemedView>
          ) : (
            <ThemedView type="backgroundElement" style={styles.itemsCard}>
              {items.map((item, index) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  divider={index > 0}
                  theme={theme}
                  onIncrement={() => changeQty(item.id, 1)}
                  onDecrement={() => changeQty(item.id, -1)}
                  onRemove={() => removeItem(item.id)}
                />
              ))}
            </ThemedView>
          )}

          {error && (
            <ThemedText type="small" style={styles.error}>
              {error}
            </ThemedText>
          )}

          <Pressable
            onPress={handleSave}
            disabled={submitting}
            style={({ pressed }) => [
              styles.saveButton,
              (pressed || submitting) && styles.pressed,
            ]}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.saveButtonText}>
                {isNew ? 'Purchase' : 'Save changes'}
              </ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={vendorSheet}
        title="Select vendor"
        options={vendorOptions.map((option) => option.name)}
        selected={vendor}
        onSelect={(value) => {
          setVendor(value);
          setError(null);
          setVendorSheet(false);
        }}
        onClose={() => setVendorSheet(false)}
      />
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
        selectedCodes={items.map((item) => item.itemCode)}
        onAdd={addItem}
        onClose={() => setItemSheet(false)}
      />
    </ThemedView>
  );
}

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

function ReadOnlyField({
  label,
  value,
  accent,
  style,
}: {
  label: string;
  value: string;
  accent?: boolean;
  style?: object;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.fieldGroup, style]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedView type="backgroundElement" style={styles.input}>
        <ThemedText type="smallBold" style={[styles.readonlyValue, accent && { color: theme.tint }]}>
          {value}
        </ThemedText>
      </ThemedView>
    </View>
  );
}

function ItemRow({
  item,
  divider,
  theme,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  item: PurchaseOrderItem;
  divider: boolean;
  theme: ReturnType<typeof useTheme>;
  onIncrement: () => void;
  onDecrement: () => void;
  onRemove: () => void;
}) {
  return (
    <View
      style={[styles.itemRow, divider && { borderTopColor: theme.background, borderTopWidth: 1 }]}>
      <ThemedView type="backgroundSelected" style={styles.thumb}>
        {item.image ? (
          <Image source={{ uri: item.image }} style={styles.thumbImage} contentFit="cover" />
        ) : (
          <Ionicons name="image-outline" size={18} color={theme.textSecondary} />
        )}
      </ThemedView>
      <View style={styles.itemInfo}>
        <ThemedText type="smallBold" numberOfLines={1}>
          {item.itemName}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {item.itemCode}
        </ThemedText>
        <View style={styles.qtyRow}>
          <Stepper icon="remove" onPress={onDecrement} theme={theme} />
          <ThemedText type="smallBold" style={styles.qtyValue}>
            {item.qty}
          </ThemedText>
          <Stepper icon="add" onPress={onIncrement} theme={theme} />
          <ThemedText type="small" themeColor="textSecondary">
            × {formatMoney(item.cost)}
          </ThemedText>
        </View>
      </View>
      <View style={styles.itemRight}>
        <ThemedText type="smallBold">{formatMoney(itemTotal(item))}</ThemedText>
        <Pressable onPress={onRemove} hitSlop={Spacing.two}>
          <Ionicons name="trash-outline" size={18} color="#e5484d" />
        </Pressable>
      </View>
    </View>
  );
}

function Stepper({
  icon,
  onPress,
  theme,
}: {
  icon: 'add' | 'remove';
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepper,
        { borderColor: theme.backgroundSelected },
        pressed && styles.pressed,
      ]}>
      <Ionicons name={icon} size={16} color={theme.text} />
    </Pressable>
  );
}

function DetailRow({
  label,
  value,
  accent,
  last,
}: {
  label: string;
  value: string;
  accent?: boolean;
  last?: boolean;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.detailRow,
        !last && { borderBottomColor: theme.background, borderBottomWidth: 1 },
      ]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={accent ? { color: theme.tint } : undefined}>
        {value}
      </ThemedText>
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
  readonlyValue: {
    fontSize: 16,
  },
  amountRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  amountCol: {
    flex: 1,
    gap: Spacing.one,
  },
  chooseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 50,
    borderRadius: Spacing.three,
    backgroundColor: '#232843',
    marginTop: Spacing.one,
  },
  chooseButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  selectedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  selectedTitle: {
    fontSize: 16,
  },
  emptyCard: {
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.six,
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
    gap: Spacing.one,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.half,
  },
  qtyValue: {
    minWidth: 20,
    textAlign: 'center',
  },
  stepper: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemRight: {
    alignItems: 'flex-end',
    gap: Spacing.two,
  },
  readonlyCard: {
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
  error: {
    color: '#e5484d',
  },
  saveButton: {
    height: 52,
    borderRadius: Spacing.three,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
