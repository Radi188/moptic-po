import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';

const BRAND = '#232843';

/**
 * Centered, non-blocking spinner shown over a list while it reloads (e.g. when
 * a filter changes) and existing rows are still on screen. The list stays
 * scrollable underneath because the overlay ignores touches.
 */
export function ListLoadingOverlay({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <View pointerEvents="none" style={styles.overlay}>
      <ThemedView type="backgroundElement" style={styles.badge}>
        <ActivityIndicator color={BRAND} />
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: Spacing.four,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
});
