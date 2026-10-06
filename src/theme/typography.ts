import { TextStyle } from 'react-native';

type TextToken = Required<
  Pick<TextStyle, 'fontSize' | 'fontWeight' | 'lineHeight' | 'letterSpacing'>
>;

export const typography: Record<string, TextToken> = {
  display: { fontSize: 42, lineHeight: 48, fontWeight: '700', letterSpacing: -1.6 },
  heading1: { fontSize: 32, lineHeight: 38, fontWeight: '700', letterSpacing: -0.8 },
  heading2: { fontSize: 24, lineHeight: 30, fontWeight: '700', letterSpacing: -0.4 },
  heading3: { fontSize: 18, lineHeight: 24, fontWeight: '600', letterSpacing: 0 },
  body: { fontSize: 16, lineHeight: 24, fontWeight: '400', letterSpacing: 0 },
  bodyMedium: { fontSize: 16, lineHeight: 24, fontWeight: '500', letterSpacing: 0 },
  bodySmall: { fontSize: 14, lineHeight: 20, fontWeight: '400', letterSpacing: 0 },
  caption: { fontSize: 12, lineHeight: 16, fontWeight: '500', letterSpacing: 0 },
  button: { fontSize: 16, lineHeight: 22, fontWeight: '600', letterSpacing: 0 },
  label: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.2 },
};
