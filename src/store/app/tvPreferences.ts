import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

interface TvPreferences {
  /** Show every season expanded instead of the season picker. */
  showAllSeasons: boolean;
  /** Seasons start expanded in the all-seasons view. Default collapsed. */
  expandSeasonsByDefault: boolean;
  setShowAllSeasons: (value: boolean) => void;
  setExpandSeasonsByDefault: (value: boolean) => void;
  hydrate: () => Promise<void>;
}

const KEY = 'watch-later.tv.v1';

export const useTvPreferences = create<TvPreferences>((set) => ({
  showAllSeasons: false,
  expandSeasonsByDefault: false,
  setShowAllSeasons: (showAllSeasons) => {
    set({ showAllSeasons });
    void AsyncStorage.mergeItem(KEY, JSON.stringify({ showAllSeasons })).catch(() => undefined);
  },
  setExpandSeasonsByDefault: (expandSeasonsByDefault) => {
    set({ expandSeasonsByDefault });
    void AsyncStorage.mergeItem(KEY, JSON.stringify({ expandSeasonsByDefault })).catch(() => undefined);
  },
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<Pick<TvPreferences, 'showAllSeasons' | 'expandSeasonsByDefault'>>) : undefined;
      if (saved) set({
        showAllSeasons: saved.showAllSeasons ?? false,
        expandSeasonsByDefault: saved.expandSeasonsByDefault ?? false,
      });
    } catch { /* Keep collapsed defaults. */ }
  },
}));
