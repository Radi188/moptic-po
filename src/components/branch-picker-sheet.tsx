import Ionicons from 'react-native-vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { type Branch } from '@/constants/branches';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTranslation } from '@/contexts/i18n';
import { useTheme } from '@/hooks/use-theme';


type Props = {
  visible: boolean;
  selectedId?: string;
  onSelect: (branch: Branch) => void;
  onClose: () => void;
  /** Show an "All branches" row at the top; fires `onSelectAll` when tapped. */
  allowAll?: boolean;
  onSelectAll?: () => void;
};

export function BranchPickerSheet({
  visible,
  selectedId,
  onSelect,
  onClose,
  allowAll,
  onSelectAll,
}: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { t } = useTranslation();
  const branches = session?.branches ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.four }]}>
          <ThemedView style={styles.handle} type="backgroundSelected" />
          <ThemedText type="subtitle" style={styles.title}>
            {t('branchPicker.title')}
          </ThemedText>
          <ScrollView bounces={false}>
            {allowAll && (
              <Pressable
                onPress={onSelectAll}
                style={({ pressed }) => pressed && styles.pressed}>
                <ThemedView
                  type={selectedId == null ? 'backgroundSelected' : 'backgroundElement'}
                  style={styles.option}>
                  <Ionicons
                    name="albums-outline"
                    size={22}
                    color={selectedId == null ? theme.tint : theme.textSecondary}
                  />
                  <ThemedView style={styles.optionText}>
                    <ThemedText type="smallBold">{t('filters.allBranches')}</ThemedText>
                  </ThemedView>
                  {selectedId == null && (
                    <Ionicons name="checkmark-circle" size={22} color={theme.tint} />
                  )}
                </ThemedView>
              </Pressable>
            )}
            {branches.map((item) => (
              <BranchOption
                key={item.id}
                branch={item}
                selected={selectedId === item.id}
                theme={theme}
                onPress={() => onSelect(item)}
              />
            ))}
          </ScrollView>
        </ThemedView>
      </View>
    </Modal>
  );
}

type BranchOptionProps = {
  branch: Branch;
  selected: boolean;
  theme: ReturnType<typeof useTheme>;
  onPress: () => void;
};

function BranchOption({ branch, selected, theme, onPress }: BranchOptionProps) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <ThemedView type={selected ? 'backgroundSelected' : 'backgroundElement'} style={styles.option}>
        <Ionicons name="business-outline" size={22} color={selected ? theme.tint : theme.textSecondary} />
        <ThemedView style={styles.optionText}>
          <ThemedText type="smallBold">{branch.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {branch.location}
          </ThemedText>
        </ThemedView>
        {selected && <Ionicons name="checkmark-circle" size={22} color={theme.tint} />}
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
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    borderTopLeftRadius: Spacing.four,
    borderTopRightRadius: Spacing.four,
    gap: Spacing.three,
    maxHeight: '70%',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
  },
  title: {
    fontSize: 22,
    // Taller than the font so tall Khmer glyphs aren't clipped at the top.
    lineHeight: 34,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
    marginBottom: Spacing.two,
  },
  optionText: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  pressed: {
    opacity: 0.7,
  },
});
