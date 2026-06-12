import Ionicons from 'react-native-vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BranchPickerSheet } from '@/components/branch-picker-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTheme } from '@/hooks/use-theme';

const BRAND = '#232843';

function getInitials(name: string) {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? '');
  return letters.join('').toUpperCase() || '?';
}

type Props = {
  onPressNotifications?: () => void;
  onPressAvatar?: () => void;
};

export function HomeHeader({ onPressNotifications, onPressAvatar }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { session, switchBranch } = useAuth();
  const [branchPickerOpen, setBranchPickerOpen] = useState(false);

  return (
    <View style={[styles.container, { paddingTop: insets.top + Spacing.two }]}>
      <BranchPickerSheet
        visible={branchPickerOpen}
        selectedId={session?.branch.id}
        onSelect={(branch) => {
          switchBranch(branch);
          setBranchPickerOpen(false);
        }}
        onClose={() => setBranchPickerOpen(false)}
      />

      <View style={styles.left}>
        <ThemedText style={styles.title}>Stock Control</ThemedText>
        <Pressable
          onPress={() => setBranchPickerOpen(true)}
          accessibilityLabel="Switch branch"
          style={({ pressed }) => [styles.branchRow, pressed && styles.pressed]}>
          <Ionicons name="business-outline" size={14} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {session?.branch.name ?? 'No branch selected'}
          </ThemedText>
          <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.right}>
        <Pressable
          onPress={onPressNotifications}
          hitSlop={Spacing.two}
          accessibilityLabel="Notifications"
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={styles.iconButton}>
            <Ionicons name="notifications-outline" size={22} color={theme.text} />
            <View style={[styles.badge, { borderColor: theme.backgroundElement }]} />
          </ThemedView>
        </Pressable>

        <Pressable
          onPress={onPressAvatar}
          accessibilityLabel="Account"
          style={({ pressed }) => pressed && styles.pressed}>
          <View style={styles.avatar}>
            <ThemedText style={styles.avatarText}>
              {getInitials(session?.username ?? '')}
            </ThemedText>
          </View>
        </Pressable>
      </View>
    </View>
  );
}

const AVATAR_SIZE = 44;

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
    gap: Spacing.three,
  },
  left: {
    flex: 1,
    gap: Spacing.half,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
    fontWeight: '700',
  },
  branchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
  right: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    position: 'absolute',
    top: 11,
    right: 11,
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#e5484d',
    borderWidth: 1.5,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    backgroundColor: BRAND,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.7,
  },
});
