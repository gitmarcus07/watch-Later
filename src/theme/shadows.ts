import { ViewStyle } from 'react-native';

export const shadows: Record<string, ViewStyle> = {
  glow: {
    shadowColor: '#B69CFF',
    shadowOpacity: 0.24,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
};
