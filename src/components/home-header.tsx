import Ionicons from 'react-native-vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BranchPickerSheet } from '@/components/branch-picker-sheet';
import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/contexts/auth';
import { useTranslation } from '@/contexts/i18n';
import { useResponsive } from '@/hooks/use-responsive';
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
  onPressAvatar?: () => void;
};

export function HomeHeader({ onPressAvatar }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { isTablet } = useResponsive();
  const { session, switchBranch } = useAuth();
  const { t, language, setLanguage } = useTranslation();
  const km = language === 'km';
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
        <ThemedText
          style={[
            styles.title,
            isTablet && styles.titleTablet,
            km && (isTablet ? styles.titleTabletKm : styles.titleKm),
          ]}>
          {t('header.stockControl')}
        </ThemedText>
        <Pressable
          onPress={() => setBranchPickerOpen(true)}
          accessibilityLabel={t('header.switchBranch')}
          style={({ pressed }) => [styles.branchRow, pressed && styles.pressed]}>
          <Ionicons name="business-outline" size={14} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {session?.branch.name ?? t('header.noBranchSelected')}
          </ThemedText>
          <Ionicons name="chevron-down" size={14} color={theme.textSecondary} />
        </Pressable>
      </View>

      <View style={styles.right}>
        <Pressable
          onPress={() => setLanguage(km ? 'en' : 'km')}
          hitSlop={Spacing.two}
          accessibilityLabel={t('settings.row.language')}
          accessibilityRole="button"
          style={({ pressed }) => pressed && styles.pressed}>
          <ThemedView type="backgroundElement" style={styles.iconButton}>
            <ThemedText style={styles.flag}>{km ? '🇰🇭' : '🇬🇧'}</ThemedText>
          </ThemedView>
        </Pressable>

        <Pressable
          onPress={onPressAvatar}
          accessibilityLabel={t('header.account')}
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
  titleTablet: {
    fontSize: 32,
    lineHeight: 40,
  },
  // Khmer titles need more line height so tall stacked glyphs don't clip.
  titleKm: {
    lineHeight: 42,
  },
  titleTabletKm: {
    lineHeight: 50,
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
  flag: {
    fontSize: 24,
    lineHeight: 30,
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
