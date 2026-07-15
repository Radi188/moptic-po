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
  DECREASE_REASONS,
  INCREASE_REASONS,
  type AdjustReason,
  type AdjustType,
  type CreateStockAdjustmentBody,
  type StockAdjustmentDetail,
  type StockAdjustmentItem,
} from '@/api/stock-adjustments';
import { ItemSearchSheet } from '@/components/item-search-sheet';
import { OptionSheet } from '@/components/option-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTranslation, type TranslateFn } from '@/contexts/i18n';
import { type TranslationKey } from '@/i18n/translations';
import { formatMoney } from '@/data/inventory';
import { SkeletonList } from '@/components/skeleton';
import { useTheme } from '@/hooks/use-theme';

const DARK = '#232843';
const INCREASE = '#30A46C';
const DECREASE = '#e5484d';

const ADJUST_TYPES: { key: AdjustType; icon: 'add' | 'remove' }[] = [
  { key: 'increase', icon: 'add' },
  { key: 'decrease', icon: 'remove' },
];

// Label for each reason code. Which codes belong to which direction lives in
// the API (INCREASE_REASONS / DECREASE_REASONS) so the two never drift.
const REASON_LABELS: Record<AdjustReason, TranslationKey> = {
  found: 'adjustment.reason.found',
  customer_return: 'adjustment.reason.customerReturn',
  supplier_bonus: 'adjustment.reason.supplierBonus',
  correction_in: 'adjustment.reason.correctionIn',
  loss: 'adjustment.reason.loss',
  expired: 'adjustment.reason.expired',
  damaged: 'adjustment.reason.damaged',
  theft: 'adjustment.reason.theft',
  sample: 'adjustment.reason.sample',
  correction_out: 'adjustment.reason.correctionOut',
};

function reasonsForDirection(type: AdjustType): AdjustReason[] {
  return type === 'increase' ? INCREASE_REASONS : DECREASE_REASONS;
}

function reasonLabel(reason: string, t: TranslateFn): string {
  const key = REASON_LABELS[reason as AdjustReason];
  return key ? t(key) : reason;
}

/** One product line in the multi-item adjustment form. */
type AdjustLine = {
  item: ApiItem;
  /** Direction — filters which reason codes are offered and drives +/- display. */
  adjustType: AdjustType;
  /** Category code sent as `adjust_type` (empty until chosen). */
  reason: AdjustReason | '';
  qty: string;
  /** Optional free-text note sent as the item's `description`. */
  note: string;
};

export default function StockAdjustmentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return id === 'new' ? <AdjustmentForm /> : <AdjustmentDetail id={id} />;
}

// ---- Create form ----

