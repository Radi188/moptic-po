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
import { getWarehouses, type ApiOption } from '@/api/purchase-orders';
import { createTransfer, type CreateTransferBody } from '@/api/transfers';
import { ItemSearchSheet } from '@/components/item-search-sheet';
import { OptionSheet } from '@/components/option-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';
import {
  addTransfer,
  canEditTransfer,
  formatDate,
  getTransfer,
  updateTransfer,
  type TransferItem,
} from '@/data/transfers';

const BRAND = '#232843';
const DARK = '#232843';

function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function TransferFormScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();

  const isNew = id === 'new';
  const existing = useMemo(() => (isNew ? undefined : getTransfer(id)), [id, isNew]);
  const editable = isNew || (existing ? canEditTransfer(existing.status) : false);

  const [date, setDate] = useState(() =>
    existing ? new Date(existing.transactionDate) : new Date(),
  );
  const [fromWarehouse, setFromWarehouse] = useState(existing?.fromWarehouse ?? '');
  const [toWarehouse, setToWarehouse] = useState(existing?.toWarehouse ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [items, setItems] = useState<TransferItem[]>(existing?.items ?? []);

  const [showDate, setShowDate] = useState(false);
  const [sheet, setSheet] = useState<'from' | 'to' | null>(null);
  const [itemSheet, setItemSheet] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [warehouseOptions, setWarehouseOptions] = useState<ApiOption[]>([]);

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

  if (!isNew && !existing) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader title="Not found" onBack={() => router.back()} />
        <View style={styles.centered}>
          <ThemedText themeColor="textSecondary">This transfer no longer exists.</ThemedText>
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
      const found = current.find((item) => item.itemCode === product.code);
      if (found) {
        return current.map((item) =>
          item.id === found.id ? { ...item, qty: item.qty + 1 } : item,
        );
      }
      return [
        ...current,
        {
          id: `tri-${Date.now()}-${Math.round(Math.random() * 1e6)}`,
          itemId: product.id,
          itemCode: product.code,
          itemName: product.name,
          cost: product.cost,
          qty: 1,
          category: '',
          image: product.image ?? '',
          uniqueId: '',
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
    if (!fromWarehouse) {
      setError('Please select the source warehouse.');
      return;
    }
    if (!toWarehouse) {
      setError('Please select the destination warehouse.');
      return;
    }
    if (fromWarehouse === toWarehouse) {
      setError('From and To warehouses must be different.');
      return;
    }
    if (items.length === 0) {
      setError('Add at least one item.');
      return;
    }

    const input = {
      fromWarehouse,
      toWarehouse,
      transactionDate: date.toISOString(),
      description: description.trim(),
      items,
    };

    // Editing stays local (no update endpoint specified yet).
    if (!isNew) {
      updateTransfer(id, input);
      router.back();
      return;
    }

    if (!isApiConfigured()) {
      addTransfer(input);
      router.back();
      return;
    }

    // POST /staff/stock-transfers
    const body: CreateTransferBody = {
      from_warehouse: Number(warehouseOptions.find((o) => o.name === fromWarehouse)?.id ?? 0),
      to_warehouse: Number(warehouseOptions.find((o) => o.name === toWarehouse)?.id ?? 0),
      branch_login_id: Number(session?.branch.id ?? 0),
      date: ymd(date),
      description: description.trim(),
      items: items.map((item) => ({
        item_id: Number(item.itemId),
        item_code: item.itemCode,
        item_name: item.itemName,
        qty: item.qty,
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

  if (!editable && existing) {
    return (
      <ThemedView style={styles.container}>
        <ScreenHeader
          title={existing.reference}
          subtitle="View only"
          onBack={() => router.back()}
        />
        <ScrollView contentContainerStyle={styles.body}>
          <ThemedText type="small" themeColor="textSecondary">
            This transfer is {existing.status} and can&apos;t be edited.
          </ThemedText>
        </ScrollView>
      </ThemedView>
    );
  }

  const fromTo = {
    from: { title: 'From warehouse', value: fromWarehouse, set: setFromWarehouse },
    to: { title: 'To warehouse', value: toWarehouse, set: setToWarehouse },
  };
  const activeSheet = sheet ? fromTo[sheet] : null;

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={isNew ? 'Stock Transfer' : existing!.reference}
        subtitle={isNew ? 'New transfer' : 'Edit transfer'}
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SelectField
            label="From Warehouse"
            value={fromWarehouse}
            placeholder="Please select warehouse"
            icon="exit-outline"
            onPress={() => setSheet('from')}
            theme={theme}
          />
          <SelectField
            label="To Warehouse"
            value={toWarehouse}
            placeholder="Please select warehouse"
            icon="enter-outline"
            onPress={() => setSheet('to')}
            theme={theme}
          />

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

          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              Description
            </ThemedText>
            <ThemedView type="backgroundElement" style={[styles.input, styles.inputMultiline]}>
              <TextInput
                value={description}
                onChangeText={setDescription}
                placeholder="Description"
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
            style={({ pressed }) => [styles.saveButton, (pressed || submitting) && styles.pressed]}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.saveButtonText}>
                {isNew ? 'Save' : 'Save changes'}
              </ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={!!sheet}
        title={activeSheet?.title ?? ''}
        options={warehouseOptions.map((option) => option.name)}
        selected={activeSheet?.value}
        onSelect={(value) => {
          activeSheet?.set(value);
          setError(null);
          setSheet(null);
        }}
        onClose={() => setSheet(null)}
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

function ItemRow({
  item,
  divider,
  theme,
  onIncrement,
  onDecrement,
  onRemove,
}: {
  item: TransferItem;
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
        </View>
      </View>
      <Pressable onPress={onRemove} hitSlop={Spacing.two}>
        <Ionicons name="trash-outline" size={18} color="#e5484d" />
      </Pressable>
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
  chooseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    height: 50,
    borderRadius: Spacing.three,
    backgroundColor: DARK,
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
