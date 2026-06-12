import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { fetchItems, searchItems, type ApiItem } from '@/api/items';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { formatMoney } from '@/data/purchase-orders';
import { SkeletonRows } from '@/components/skeleton';
import { useTheme } from '@/hooks/use-theme';


type Props = {
  visible: boolean;
  selectedCodes: string[];
  onAdd: (item: ApiItem) => void;
  onClose: () => void;
};

export function ItemSearchSheet({ visible, selectedCodes, onAdd, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const [query, setQuery] = useState('');
  const [items, setItems] = useState<ApiItem[]>([]);
  const [page, setPage] = useState(1);
  const [lastPage, setLastPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  // Guards against out-of-order responses (stale search/page results).
  const requestId = useRef(0);

  const load = useCallback(async (q: string, nextPage: number, append: boolean) => {
    const id = ++requestId.current;
    if (append) setLoadingMore(true);
    else setLoading(true);
    try {
      const result = q.trim() ? await searchItems(q, nextPage) : await fetchItems(nextPage);
      if (id !== requestId.current) return; // a newer request superseded this one
      setItems((prev) => (append ? [...prev, ...result.items] : result.items));
      setPage(result.page);
      setLastPage(result.lastPage);
    } catch {
      if (id === requestId.current && !append) setItems([]);
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  // Reset and load the first page each time the sheet opens.
  useEffect(() => {
    if (visible) {
      setQuery('');
      load('', 1, false);
    }
  }, [visible, load]);

  // Debounced search as the user types.
  useEffect(() => {
    if (!visible) return;
    const t = setTimeout(() => load(query, 1, false), 350);
    return () => clearTimeout(t);
  }, [query, visible, load]);

  function loadMore() {
    if (loading || loadingMore || page >= lastPage) return;
    load(query, page + 1, true);
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.two }]}>
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
              value={query}
              onChangeText={setQuery}
              placeholder="Search item code or name"
              placeholderTextColor={theme.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
              style={[styles.searchInput, { color: theme.text }]}
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={Spacing.two}>
                <Ionicons name="close-circle" size={18} color={theme.textSecondary} />
              </Pressable>
            )}
          </ThemedView>

          {loading ? (
            <SkeletonRows count={6} />
          ) : (
            <FlatList
              data={items}
              keyExtractor={(item) => item.id}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              onEndReachedThreshold={0.4}
              onEndReached={loadMore}
              renderItem={({ item }) => (
                <ItemRow
                  item={item}
                  added={selectedCodes.includes(item.code)}
                  onPress={() => onAdd(item)}
                  theme={theme}
                />
              )}
              ListEmptyComponent={
                <ThemedText type="small" themeColor="textSecondary" style={styles.empty}>
                  No items found.
                </ThemedText>
              }
              ListFooterComponent={
                loadingMore ? (
                  <View style={styles.footer}>
                    <ActivityIndicator color={theme.textSecondary} />
                  </View>
                ) : null
              }
            />
          )}
        </ThemedView>
      </View>
    </Modal>
  );
}

function ItemRow({
  item,
  added,
  onPress,
  theme,
}: {
  item: ApiItem;
  added: boolean;
  onPress: () => void;
  theme: ReturnType<typeof useTheme>;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type="backgroundElement" style={styles.row}>
        <ThemedView type="backgroundSelected" style={styles.thumb}>
          {item.image ? (
            <Image source={{ uri: item.image }} style={styles.thumbImage} contentFit="cover" />
          ) : (
            <Ionicons name="image-outline" size={18} color={theme.textSecondary} />
          )}
        </ThemedView>
        <View style={styles.rowText}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {item.name}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {item.code}
          </ThemedText>
        </View>
        <ThemedText type="small" themeColor="textSecondary">
          {formatMoney(item.cost)}
        </ThemedText>
        <Ionicons
          name={added ? 'checkmark-circle' : 'add-circle-outline'}
          size={24}
          color={added ? '#30A46C' : theme.tint}
        />
      </ThemedView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  sheet: {
    height: '85%',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    gap: Spacing.three,
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
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  empty: {
    textAlign: 'center',
    paddingVertical: Spacing.six,
  },
  footer: {
    paddingVertical: Spacing.three,
    alignItems: 'center',
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
    overflow: 'hidden',
  },
  thumbImage: {
    width: '100%',
    height: '100%',
  },
  rowText: {
    flex: 1,
    gap: Spacing.half,
  },
  pressed: {
    opacity: 0.7,
  },
});
