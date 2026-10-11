import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';

interface NotificationPreferences {
  continueWatchingReminders: boolean;
  newReleaseReminders: boolean;
}

interface NotificationStore extends NotificationPreferences {
  hasHydrated: boolean;
  setPreferences: (preferences: Partial<NotificationPreferences>) => void;
  hydrate: () => Promise<void>;
}

const KEY = 'watch-later.notifications.v1';

const defaults: NotificationPreferences = { continueWatchingReminders: false, newReleaseReminders: false };

export const useNotificationStore = create<NotificationStore>((set) => ({
  ...defaults,
  hasHydrated: false,
  setPreferences: (preferences) => {
    set((state) => {
      const next = { continueWatchingReminders: state.continueWatchingReminders, newReleaseReminders: state.newReleaseReminders, ...preferences };
      void AsyncStorage.setItem(KEY, JSON.stringify(next)).catch(() => undefined);
      return next;
    });
  },
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      const saved = raw ? (JSON.parse(raw) as Partial<NotificationPreferences>) : undefined;
      if (saved) set({ continueWatchingReminders: saved.continueWatchingReminders ?? false, newReleaseReminders: saved.newReleaseReminders ?? false });
    } catch { /* Keep reminders off by default. */ }
    finally { set({ hasHydrated: true }); }
  },
}));
