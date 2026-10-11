import { Platform } from 'react-native';
import { Notifications } from '@/lib/notifications';
import type { CatalogMedia } from '@/domain/models/media';
import { watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { OTT_NOTIFICATION_COLOR, OTT_NOTIFICATION_SOUND } from '@/features/ott/ottReminders';
import { logger } from '@/lib/logger';

export const UPCOMING_RELEASES_CHANNEL_ID = 'watch-later-releases';

export type UpcomingReminderResult =
  | { status: 'scheduled' }
  | { status: 'saved' }
  | { status: 'off' }
  | { status: 'denied' }
  | { status: 'unavailable' };

export function upcomingReminderId(media: Pick<CatalogMedia, 'provider' | 'mediaType' | 'providerId'>): string {
  return `upcoming:${media.provider}:${media.mediaType}:${media.providerId}`;
}

/**
 * 9am local on release day. Past dates and non-calendar values never produce
 * a schedule — the interest mark itself is the fallback.
 */
export function upcomingReminderDate(releaseDate: string | undefined, now: Date = new Date()): Date | undefined {
  if (!releaseDate) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(releaseDate);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 9, 0, 0, 0);
  if (Number.isNaN(date.getTime()) || date.getTime() <= now.getTime()) return undefined;
  return date;
}

/** Branded release-day alert: app color + custom chime, opens the title. */
export function upcomingNotificationContent(media: Pick<CatalogMedia, 'id' | 'title' | 'mediaType'>): {
  title: string;
  body: string;
  data: { route: string; mediaId?: string };
  color: string;
  sound: string;
} {
  const premieres = media.mediaType !== 'movie';
  return {
    title: media.title,
    body: premieres
      ? `${media.title} premieres today — tap to track it.`
      : `${media.title} releases today — tap to mark it watched.`,
    data: { route: '/media/[id]', mediaId: media.id },
    color: OTT_NOTIFICATION_COLOR,
    sound: OTT_NOTIFICATION_SOUND,
  };
}

/** Dedicated high-importance channel so release alerts pop + play the brand chime. */
export async function ensureReleasesChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(UPCOMING_RELEASES_CHANNEL_ID, {
      name: 'Upcoming releases',
      importance: Notifications.AndroidImportance.HIGH,
      sound: OTT_NOTIFICATION_SOUND,
    }).catch(() => undefined);
  }
}

/**
 * Schedules (or cancels) the release-day alert for one title. The interest
 * mark itself is persisted by the caller via useInterestedMutation — this
 * only owns the notification. Never throws; failures resolve to a status
 * the UI can explain.
 */
export async function setUpcomingReminder(media: CatalogMedia, enabled: boolean): Promise<UpcomingReminderResult> {
  const identifier = upcomingReminderId(media);
  try {
    if (!enabled) {
      await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
      return { status: 'off' };
    }
    let permission: { status: string };
    try {
      permission = await Notifications.getPermissionsAsync().then((result) => ({ status: result.status }));
    } catch {
      return { status: 'unavailable' };
    }
    if (permission.status !== 'granted') {
      try {
        permission = await Notifications.requestPermissionsAsync().then((result) => ({ status: result.status }));
      } catch {
        return { status: 'unavailable' };
      }
      if (permission.status !== 'granted') return { status: 'denied' };
    }
    const date = upcomingReminderDate(media.releaseDate);
    if (!date) return { status: 'saved' };
    if (Platform.OS === 'android') {
      await ensureReleasesChannel();
    }
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
    const content = upcomingNotificationContent(media);
    await Notifications.scheduleNotificationAsync({
      identifier,
      content,
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: UPCOMING_RELEASES_CHANNEL_ID },
    });
    return { status: 'scheduled' };
  } catch (error) {
    logger.error('Upcoming reminder update failed', error);
    return { status: 'unavailable' };
  }
}

export interface UpcomingRefreshDeps {
  getInterested: () => Promise<CatalogMedia[]>;
  getPermission: () => Promise<{ status: string }>;
  ensureChannel: () => Promise<void>;
  cancel: (identifier: string) => Promise<void>;
  schedule: (media: CatalogMedia, date: Date) => Promise<void>;
  now?: () => Date;
}

function defaultRefreshDeps(): UpcomingRefreshDeps {
  return {
    getInterested: () => watchStateRepository.getInterested().then((entries) => entries.map((entry) => entry.media)),
    getPermission: async () => {
      const result = await Notifications.getPermissionsAsync();
      return { status: result.status };
    },
    ensureChannel: () => ensureReleasesChannel(),
    cancel: (identifier) => Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined),
    schedule: (media, date) => {
      const content = upcomingNotificationContent(media);
      return Notifications.scheduleNotificationAsync({
        identifier: upcomingReminderId(media),
        content,
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: UPCOMING_RELEASES_CHANNEL_ID },
      }).then(() => undefined);
    },
  };
}

let lastUpcomingRefreshAt = 0;
const UPCOMING_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Rebuilds release-day alerts from interest marks and current dates.
 * Foreground-safe (cooldown-guarded): granted-permission only — it never
 * prompts. Same identifiers replace stale schedules; passed dates cancel.
 * Never throws.
 */
export async function refreshUpcomingReminders(deps: UpcomingRefreshDeps = defaultRefreshDeps(), now: number = Date.now()): Promise<number> {
  if (now - lastUpcomingRefreshAt < UPCOMING_REFRESH_COOLDOWN_MS) return 0;
  try {
    const permission = await deps.getPermission();
    if (permission.status !== 'granted') return 0;
    // Only successful runs consume the cooldown: denied devices re-check
    // every foreground instead of sleeping through a permission grant.
    lastUpcomingRefreshAt = now;
    const items = await deps.getInterested().catch(() => [] as CatalogMedia[]);
    if (!items.length) return 0;
    await deps.ensureChannel().catch(() => undefined);
    let scheduled = 0;
    const moment = deps.now?.() ?? new Date(now);
    for (const media of items) {
      const date = upcomingReminderDate(media.releaseDate, moment);
      try {
        if (date) {
          await deps.schedule(media, date);
          scheduled += 1;
        } else {
          await deps.cancel(upcomingReminderId(media));
        }
      } catch {
        // One title's failure never blocks the rest.
      }
    }
    return scheduled;
  } catch (error) {
    logger.error('Upcoming reminder refresh failed', error);
    return 0;
  }
}

/** Test-only reset for the foreground cooldown. */
export function __resetUpcomingRefreshForTests(): void {
  lastUpcomingRefreshAt = 0;
}
