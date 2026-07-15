import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ApiOption } from '@/api/purchase-orders';
import {
  fetchItemWarehouseStock,
  type ItemWarehouseStock,
  type StockOnHandItem,
} from '@/api/stock-on-hand';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTranslation } from '@/contexts/i18n';
import { useTheme } from '@/hooks/use-theme';

const IN = '#30A46C';

function withThousands(n: number) {
  return Math.round(n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

type Props = {
  item: StockOnHandItem | null;
  warehouses: ApiOption[];
  branchId?: string;
  onClose: () => void;
};

export function ItemStockSheet({ item, warehouses, branchId, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();

  const [rows, setRows] = useState<ItemWarehouseStock[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item || warehouses.length === 0) return;
    let active = true;
    setLoading(true);
    setError(null);
    setRows([]);
    fetchItemWarehouseStock(item, warehouses, branchId)
      .then((res) => {
        if (active) setRows([...res].sort((a, b) => b.qty - a.qty));
      })
      .catch((e) => {
        if (active) setError(e instanceof Error ? e.message : t('soh.loadError'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [item, warehouses, branchId, t]);

  const total = rows.reduce((sum, r) => sum + r.qty, 0);
  const hasStock = rows.some((r) => r.qty !== 0);

  return (
    <Modal visible={!!item} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.three }]}>
          <ThemedView style={styles.handle} type="backgroundSelected" />

          {item && (
            <>
              <View style={styles.titleRow}>
                <ThemedView type="backgroundSelected" style={styles.thumb}>
                  {item.image ? (
                    <Image source={{ uri: item.image }} style={styles.thumbImage} contentFit="cover" />
                  ) : (
                    <Ionicons name="cube-outline" size={26} color={theme.textSecondary} />
                  )}
                </ThemedView>
                <View style={styles.titleText}>
                  <ThemedText type="subtitle" style={styles.title} numberOfLines={2}>
                    {item.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                    {item.code}
                    {item.category ? ` · ${item.category}` : ''}
                  </ThemedText>
                </View>
              </View>

              <View style={styles.totalRow}>
                <ThemedText type="small" themeColor="textSecondary">
                  {t('soh.totalOnHand')}
                </ThemedText>
                <ThemedText type="smallBold" style={styles.totalValue}>
                  {withThousands(total)}
                </ThemedText>
              </View>

              <ThemedText type="smallBold" style={styles.sectionTitle}>
                {t('soh.byWarehouse')}
              </ThemedText>

              {loading ? (
                <View style={styles.center}>
                  <ActivityIndicator color={theme.textSecondary} />
                </View>
              ) : error ? (
                <View style={styles.center}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {error}
                  </ThemedText>
                </View>
              ) : !hasStock ? (
                <View style={styles.center}>
                  <ThemedText type="small" themeColor="textSecondary">
                    {t('soh.noWarehouseStock')}
                  </ThemedText>
                </View>
              ) : (
                <ScrollView
                  bounces={false}
                  showsVerticalScrollIndicator={false}
                  style={styles.scroll}
                  contentContainerStyle={styles.scrollBody}>
                  <ThemedView type="backgroundElement" style={styles.card}>
                    {rows.map((r, i) => (
                      <WarehouseRow key={r.warehouseId} row={r} divider={i > 0} theme={theme} />
                    ))}
                  </ThemedView>
                </ScrollView>
              )}
            </>
          )}
        </ThemedView>
      </View>
    </Modal>
  );
}

function WarehouseRow({
  row,
  divider,
  theme,
}: {
  row: ItemWarehouseStock;
  divider: boolean;
  theme: ReturnType<typeof useTheme>;
}) {
  const empty = row.qty <= 0;
  return (
    <View
      style={[styles.row, divider && { borderTopColor: theme.background, borderTopWidth: 1 }]}>
      <Ionicons name="business-outline" size={18} color={theme.textSecondary} />
      <ThemedText type="smallBold" numberOfLines={1} style={styles.rowName}>
        {row.warehouseName}
      </ThemedText>
      <ThemedText type="smallBold" style={{ color: empty ? theme.textSecondary : IN, fontSize: 16 }}>
        {withThousands(row.qty)}
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
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  totalValue: {
    fontSize: 18,
    color: IN,
  },
  sectionTitle: {
    fontSize: 15,
  },
  center: {
    paddingVertical: Spacing.six,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flexGrow: 0,
  },
  scrollBody: {
    paddingBottom: Spacing.one,
  },
  card: {
    borderRadius: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  rowName: {
    flex: 1,
  },
});
