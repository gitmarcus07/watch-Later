import { Platform } from 'react-native';
import { Notifications } from '@/lib/notifications';
import type { CatalogMedia, MediaEpisode } from '@/domain/models/media';
import type { UpcomingEpisode, WatchlistEntry } from '@/domain/models/watchState';
import { watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { useNotificationStore } from '@/store/app/notificationStore';
import { RELEASE_DAY_CHANNEL_ID, releaseDayTitle } from '@/features/notifications/upcomingReminders';
import { OTT_NOTIFICATION_SOUND } from '@/features/ott/ottReminders';
import { logger } from '@/lib/logger';

export const REMINDERS_CHANNEL_ID = 'watch-later-reminders';
export const MAX_SCHEDULED_REMINDERS = 20;
export const UPCOMING_EPISODE_DAYS = 14;
export const UPCOMING_MOVIE_DAYS = 30;

export interface ReminderItem {
  id: string;
  title: string;
  body: string;
  date: Date;
  data: { route: string; mediaId?: string };
  /** Release-day movie alerts use the branded channel; episodes use the default. */
  channelId?: string;
}

export interface ReminderDeps {
  getUpcomingEpisodes: (horizonDays: number) => Promise<UpcomingEpisode[]>;
  getWatchlist: () => Promise<WatchlistEntry[]>;
  getPreferences: () => { continueWatchingReminders: boolean; newReleaseReminders: boolean };
  getPermissions: () => Promise<{ status: string }>;
  requestPermissions: () => Promise<{ status: string }>;
  ensureChannel: () => Promise<void>;
  cancelAll: () => Promise<void>;
  schedule: (item: ReminderItem) => Promise<string>;
  now?: () => Date;
}

function defaultDeps(): ReminderDeps {
  return {
    getUpcomingEpisodes: (horizonDays) => watchStateRepository.getUpcomingEpisodes(horizonDays),
    getWatchlist: () => watchStateRepository.getWatchlist(),
    getPreferences: () => {
      const state = useNotificationStore.getState();
      return { continueWatchingReminders: state.continueWatchingReminders, newReleaseReminders: state.newReleaseReminders };
    },
    getPermissions: async () => {
      const result = await Notifications.getPermissionsAsync();
      return { status: result.status };
    },
    requestPermissions: async () => {
      const result = await Notifications.requestPermissionsAsync();
      return { status: result.status };
    },
    ensureChannel: async () => {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync(REMINDERS_CHANNEL_ID, {
          name: 'Watch Later reminders',
          importance: Notifications.AndroidImportance.DEFAULT,
        });
        // Release-day movie alerts carry their own channel so the brand
        // chime plays even for users who never tapped a bell.
        await Notifications.setNotificationChannelAsync(RELEASE_DAY_CHANNEL_ID, {
          name: 'Release day',
          importance: Notifications.AndroidImportance.HIGH,
          sound: OTT_NOTIFICATION_SOUND,
        }).catch(() => undefined);
      }
    },
    cancelAll: () => Notifications.cancelAllScheduledNotificationsAsync(),
    schedule: (item) => Notifications.scheduleNotificationAsync({
      content: { title: item.title, body: item.body, data: item.data, sound: OTT_NOTIFICATION_SOUND },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: item.date,
        ...(item.channelId ? { channelId: item.channelId } : {}),
      },
    }),
  };
}

function atMorning(dateText: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateText);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 9, 0, 0, 0);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function episodeLabel(media: CatalogMedia, episode: MediaEpisode): string {
  return `S${episode.seasonNumber} E${episode.episodeNumber} · ${episode.title || media.title}`;
}

/**
 * Pure collection: upcoming unwatched episodes plus watchlisted movies
 * releasing soon, capped and ordered by date. No I/O, fully testable.
 */
