import { useRouter } from 'expo-router';
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

import { getWarehouses, type ApiOption } from '@/api/purchase-orders';
import { startStockCount } from '@/api/stock-count';
import { OptionSheet } from '@/components/option-sheet';
import { ScreenHeader } from '@/components/screen-header';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';

function ymd(d: Date) {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function NewStockCountScreen() {
  const router = useRouter();
  const theme = useTheme();
  const { session } = useAuth();
  const branchId = session?.branch.id;

  const [warehouse, setWarehouse] = useState<ApiOption | null>(null);
  const [warehouseOptions, setWarehouseOptions] = useState<ApiOption[]>([]);
  const [warehouseSheet, setWarehouseSheet] = useState(false);
  const [inStockOnly, setInStockOnly] = useState(true);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    getWarehouses()
      .then((options) => {
        setWarehouseOptions(options);
        setWarehouse((prev) => prev ?? options[0] ?? null);
      })
      .catch(() => {});
  }, []);

  async function handleStart() {
    if (starting) return;
    if (!warehouse) {
      setError('Please select a warehouse.');
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const count = await startStockCount({
        branchId: branchId ?? '',
        warehouseId: warehouse.id,
        countDate: ymd(new Date()),
        note: note.trim(),
        inStockOnly,
      });
      // Replace so Back returns to the history list, not this form.
      router.replace({ pathname: '/stock-count/[id]', params: { id: count.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start the count.');
      setStarting(false);
    }
  }

  return (
    <ThemedView style={styles.container}>
      <ScreenHeader
        title="New Stock Count"
        subtitle="Snapshot a warehouse to count"
        onBack={() => router.back()}
      />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              Warehouse
            </ThemedText>
            <Pressable
              onPress={() => setWarehouseSheet(true)}
              style={({ pressed }) => pressed && styles.pressed}>
              <ThemedView type="backgroundElement" style={styles.input}>
                <View style={styles.selectRow}>
                  <Ionicons name="business-outline" size={18} color={theme.textSecondary} />
                  <ThemedText
                    numberOfLines={1}
                    style={[
                      styles.selectValue,
                      { color: warehouse ? theme.text : theme.textSecondary },
                    ]}>
                    {warehouse?.name ?? 'Select warehouse'}
                  </ThemedText>
                  <Ionicons name="chevron-down" size={18} color={theme.textSecondary} />
                </View>
              </ThemedView>
            </Pressable>
          </View>

          <Pressable
            onPress={() => setInStockOnly((v) => !v)}
            style={({ pressed }) => pressed && styles.pressed}>
            <ThemedView type="backgroundElement" style={styles.toggleRow}>
              <View style={styles.toggleText}>
                <ThemedText type="smallBold">In-stock items only</ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Skip items the system shows as zero
                </ThemedText>
              </View>
              <Ionicons
                name={inStockOnly ? 'checkbox' : 'square-outline'}
                size={24}
                color={inStockOnly ? theme.tint : theme.textSecondary}
              />
            </ThemedView>
          </Pressable>

          <View style={styles.fieldGroup}>
            <ThemedText type="small" themeColor="textSecondary">
              Note (optional)
            </ThemedText>
            <ThemedView type="backgroundElement" style={[styles.input, styles.inputMultiline]}>
              <TextInput
                value={note}
                onChangeText={setNote}
                placeholder="e.g. Month-end count"
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
            onPress={handleStart}
            disabled={starting}
            style={({ pressed }) => [styles.startButton, (pressed || starting) && styles.pressed]}>
            {starting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <ThemedText style={styles.startText}>Start Count</ThemedText>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      <OptionSheet
        visible={warehouseSheet}
        title="Select warehouse"
        options={warehouseOptions.map((o) => o.name)}
        selected={warehouse?.name}
        onSelect={(value) => {
          setWarehouse(warehouseOptions.find((o) => o.name === value) ?? null);
          setError(null);
          setWarehouseSheet(false);
        }}
        onClose={() => setWarehouseSheet(false)}
      />
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
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    minHeight: 64,
    borderRadius: Spacing.three,
  },
  toggleText: {
    flex: 1,
    gap: Spacing.half,
  },
  error: {
    color: '#e5484d',
  },
  startButton: {
    height: 52,
    borderRadius: Spacing.three,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.two,
  },
  startText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
