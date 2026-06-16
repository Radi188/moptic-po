import { Platform, StyleSheet, Text, type TextProps } from 'react-native';

import { Fonts, ThemeColor } from '@/constants/theme';
import { useResponsive } from '@/hooks/use-responsive';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'title' | 'small' | 'smallBold' | 'subtitle' | 'link' | 'linkPrimary' | 'code';
  themeColor?: ThemeColor;
};

const androidNoFontPadding =
  Platform.OS === 'android' ? ({ includeFontPadding: false } as const) : null;

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();
  const { isTablet } = useResponsive();
  // On tablets every text type steps up ~20% (font size and line height scale
  // together, so tall scripts like Khmer never clip). An explicit `style`
  // override still wins because it's applied last.
  const t = isTablet ? tabletStyles : styles;

  return (
    <Text
      style={[
        // Android reserves extra top/bottom padding sized for tall scripts
        // (e.g. Khmer), which makes lines look over-spaced. Drop it so the
        // explicit lineHeight controls spacing consistently across scripts.
        androidNoFontPadding,
        { color: theme[themeColor ?? 'text'] },
        type === 'default' && t.default,
        type === 'title' && t.title,
        type === 'small' && t.small,
        type === 'smallBold' && t.smallBold,
        type === 'subtitle' && t.subtitle,
        type === 'link' && t.link,
        type === 'linkPrimary' && t.linkPrimary,
        type === 'code' && t.code,
        style,
      ]}
      {...rest}
    />
  );
}

const styles = StyleSheet.create({
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  title: {
    fontSize: 48,
    fontWeight: 600,
    lineHeight: 52,
  },
  subtitle: {
    fontSize: 32,
    lineHeight: 44,
    fontWeight: 600,
  },
  link: {
    lineHeight: 30,
    fontSize: 14,
  },
  linkPrimary: {
    lineHeight: 30,
    fontSize: 14,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 12,
  },
});

// Tablet sizes: ~1.2x of the phone sizes above, with line heights scaled in
// step so Khmer (and other tall scripts) keep enough vertical room.
const tabletStyles = StyleSheet.create({
  small: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: 700,
  },
  default: {
    fontSize: 19,
    lineHeight: 29,
    fontWeight: 500,
  },
  title: {
    fontSize: 56,
    fontWeight: 600,
    lineHeight: 62,
  },
  subtitle: {
    fontSize: 38,
    lineHeight: 52,
    fontWeight: 600,
  },
  link: {
    lineHeight: 34,
    fontSize: 17,
  },
  linkPrimary: {
    lineHeight: 34,
    fontSize: 17,
    color: '#3c87f7',
  },
  code: {
    fontFamily: Fonts.mono,
    fontWeight: Platform.select({ android: 700 }) ?? 500,
    fontSize: 14,
  },
});
