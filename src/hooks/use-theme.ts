/**
 * Resolves the active color palette from the user's theme preference
 * (Light / Dark / System). See `@/contexts/theme`.
 */

import { Colors } from '@/constants/theme';
import { useThemePreference } from '@/contexts/theme';

export function useTheme() {
  const { scheme } = useThemePreference();
  return Colors[scheme];
}
