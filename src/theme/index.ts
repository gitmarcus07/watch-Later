import { colors } from './colors';
import { radius } from './radius';
import { shadows } from './shadows';
import { spacing } from './spacing';
import { typography } from './typography';

export const theme = { colors, radius, shadows, spacing, typography } as const;
export type AppTheme = typeof theme;
export { colors, radius, shadows, spacing, typography };
