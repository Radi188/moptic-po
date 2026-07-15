import { Image } from 'expo-image';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTranslation } from '@/contexts/i18n';
import { useTheme } from '@/hooks/use-theme';
import { formatMoney, stockLevel, STOCK_META, type InventoryProduct } from '@/data/inventory';

const BRAND = '#232843';
const DANGER = '#e5484d';

type Props = {
  product: InventoryProduct | null;
  onClose: () => void;
  onEdit: (product: InventoryProduct) => void;
  onDelete: (id: string) => void;
};

export function ProductDetailsSheet({ product, onClose, onEdit, onDelete }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  function confirmDelete() {
    if (!product) return;
    Alert.alert(
      t('productDetails.deleteTitle'),
      t('productDetails.deleteConfirm', { name: product.name }),
      [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.delete'), style: 'destructive', onPress: () => onDelete(product.id) },
      ],
    );
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
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {product.code}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.chips}>
                <View style={[styles.chip, { backgroundColor: `${levelMeta.color}1A` }]}>
                  <View style={[styles.dot, { backgroundColor: levelMeta.color }]} />
                  <ThemedText type="small" style={{ color: levelMeta.color, fontWeight: '700' }}>
                    {t(`stocklevel.${level}`)}
                  </ThemedText>
                </View>
                {!!product.category && (
                  <View style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
                    <Ionicons name="pricetag-outline" size={12} color={theme.textSecondary} />
                    <ThemedText type="small" themeColor="textSecondary">
                      {product.category}
                    </ThemedText>
                  </View>
                )}
                <View style={[styles.chip, { backgroundColor: theme.backgroundElement }]}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {product.status === 'active' ? t('common.active') : t('common.inactive')}
                  </ThemedText>
                </View>
              </View>

              <ScrollView
                bounces={false}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.scrollBody}>
                <View style={styles.stats}>
                  <StatTile
                    label={t('productDetails.onHand')}
                    value={`${product.stock}`}
                    hint={t('productDetails.reorderAt', { level: product.reorderLevel })}
                    accent={levelMeta.color}
                    theme={theme}
                  />
                  <StatTile label={t('productDetails.sellPrice')} value={formatMoney(product.price)} theme={theme} />
                  <StatTile label={t('productDetails.cost')} value={formatMoney(product.cost)} theme={theme} />
                </View>

                <ThemedView type="backgroundElement" style={styles.card}>
                  <DetailRow label={t('productDetails.brand')} value={product.brand || '—'} theme={theme} />
                  <DetailRow label={t('productDetails.stockType')} value={product.stockType || '—'} theme={theme} />
                  {!!product.barcode && (
                    <DetailRow label={t('productDetails.barcode')} value={product.barcode} theme={theme} />
                  )}
                  <DetailRow
                    label={t('productDetails.description')}
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
                  <ThemedText style={[styles.deleteText, { color: DANGER }]}>{t('common.delete')}</ThemedText>
                </Pressable>
                <Pressable
                  onPress={() => onEdit(product)}
                  style={({ pressed }) => [styles.editButton, pressed && styles.pressed]}>
                  <Ionicons name="create-outline" size={18} color="#ffffff" />
                  <ThemedText style={styles.editText}>{t('common.edit')}</ThemedText>
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

function StatTile({
  label,
  value,
  hint,
  accent,
  theme,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <ThemedView type="backgroundElement" style={styles.statTile}>
      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText
        type="smallBold"
        numberOfLines={1}
        style={[styles.statValue, accent ? { color: accent } : null]}>
        {value}
      </ThemedText>
      {hint ? (
        <ThemedText
          type="small"
          themeColor="textSecondary"
          numberOfLines={1}
          style={styles.statHint}>
          {hint}
        </ThemedText>
      ) : null}
    </ThemedView>
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
    alignItems: 'flex-start',
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
    paddingTop: Spacing.half,
  },
  title: {
    fontSize: 20,
    // Khmer glyphs stack vowels/subscripts, so give them room or they clip.
    lineHeight: 30,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Spacing.two,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  scrollBody: {
    gap: Spacing.three,
    paddingBottom: Spacing.one,
  },
  stats: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  statTile: {
    flex: 1,
    borderRadius: Spacing.three,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.two,
    gap: Spacing.half,
  },
  statValue: {
    fontSize: 17,
  },
  statHint: {
    fontSize: 11,
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
