import { useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney } from '@/data/purchase-orders';


type PickerProduct = { code: string; name: string; cost: number };

type Props<T extends PickerProduct> = {
  visible: boolean;
  products: T[];
  /** Codes already added, so the sheet can show a checkmark. */
  selectedCodes: string[];
  onAdd: (product: T) => void;
  onClose: () => void;
};

export function ItemPickerSheet<T extends PickerProduct>({
  visible,
  products,
  selectedCodes,
  onAdd,
  onClose,
}: Props<T>) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [search, setSearch] = useState('');

  const results = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (p) => p.code.toLowerCase().includes(term) || p.name.toLowerCase().includes(term),
    );
  }, [search, products]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
          <ThemedView style={styles.handle} type="backgroundSelected" />
          <View style={styles.titleRow}>
            <ThemedText type="subtitle" style={styles.title}>
              Choose Items
            </ThemedText>
            <Pressable onPress={onClose} hitSlop={Spacing.two}>
              <ThemedText type="smallBold" style={{ color: theme.tint }}>
                Done
              </ThemedText>
            </Pressable>
          </View>

          <ThemedView type="backgroundElement" style={styles.searchBar}>
            <Ionicons name="search" size={18} color={theme.textSecondary} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search item code or name"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.searchInput, { color: theme.text }]}
            />
          </ThemedView>

          <ScrollView bounces={false} keyboardShouldPersistTaps="handled">
            {results.map((product) => {
              const added = selectedCodes.includes(product.code);
              return (
                <Pressable
                  key={product.code}
                  onPress={() => onAdd(product)}
                  style={({ pressed }) => pressed && styles.pressed}>
                  <ThemedView type="backgroundElement" style={styles.row}>
                    <ThemedView type="backgroundSelected" style={styles.thumb}>
                      <Ionicons name="image-outline" size={18} color={theme.textSecondary} />
                    </ThemedView>
                    <View style={styles.rowText}>
                      <ThemedText type="smallBold" numberOfLines={1}>
                        {product.name}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {product.code}
                      </ThemedText>
                    </View>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatMoney(product.cost)}
                    </ThemedText>
                    <Ionicons
                      name={added ? 'checkmark-circle' : 'add-circle-outline'}
                      size={24}
                      color={added ? '#30A46C' : theme.tint}
                    />
                  </ThemedView>
                </Pressable>
              );
            })}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    gap: Spacing.three,
    maxHeight: '85%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 22,
    lineHeight: 28,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    paddingRight: Spacing.three,
    borderRadius: Spacing.three,
    marginBottom: Spacing.two,
  },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: Spacing.two,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
