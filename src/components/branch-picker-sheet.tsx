import Ionicons from 'react-native-vector-icons/Ionicons';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { type Branch } from '@/constants/branches';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';

type Props = {
  visible: boolean;
  selectedId?: string;
  onSelect: (branch: Branch) => void;
  onClose: () => void;
};

export function BranchPickerSheet({ visible, selectedId, onSelect, onClose }: Props) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const branches = session?.branches ?? [];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <ThemedView style={[styles.sheet, { paddingBottom: insets.bottom + Spacing.four }]}>
          <ThemedView style={styles.handle} type="backgroundSelected" />
          <ThemedText type="subtitle" style={styles.title}>
            Select branch
          </ThemedText>
          <ScrollView bounces={false}>
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
        <Ionicons name="business-outline" size={22} color={selected ? BRAND : theme.textSecondary} />
        <ThemedView style={styles.optionText}>
          <ThemedText type="smallBold">{branch.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {branch.location}
          </ThemedText>
        </ThemedView>
        {selected && <Ionicons name="checkmark-circle" size={22} color={BRAND} />}
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
    lineHeight: 28,
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
