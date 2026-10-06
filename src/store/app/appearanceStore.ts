import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

export type AppearanceTheme = 'dark';

interface AppearanceStore {
  theme: AppearanceTheme;
  hasHydrated: boolean;
  setTheme: (theme: AppearanceTheme) => void;
  hydrate: () => Promise<void>;
}

const KEY = 'watch-later.appearance.v1';

export const useAppearanceStore = create<AppearanceStore>((set) => ({
  theme: 'dark',
  hasHydrated: false,
  setTheme: (theme) => {
    set({ theme });
    void AsyncStorage.setItem(KEY, JSON.stringify({ theme })).catch(() => undefined);
  },
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as { theme?: unknown }) : undefined;
      if (saved?.theme === 'dark') set({ theme: 'dark' });
    } catch { /* Keep the default dark cinematic theme. */ }
    finally { set({ hasHydrated: true }); }
  },
}));
