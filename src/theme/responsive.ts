import { useWindowDimensions } from 'react-native';

/** Width at or above which tablet layout rules apply. */
export const TABLET_BREAKPOINT = 700;
/** Maximum content width so large screens do not stretch cards and text. */
export const CONTENT_MAX_WIDTH = 760;

export function isTabletWidth(width: number): boolean {
  return width >= TABLET_BREAKPOINT;
}

export function contentMaxWidth(width: number): number | undefined {
  return isTabletWidth(width) ? CONTENT_MAX_WIDTH : undefined;
}

export function useIsTablet(): boolean {
  const { width } = useWindowDimensions();
  return isTabletWidth(width);
}
