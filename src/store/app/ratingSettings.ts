import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import type { CatalogMedia } from '@/domain/models/media';

export type RatingPrecision = '0.1' | '0.01';

interface RatingSettings {
  /** When true, finishing a title on its detail page offers a one-tap rating. Default off: rating never interrupts. */
  askAfterWatch: boolean;
  /** Display/storage precision for user ratings. */
  precision: RatingPrecision;
  /** Title awaiting an optional rating prompt on its detail page, if any. */
  pendingPrompt: CatalogMedia | null;
  setAskAfterWatch: (value: boolean) => void;
  setPrecision: (precision: RatingPrecision) => void;
  requestPrompt: (media: CatalogMedia) => void;
  clearPrompt: () => void;
  hydrate: () => Promise<void>;
}

const KEY = 'watch-later.ratings.v1';

export function roundRating(value: number, precision: RatingPrecision): number {
  const step = precision === '0.01' ? 100 : 10;
  return Math.min(10, Math.max(0, Math.round(value * step) / step));
}

export function formatRating(value: number, precision: RatingPrecision): string {
  return roundRating(value, precision).toFixed(precision === '0.01' ? 2 : 1);
}

export const useRatingSettings = create<RatingSettings>((set) => ({
  askAfterWatch: false,
  precision: '0.1',
  pendingPrompt: null,
  setAskAfterWatch: (askAfterWatch) => {
    set({ askAfterWatch });
    void AsyncStorage.mergeItem(KEY, JSON.stringify({ askAfterWatch })).catch(() => undefined);
  },
  setPrecision: (precision) => {
    set({ precision });
    void AsyncStorage.mergeItem(KEY, JSON.stringify({ precision })).catch(() => undefined);
  },
  requestPrompt: (media) => set({ pendingPrompt: media }),
  clearPrompt: () => set({ pendingPrompt: null }),
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<Pick<RatingSettings, 'askAfterWatch' | 'precision'>>) : undefined;
      if (saved) set({
        askAfterWatch: saved.askAfterWatch ?? false,
        precision: saved.precision === '0.01' ? '0.01' : '0.1',
      });
    } catch { /* Rating stays optional and off by default. */ }
  },
}));
