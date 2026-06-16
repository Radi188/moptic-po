import { useEffect, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';

/**
 * A single shimmering placeholder block. Animates opacity (native driver) so it
 * stays cheap, and uses the theme's selected-surface color so it reads in both
 * light and dark mode.
 */
export function Skeleton({
  width = '100%',
  height = 14,
  radius = 6,
  style,
}: {
  width?: DimensionValue;
  height?: number;
  radius?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const opacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 750, useNativeDriver: true }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: theme.backgroundSelected, opacity },
        style,
      ]}
    />
  );
}

/** A card-shaped placeholder matching the app's list rows (icon · two lines · trailing). */
export function SkeletonCard() {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <Skeleton width={46} height={46} radius={Spacing.three} />
      <View style={styles.cardMain}>
        <Skeleton width="70%" height={14} />
        <Skeleton width="45%" height={12} />
      </View>
      <Skeleton width={18} height={18} radius={9} />
    </ThemedView>
  );
}

/** A stack of card placeholders. Drop into a FlatList `ListEmptyComponent`. */
export function SkeletonList({ count = 7 }: { count?: number }) {
  return (
    <View style={styles.list}>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </View>
  );
}

/** A two-line placeholder for a single list row (no card background). */
export function SkeletonRow() {
  return (
    <View style={styles.row}>
      <Skeleton width={38} height={38} radius={19} />
      <View style={styles.cardMain}>
        <Skeleton width="60%" height={13} />
        <Skeleton width="35%" height={11} />
      </View>
    </View>
  );
}

/** Several borderless row placeholders, for use inside an existing list card. */
export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonRow key={i} />
      ))}
    </>
  );
}

/** A 2-column grid of stat-card placeholders, matching the dashboard stats. */
export function SkeletonStatGrid({ count = 4 }: { count?: number }) {
  const { isTablet } = useResponsive();
  return (
    <View style={styles.statGrid}>
      {Array.from({ length: count }).map((_, i) => (
        <ThemedView
          key={i}
          type="backgroundElement"
          style={[styles.statCard, isTablet && styles.statCardTablet]}
        >
          <View style={styles.statTop}>
            <Skeleton width="55%" height={12} />
            <Skeleton width={30} height={30} radius={15} />
          </View>
          <Skeleton width="40%" height={24} />
        </ThemedView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.three,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Spacing.four,
  },
  cardMain: {
    flex: 1,
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingVertical: Spacing.three,
  },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.three,
  },
  statCard: {
    width: '48%',
    padding: Spacing.three,
    borderRadius: Spacing.three,
    gap: Spacing.two,
  },
  statCardTablet: {
    width: '23.5%',
  },
  statTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
