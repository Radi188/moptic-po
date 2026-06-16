import { useWindowDimensions } from 'react-native';

/** Width (dp) at and above which we treat the device as a tablet. */
export const TABLET_BREAKPOINT = 768;

/**
 * Layout helpers driven by the current window width. Phones (< 768dp) keep the
 * existing single-column layout; tablets get a roomier multi-column treatment.
 */
export function useResponsive() {
  const { width } = useWindowDimensions();
  const isTablet = width >= TABLET_BREAKPOINT;
  return { width, isTablet };
}