function AdjustmentForm() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const { t } = useTranslation();

  const [warehouse, setWarehouse] = useState('');
  const [lines, setLines] = useState<AdjustLine[]>([]);

  const [warehouseOptions, setWarehouseOptions] = useState<ApiOption[]>([]);
  const [warehouseSheet, setWarehouseSheet] = useState(false);
  const [itemSheet, setItemSheet] = useState(false);
  // Code of the line whose reason picker is open (null = closed).
  const [reasonSheetCode, setReasonSheetCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reasonLine = lines.find((l) => l.item.code === reasonSheetCode) ?? null;

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

  // Tapping an item in the sheet toggles it in/out of the line list, so the
  // sheet doubles as a multi-select picker.
  function toggleItem(picked: ApiItem) {
    setError(null);
    setLines((prev) => {
      const exists = prev.some((l) => l.item.code === picked.code);
      if (exists) return prev.filter((l) => l.item.code !== picked.code);
      return [
        ...prev,
        { item: picked, adjustType: 'increase', qty: '1', reason: '', note: '' },
      ];
    });
  }

  function updateLine(code: string, patch: Partial<AdjustLine>) {
    setLines((prev) =>
      prev.map((l) => (l.item.code === code ? { ...l, ...patch } : l)),
    );
  }

  // Reason codes are direction-specific, so switching direction always clears
  // the previously chosen reason.
  function changeLineType(code: string, type: AdjustType) {
    setError(null);
    setLines((prev) =>
      prev.map((l) =>
        l.item.code === code ? { ...l, adjustType: type, reason: '' } : l,
      ),
    );
  }

  function removeLine(code: string) {
    setLines((prev) => prev.filter((l) => l.item.code !== code));
  }

  async function handleSave() {
    if (submitting) return;
    if (!warehouse) {
      setError(t('adjustment.selectWarehouseErr'));
      return;
    }
    if (lines.length === 0) {
      setError(t('adjustment.addItemErr'));
      return;
    }
    const invalid = lines.some((l) => {
      const n = parseInt(l.qty, 10);
      return !n || n <= 0;
    });
    if (invalid) {
      setError(t('adjustment.qtyErr'));
      return;
    }
    if (lines.some((l) => !l.reason)) {
      setError(t('adjustment.reasonErr'));
      return;
    }

    if (!isApiConfigured()) {
      // No backend configured — nothing to persist locally yet.
      router.back();
      return;
    }

    const warehouseId = Number(
      warehouseOptions.find((o) => o.name === warehouse)?.id ?? 0,
    );
    const body: CreateStockAdjustmentBody = {
      warehouse_id: warehouseId,
      branch_login_id: Number(session?.branch.id ?? 0),
      items: lines.map((l) => {
        const note = l.note.trim();
        return {
          item_id: Number(l.item.id),
          adjust_qty: parseInt(l.qty, 10),
          adjust_type: l.reason as AdjustReason,
          ...(note ? { description: note } : {}),
        };
      }),
    };

    setError(null);
    setSubmitting(true);
    try {
      await createStockAdjustment(body);
      router.back();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('adjustment.saveError'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={t('adjustment.newTitle')}
        subtitle={t('adjustment.newSubtitle')}
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <SelectField
            label={t('filters.warehouse')}
            value={warehouse}
            placeholder={t('adjustment.selectWarehousePlaceholder')}
            icon="business-outline"
            onPress={() => setWarehouseSheet(true)}
            theme={theme}
          />

          <View style={styles.fieldGroup}>
            <View style={styles.itemsHeader}>
              <ThemedText type="small" themeColor="textSecondary">
                {t('adjustment.items')}
                {lines.length > 0 ? ` (${lines.length})` : ''}
              </ThemedText>
              <Pressable
                onPress={() => setItemSheet(true)}
                style={({ pressed }) => [styles.addItemBtn, pressed && styles.pressed]}>
                <Ionicons name="add" size={16} color={theme.tint} />
                <ThemedText type="smallBold" style={{ color: theme.tint }}>
                  {t('adjustment.addItem')}
                </ThemedText>
              </Pressable>
            </View>

            {lines.length === 0 ? (
              <Pressable
                onPress={() => setItemSheet(true)}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView type="backgroundElement" style={[styles.input, styles.emptyItems]}>
                  <Ionicons name="cube-outline" size={18} color={theme.textSecondary} />
                  <ThemedText style={[styles.selectValue, { color: theme.textSecondary }]}>
                    {t('adjustment.selectItemPlaceholder')}
                  </ThemedText>
                  <Ionicons name="chevron-forward" size={18} color={theme.textSecondary} />
                </ThemedView>
              </Pressable>
            ) : (
              <View style={styles.lineList}>
                {lines.map((line) => (
                  <LineCard
                    key={line.item.code}
                    line={line}
                    theme={theme}
                    t={t}
                    onChangeType={(type) => changeLineType(line.item.code, type)}
                    onChangeQty={(qty) => updateLine(line.item.code, { qty })}
                    onChangeNote={(note) => updateLine(line.item.code, { note })}
                    onOpenReason={() => setReasonSheetCode(line.item.code)}
                    onRemove={() => removeLine(line.item.code)}
                  />
                ))}
              </View>
            )}
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
              <ThemedText style={styles.saveButtonText}>{t('adjustment.save')}</ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={warehouseSheet}
        title={t('filters.selectWarehouse')}
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
        selectedCodes={lines.map((l) => l.item.code)}
        onAdd={toggleItem}
        onClose={() => setItemSheet(false)}
      />
      <OptionSheet
        visible={reasonLine !== null}
        title={t('adjustment.selectReason')}
        options={
          reasonLine
            ? reasonsForDirection(reasonLine.adjustType).map((code) =>
                reasonLabel(code, t),
              )
            : []
        }
        selected={reasonLine?.reason ? reasonLabel(reasonLine.reason, t) : undefined}
        onSelect={(label) => {
          if (reasonLine) {
            const code = reasonsForDirection(reasonLine.adjustType).find(
              (c) => reasonLabel(c, t) === label,
            );
            if (code) updateLine(reasonLine.item.code, { reason: code });
          }
          setError(null);
          setReasonSheetCode(null);
        }}
        onClose={() => setReasonSheetCode(null)}
      />
    </ThemedView>
  );
}

// ---- Item line ----

function LineCard({
  line,
  theme,
  t,
  onChangeType,
  onChangeQty,
  onChangeNote,
  onOpenReason,
  onRemove,
}: {
  line: AdjustLine;
  theme: ReturnType<typeof useTheme>;
  t: TranslateFn;
  onChangeType: (type: AdjustType) => void;
  onChangeQty: (qty: string) => void;
  onChangeNote: (note: string) => void;
  onOpenReason: () => void;
  onRemove: () => void;
}) {
  const { item } = line;
  return (
    <ThemedView type="backgroundElement" style={styles.lineCard}>
      <View style={styles.itemRow}>
        <ThemedView type="backgroundSelected" style={styles.thumb}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.thumbImage} contentFit="cover" />
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
        <Pressable onPress={onRemove} hitSlop={Spacing.two} style={({ pressed }) => pressed && styles.pressed}>
          <Ionicons name="close-circle" size={22} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.lineControls}>
        <View style={styles.segment}>
          {ADJUST_TYPES.map((type) => {
            const active = line.adjustType === type.key;
            return (
              <Pressable
                key={type.key}
                onPress={() => onChangeType(type.key)}
                style={({ pressed }) => [styles.flex, pressed && styles.pressed]}>
                <ThemedView
                  type={active ? 'backgroundSelected' : 'background'}
                  style={[styles.segmentItem, active && { borderColor: theme.tint }]}>
                  <Ionicons
                    name={type.icon}
                    size={16}
                    color={active ? theme.tint : theme.textSecondary}
                  />
                  <ThemedText
                    type="smallBold"
                    style={{ color: active ? theme.text : theme.textSecondary }}>
                    {t(`adjustment.${type.key}`)}
                  </ThemedText>
                </ThemedView>
              </Pressable>
            );
          })}
        </View>
        <ThemedView type="background" style={styles.qtyInput}>
          <TextInput
            value={line.qty}
            onChangeText={(v) => onChangeQty(v.replace(/[^0-9]/g, ''))}
            placeholder="0"
            placeholderTextColor={theme.textSecondary}
            keyboardType="number-pad"
            style={[styles.inputText, styles.qtyInputText, { color: theme.text }]}
          />
        </ThemedView>
      </View>

      <Pressable onPress={onOpenReason} style={({ pressed }) => pressed && styles.pressed}>
        <ThemedView type="background" style={styles.reasonInput}>
          <Ionicons name="help-circle-outline" size={18} color={theme.textSecondary} />
          <ThemedText
            numberOfLines={1}
            style={[
              styles.selectValue,
              { color: line.reason ? theme.text : theme.textSecondary },
            ]}>
            {line.reason ? reasonLabel(line.reason, t) : t('adjustment.selectReason')}
          </ThemedText>
          <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
        </ThemedView>
      </Pressable>

      <ThemedView type="background" style={styles.noteInput}>
        <TextInput
          value={line.note}
          onChangeText={onChangeNote}
          placeholder={t('adjustment.noteOptional')}
          placeholderTextColor={theme.textSecondary}
          style={[styles.inputText, { color: theme.text }]}
        />
      </ThemedView>
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
  const { t } = useTranslation();

  const [adjustment, setAdjustment] = useState<StockAdjustmentDetail | null>(null);
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
        if (active) setError(e instanceof Error ? e.message : t('adjustment.loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, t]);

  // The transaction only carries warehouse_id, so resolve its name.
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

  const items = adjustment?.items ?? [];
  const warehouseName =
    adjustment?.warehouse ||
    warehouses.find((w) => w.id === adjustment?.warehouseId)?.name ||
    adjustment?.warehouseId ||
    '—';

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title={adjustment?.reference || t('adjustment.detailTitle')}
        subtitle={t('adjustment.detailSubtitle')}
        onBack={() => router.back()}
      />
      {loading ? (
        <View style={styles.body}>
          <SkeletonList />
        </View>
      ) : error || !adjustment ? (
        <View style={styles.centered}>
          <ThemedText themeColor="textSecondary">
            {error ?? t('adjustment.notExist')}
          </ThemedText>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
          <ThemedView type="backgroundElement" style={styles.card}>
            <DetailRow label={t('field.reference')} value={adjustment.reference} theme={theme} />
            <DetailRow label={t('filters.warehouse')} value={warehouseName} theme={theme} divider />
            <DetailRow
              label={t('adjustment.items')}
              value={String(items.length)}
              theme={theme}
              divider
            />
            {adjustment.user ? (
              <DetailRow label={t('field.adjustedBy')} value={adjustment.user} theme={theme} divider />
            ) : null}
            {adjustment.date ? (
              <DetailRow
                label={t('field.date')}
                value={formatDateTime(adjustment.date)}
                theme={theme}
                divider
              />
            ) : null}
          </ThemedView>

          <ThemedText type="small" themeColor="textSecondary">
            {t('adjustment.items')} ({items.length})
          </ThemedText>
          {items.map((item, index) => (
            <DetailItemCard
              key={`${item.itemId}-${index}`}
              item={item}
              theme={theme}
              t={t}
            />
          ))}
        </ScrollView>
      )}
    </ThemedView>
  );
}

function DetailItemCard({
  item,
  theme,
  t,
}: {
  item: StockAdjustmentItem;
  theme: ReturnType<typeof useTheme>;
  t: TranslateFn;
}) {
  const increase = item.adjustType === 'increase';
  const color = increase ? INCREASE : DECREASE;
  return (
    <ThemedView type="backgroundElement" style={styles.lineCard}>
      <View style={styles.itemRow}>
        <ThemedView type="backgroundSelected" style={styles.thumb}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.thumbImage} contentFit="cover" />
          ) : (
            <Ionicons name="image-outline" size={18} color={theme.textSecondary} />
          )}
        </ThemedView>
        <View style={styles.itemInfo}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {item.itemName || item.itemCode || '—'}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {item.itemCode || '—'}
          </ThemedText>
        </View>
        <ThemedText type="smallBold" style={{ color }}>
          {increase ? '+' : '−'}
          {item.qty}
        </ThemedText>
      </View>

      <View style={styles.detailPills}>
        <View style={[styles.typePill, { backgroundColor: `${color}22` }]}>
          <ThemedText type="small" style={{ color, fontWeight: '700' }}>
            {increase ? t('adjustment.increase') : t('adjustment.decrease')}
          </ThemedText>
        </View>
        {item.reason ? (
          <ThemedView type="background" style={styles.reasonPill}>
            <ThemedText type="small" themeColor="textSecondary">
              {reasonLabel(item.reason, t)}
            </ThemedText>
          </ThemedView>
        ) : null}
      </View>

      {item.totalCost > 0 ? (
        <DetailRow label={t('field.totalCost')} value={formatMoney(item.totalCost)} theme={theme} />
      ) : null}
      {item.description ? (
        <ThemedText type="small" themeColor="textSecondary">
          {item.description}
        </ThemedText>
      ) : null}
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
  itemsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  addItemBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.two,
  },
  emptyItems: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  lineList: {
    gap: Spacing.two,
  },
  lineCard: {
    borderRadius: Spacing.three,
    padding: Spacing.three,
    gap: Spacing.three,
  },
  lineControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  qtyInput: {
    width: 88,
    minHeight: 44,
    borderRadius: Spacing.three,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  qtyInputText: {
    textAlign: 'center',
  },
  reasonInput: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  noteInput: {
    minHeight: 44,
    borderRadius: Spacing.three,
    justifyContent: 'center',
    paddingHorizontal: Spacing.three,
  },
  segment: {
    flexDirection: 'row',
    gap: Spacing.two,
    flex: 1,
  },
  segmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 44,
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
  },
  detailPills: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  reasonPill: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 3,
    borderRadius: Spacing.five,
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