export function collectReminders(input: {
  episodes: UpcomingEpisode[];
  watchlist: WatchlistEntry[];
  episodeReminders: boolean;
  releaseReminders: boolean;
  now?: Date;
  maxItems?: number;
}): ReminderItem[] {
  const now = input.now ?? new Date();
  const maxItems = input.maxItems ?? MAX_SCHEDULED_REMINDERS;
  const items: ReminderItem[] = [];
  if (input.episodeReminders) {
    for (const { media, episode, airDate } of input.episodes) {
      const date = atMorning(airDate);
      if (!date || date.getTime() <= now.getTime()) continue;
      items.push({
        id: `episode:${media.id}:${episode.seasonNumber}:${episode.episodeNumber}`,
        title: media.title,
        body: `New episode ${episodeLabel(media, episode)} airs today.`,
        date,
        data: { route: '/media/[id]', mediaId: media.id },
      });
    }
  }
  if (input.releaseReminders) {
    for (const { media } of input.watchlist) {
      if (media.mediaType !== 'movie' || !media.releaseDate) continue;
      const date = atMorning(media.releaseDate);
      if (!date || date.getTime() <= now.getTime()) continue;
      if (date.getTime() - now.getTime() > UPCOMING_MOVIE_DAYS * 24 * 60 * 60 * 1000) continue;
      items.push({
        id: `release:${media.id}`,
        title: releaseDayTitle(media.title),
        body: 'It’s on your Watch Later list — tap to view it.',
        date,
        data: { route: '/media/[id]', mediaId: media.id },
        channelId: RELEASE_DAY_CHANNEL_ID,
      });
    }
  }
  return items.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, maxItems);
}

export type RefreshResult =
  | { scheduled: number }
  | { scheduled: 0; reason: 'disabled' | 'denied' | 'unavailable' | 'empty' };

let activeRefresh: Promise<RefreshResult> | undefined;
let lastForegroundRefreshAt = 0;
const FOREGROUND_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Rebuilds all reminder notifications from current library state.
 * Safe to call from foreground events, preference toggles, and syncs:
 * concurrent calls collapse into one run and failures never throw.
 */
export function refreshReminders(deps: ReminderDeps = defaultDeps()): Promise<RefreshResult> {
  if (activeRefresh) return activeRefresh;
  activeRefresh = performRefresh(deps)
    .catch((error: unknown) => {
      logger.error('Reminder refresh failed', error);
      return { scheduled: 0, reason: 'unavailable' } as RefreshResult;
    })
    .finally(() => { activeRefresh = undefined; });
  return activeRefresh;
}

async function performRefresh(deps: ReminderDeps): Promise<RefreshResult> {
  const prefs = deps.getPreferences();
  if (!prefs.continueWatchingReminders && !prefs.newReleaseReminders) {
    await deps.cancelAll().catch(() => undefined);
    return { scheduled: 0, reason: 'disabled' };
  }
  let permission: { status: string };
  try {
    permission = await deps.getPermissions();
  } catch {
    return { scheduled: 0, reason: 'unavailable' };
  }
  if (permission.status !== 'granted') {
    try {
      permission = await deps.requestPermissions();
    } catch {
      return { scheduled: 0, reason: 'unavailable' };
    }
    if (permission.status !== 'granted') return { scheduled: 0, reason: 'denied' };
  }
  const [episodes, watchlist] = await Promise.all([
    deps.getUpcomingEpisodes(UPCOMING_EPISODE_DAYS).catch(() => [] as UpcomingEpisode[]),
    deps.getWatchlist().catch(() => [] as WatchlistEntry[]),
  ]);
  const items = collectReminders({
    episodes,
    watchlist,
    episodeReminders: prefs.continueWatchingReminders,
    releaseReminders: prefs.newReleaseReminders,
    now: deps.now?.(),
  });
  if (!items.length) {
    await deps.cancelAll().catch(() => undefined);
    return { scheduled: 0, reason: 'empty' };
  }
  await deps.ensureChannel().catch(() => undefined);
  await deps.cancelAll().catch(() => undefined);
  let scheduled = 0;
  for (const item of items) {
    try {
      await deps.schedule(item);
      scheduled += 1;
    } catch {
      break;
    }
  }
  return { scheduled };
}

/** Foreground entry point: at most one rebuild per cooldown window. */
export function refreshRemindersOnForeground(now: number = Date.now()): Promise<RefreshResult> | undefined {
  if (now - lastForegroundRefreshAt < FOREGROUND_REFRESH_COOLDOWN_MS) return undefined;
  lastForegroundRefreshAt = now;
  return refreshReminders();
}

/** Test-only reset for the foreground cooldown. */
export function __resetReminderSchedulerForTests(): void {
  lastForegroundRefreshAt = 0;
  activeRefresh = undefined;
}

/** Call once at startup so foreground notifications display as banners. */
export function setupNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({ shouldPlaySound: false, shouldSetBadge: false, shouldShowBanner: true, shouldShowList: true }),
  });
}

/** OS-level permission state for the settings screen. Never throws. */
export async function getReminderPermission(): Promise<'granted' | 'denied' | 'undetermined'> {
  try {
    const result = await Notifications.getPermissionsAsync();
    if (result.status === 'granted') return 'granted';
    if (result.status === 'denied') return 'denied';
    return 'undetermined';
  } catch {
    return 'undetermined';
  }
}
