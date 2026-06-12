import { Image } from 'expo-image';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney, stockLevel, STOCK_META, type InventoryProduct } from '@/data/inventory';

const BRAND = '#232843';
const DANGER = '#e5484d';

type Props = {
  product: InventoryProduct | null;
  onClose: () => void;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

export function ProductDetailsSheet({ product, onClose, onEdit, onDelete }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  function confirmDelete() {
    if (!product) return;
    Alert.alert('Delete product', `Delete "${product.name}"? This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => onDelete(product.id) },
    ]);
  }

  const level = product ? stockLevel(product) : 'in';
  const levelMeta = STOCK_META[level];

  return (
    <Modal visible={!!product} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
          <ThemedView style={styles.handle} type="backgroundSelected" />

          {product && (
            <>
              <View style={styles.titleRow}>
                <ThemedView type="backgroundSelected" style={styles.thumb}>
                  {product.thumbnail ? (
                    <Image source={{ uri: product.thumbnail }} style={styles.thumbImage} contentFit="cover" />
                  ) : (
                    <Ionicons name="cube-outline" size={26} color={theme.textSecondary} />
                  )}
                </ThemedView>
                <View style={styles.titleText}>
                  <ThemedText type="subtitle" style={styles.title} numberOfLines={2}>
                    {product.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {product.code}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.badges}>
                <View style={[styles.badge, { backgroundColor: `${levelMeta.color}22` }]}>
                  <View style={[styles.dot, { backgroundColor: levelMeta.color }]} />
                  <ThemedText type="small" style={{ color: levelMeta.color, fontWeight: '700' }}>
                    {levelMeta.label}
                  </ThemedText>
                </View>
                <View style={[styles.badge, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {product.category}
                  </ThemedText>
                </View>
              </View>

              <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
                <ThemedView type="backgroundElement" style={styles.card}>
                  <DetailRow label="Brand" value={product.brand || '—'} theme={theme} />
                  <DetailRow label="Cost" value={formatMoney(product.cost)} theme={theme} />
                  <DetailRow label="Selling Price" value={formatMoney(product.price)} theme={theme} />
                  <DetailRow label="Stock on hand" value={`${product.stock}`} theme={theme} />
                  <DetailRow label="Reorder level" value={`${product.reorderLevel}`} theme={theme} />
                  <DetailRow
                    label="Status"
                    value={product.status === 'active' ? 'Active' : 'Inactive'}
                    theme={theme}
                  />
                  <DetailRow
                    label="Description"
                    value={product.description || '—'}
                    theme={theme}
                    last
                  />
                </ThemedView>
              </ScrollView>

              <View style={styles.actions}>
                <Pressable
                  onPress={confirmDelete}
                  style={({ pressed }) => [styles.deleteButton, pressed && styles.pressed]}>
                  <Ionicons name="trash-outline" size={18} color={DANGER} />
                  <ThemedText style={[styles.deleteText, { color: DANGER }]}>Delete</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => onEdit(product.id)}
                  style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
                  <Ionicons name="create-outline" size={18} color="#ffffff" />
                  <ThemedText style={styles.editText}>Edit</ThemedText>
                </Pressable>
              </View>
            </>
          )}
        </ThemedView>
      </View>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  theme,
  last,
}: {
  label: string;
  value: string;
  theme: ReturnType<typeof useTheme>;
  last?: boolean;
}) {
  return (
    <View
      style={[
        styles.detailRow,
        !last && { borderBottomColor: theme.background, borderBottomWidth: 1 },
      ]}>
      <ThemedText type="small" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="smallBold" style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
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
    gap: Spacing.three,
  },
  thumb: {
    width: 56,
    height: 56,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  titleText: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontSize: 20,
    lineHeight: 26,
  },
  badges: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.three,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
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
  actions: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 50,
    paddingHorizontal: Spacing.four,
    borderRadius: Spacing.three,
    backgroundColor: `${DANGER}1A`,
  },
  deleteText: {
    fontSize: 15,
    fontWeight: '600',
  },
  editButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one,
    height: 50,
    borderRadius: Spacing.three,
    backgroundColor: BRAND,
  },
  editText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.7,
  },
});
