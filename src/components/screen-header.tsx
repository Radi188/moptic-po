import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onBack: () => void;
};

/** Modern stacked header with a rounded back button, used by the form screens. */
export function ScreenHeader({ title, subtitle, right, onBack }: Props) {
  const insets = useSafeAreaInsets();
  const theme = useTheme();
  const { isTablet } = useResponsive();

  return (
    <View style={[styles.header, { paddingTop: insets.top + Spacing.two }]}>
      <Pressable
        onPress={onBack}
        hitSlop={Spacing.two}
        accessibilityLabel="Go back"
        style={({ pressed }) => [
          styles.backTile,
          isTablet && styles.backTileTablet,
          { backgroundColor: theme.backgroundElement },
          pressed && styles.pressed,
        ]}>
        <Ionicons name="chevron-back" size={isTablet ? 26 : 22} color={theme.text} />
      </Pressable>
      <View style={styles.headerText}>
        <ThemedText
          style={[styles.headerTitle, isTablet && styles.headerTitleTablet]}
          numberOfLines={1}>
          {title}
        </ThemedText>
        {subtitle ? (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
            {subtitle}
          </ThemedText>
        ) : null}
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.three,
  },
  backTile: {
    width: 40,
    height: 40,
    borderRadius: Spacing.three,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backTileTablet: {
    width: 48,
    height: 48,
    borderRadius: Spacing.four,
  },
  headerText: {
    flex: 1,
    gap: Spacing.half,
  },
  headerTitle: {
    fontSize: 20,
    // Roomy enough for Khmer (tall stacked glyphs) without clipping.
    lineHeight: 28,
    fontWeight: '700',
  },
  headerTitleTablet: {
    fontSize: 26,
    lineHeight: 36,
  },
  pressed: {
    opacity: 0.7,
  },
});
