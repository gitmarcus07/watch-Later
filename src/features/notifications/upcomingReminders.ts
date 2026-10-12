import { Platform } from 'react-native';
import notifee, { AndroidImportance, EventType, TriggerType } from '@notifee/react-native';
import type { Notification as NotifeeNotification } from '@notifee/react-native';
import { Notifications, isExpoGoClient } from '@/lib/notifications';
import type { CatalogMedia } from '@/domain/models/media';
import { watchStateRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { useNotificationStore } from '@/store/app/notificationStore';
import { parseMediaRouteId } from '@/features/catalog/mediaIdentity';
import { logger } from '@/lib/logger';

/**
 * Release-day alerts (Pick Later → actually the Interested list, see below)
 * are displayed with Notifee: it is the only stack in the project that can
 * set a large icon. expo-notifications stays for the pre-existing OTT and
 * watchlist reminders.
 *
 * Mapping (agreed with the owner): the spec's "Pick Later" list is the
 * app's Interested (bell) marks; "Move to ASAP" saves the title to the
 * Watchlist with `asap` priority.
 */
export const RELEASE_DAY_CHANNEL_ID = 'release_day';
export const RELEASE_DAY_SMALL_ICON = 'ic_stat_watch_later';
export const RELEASE_DAY_LARGE_ICON = 'ic_large_watch_later';
export const RELEASE_DAY_COLOR = '#8614D9';
/** Notifee channel sound: res/raw entry WITHOUT the extension. */
export const RELEASE_DAY_SOUND = 'wl_now_showing';
/** expo-notifications references the same file WITH the extension. */
export const RELEASE_DAY_SOUND_FILE = 'wl_now_showing.wav';
export const MOVE_TO_ASAP_ACTION_ID = 'move-to-asap';
export const DEFAULT_PRESS_ACTION_ID = 'default';

export type UpcomingReminderResult =
  | { status: 'scheduled' }
  | { status: 'saved' }
  | { status: 'off' }
  | { status: 'denied' }
  | { status: 'unavailable'; reason?: 'expo-go' };

/** Unavailable is honest about Expo Go (no native module) vs real failures. */
function unavailable(): UpcomingReminderResult {
  return { status: 'unavailable', reason: isExpoGoClient() ? 'expo-go' : undefined };
}

/** Deterministic per-title id per spec (`release-{titleId}`): repeats replace instead of stacking. */
export function upcomingReminderId(media: Pick<CatalogMedia, 'provider' | 'mediaType' | 'providerId'>): string {
  return `release:${media.provider}:${media.mediaType}:${media.providerId}`;
}

/** Legacy expo-scheduled ids from before the Notifee migration; cancelled on sight. */
export function legacyUpcomingReminderId(media: Pick<CatalogMedia, 'provider' | 'mediaType' | 'providerId'>): string {
  return `upcoming:${media.provider}:${media.mediaType}:${media.providerId}`;
}

/**
 * 9am local on release day. Past dates and non-calendar values never produce
 * a schedule — the interest mark itself is the fallback. Exact-alarm
 * permission is never requested: Notifee timestamp triggers default to the
 * WorkManager API (inexact).
 */
export function upcomingReminderDate(releaseDate: string | undefined, now: Date = new Date()): Date | undefined {
  if (!releaseDate) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(releaseDate);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 9, 0, 0, 0);
  if (Number.isNaN(date.getTime()) || date.getTime() <= now.getTime()) return undefined;
  return date;
}

/** Spec copy for Pick Later (mapped to Interested) titles. */
export const RELEASE_DAY_BODY = "It's on your Pick Later list. Move it to ASAP?";

export interface ReleaseDayData {
  type: 'release_day';
  route: '/media/[id]';
  mediaId: string;
  /** Full snapshot at schedule time so "Move to ASAP" works offline. */
  mediaJson?: string;
}

/**
 * The exact visible notification, shared by the trigger scheduler and a
 * future data-only FCM handler (which would call this with the pushed
 * titleId/titleName and then display it). Android draws everything; we only
 * declare small icon, large icon, color, title, body, sound (via channel),
 * tap behavior, and the action button. Square logo: no circularLargeIcon.
 */
export function buildReleaseDayNotification(media: CatalogMedia): NotifeeNotification {
  const data: ReleaseDayData = {
    type: 'release_day',
    route: '/media/[id]',
    mediaId: media.id,
    mediaJson: JSON.stringify(media),
  };
  return {
    id: upcomingReminderId(media),
    title: releaseDayTitle(media.title),
    body: RELEASE_DAY_BODY,
    // Notifee data values are strings/numbers/objects; every field here is a string.
    data: data as unknown as NotifeeNotification['data'],
    android: {
      channelId: RELEASE_DAY_CHANNEL_ID,
      smallIcon: RELEASE_DAY_SMALL_ICON,
      largeIcon: RELEASE_DAY_LARGE_ICON,
      color: RELEASE_DAY_COLOR,
      pressAction: { id: DEFAULT_PRESS_ACTION_ID },
      actions: [
        {
          title: 'Move to ASAP',
          pressAction: { id: MOVE_TO_ASAP_ACTION_ID },
        },
      ],
    },
  };
}

/** Backwards-compatible wrapper: the expo-shaped content some callers preview. */
export function upcomingNotificationContent(media: Pick<CatalogMedia, 'id' | 'title' | 'mediaType'>): {
  title: string;
  body: string;
  data: { route: string; mediaId?: string };
  color: string;
  sound: string;
} {
  return {
    title: releaseDayTitle(media.title),
    body: RELEASE_DAY_BODY,
    data: { route: '/media/[id]', mediaId: media.id },
    color: RELEASE_DAY_COLOR,
    sound: RELEASE_DAY_SOUND_FILE,
  };
}

/**
 * `{title} is out today`, truncating long titles with an ellipsis so the
 * suffix always stays visible.
 */
export function releaseDayTitle(title: string): string {
  const suffix = ' is out today';
  const clean = title.trim() || 'A title you saved';
  if (`${clean}${suffix}`.length <= 48) return `${clean}${suffix}`;
  return `${clean.slice(0, 38).trimEnd()}…${suffix}`;
}

/**
 * Maps a tapped notification back into the app. Returns null for anything
 * that is not a known title deep link.
 */
export function resolveNotificationTarget(data: { route?: string; mediaId?: string } | null | undefined): {
  pathname: '/media/[id]';
  params: { id: string };
} | null {
  if (data?.route === '/media/[id]' && data.mediaId) {
    return { pathname: '/media/[id]', params: { id: data.mediaId } };
  }
  return null;
}

export function isReleaseDayData(data: unknown): data is ReleaseDayData {
  if (!data || typeof data !== 'object') return false;
  const record = data as Partial<ReleaseDayData>;
  return record.type === 'release_day' && typeof record.mediaId === 'string';
}

/**
 * Dedicated high-importance channel so release alerts pop + play the brand
 * chime. Created via Notifee (display path) and expo-notifications (the
 * pre-existing watchlist scheduler shares the id) with identical config —
 * either call is idempotent, and Android keeps the first-created channel.
 */
export async function ensureReleasesChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await notifee
    .createChannel({
      id: RELEASE_DAY_CHANNEL_ID,
      name: 'Release day',
      importance: AndroidImportance.HIGH,
      sound: RELEASE_DAY_SOUND,
    })
    .catch(() => undefined);
  await Notifications.setNotificationChannelAsync(RELEASE_DAY_CHANNEL_ID, {
    name: 'Release day',
    importance: Notifications.AndroidImportance.HIGH,
    sound: RELEASE_DAY_SOUND_FILE,
  }).catch(() => undefined);
}

/**
 * Schedules (or cancels) the release-day alert for one title. The interest
 * mark itself is persisted by the caller via useInterestedMutation — this
 * only owns the notification. Same id re-schedules replace instead of
 * stacking. Never throws; failures resolve to a status the UI can explain.
 */
export async function setUpcomingReminder(media: CatalogMedia, enabled: boolean): Promise<UpcomingReminderResult> {
  const identifier = upcomingReminderId(media);
  try {
    if (!enabled) {
      await notifee.cancelNotification(identifier).catch(() => undefined);
      return { status: 'off' };
    }
    let permission: { status: string };
    try {
      permission = await Notifications.getPermissionsAsync().then((result) => ({ status: result.status }));
    } catch {
      return unavailable();
    }
    if (permission.status !== 'granted') {
      try {
        permission = await Notifications.requestPermissionsAsync().then((result) => ({ status: result.status }));
      } catch {
        return unavailable();
      }
      if (permission.status !== 'granted') return { status: 'denied' };
    }
    const date = upcomingReminderDate(media.releaseDate);
    if (!date) return { status: 'saved' };
    if (Platform.OS === 'android') {
      await ensureReleasesChannel();
    }
    await notifee
      .createTriggerNotification(buildReleaseDayNotification(media), {
        type: TriggerType.TIMESTAMP,
        timestamp: date.getTime(),
      })
      .catch((error: unknown) => {
        throw error;
      });
    return { status: 'scheduled' };
  } catch (error) {
    logger.error('Upcoming reminder update failed', error);
    return unavailable();
  }
}

export interface UpcomingRefreshDeps {
  getInterested: () => Promise<CatalogMedia[]>;
  getPermission: () => Promise<{ status: string }>;
  ensureChannel: () => Promise<void>;
  getScheduledIds: () => Promise<string[]>;
  cancel: (identifier: string) => Promise<void>;
  schedule: (media: CatalogMedia, date: Date) => Promise<void>;
  /** One-time migration: expo-scheduled `upcoming:*` ids left by older builds. */
  getLegacyExpoIds?: () => Promise<string[]>;
  cancelLegacyExpo?: (identifier: string) => Promise<void>;
  /** Master switch (Settings → New release reminders). Absent in tests = enabled. */
  isEnabled?: () => boolean;
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
    getScheduledIds: () => notifee.getTriggerNotificationIds().catch(() => [] as string[]),
    cancel: (identifier) => notifee.cancelNotification(identifier).catch(() => undefined),
    schedule: (media, date) =>
      notifee
        .createTriggerNotification(buildReleaseDayNotification(media), {
          type: TriggerType.TIMESTAMP,
          timestamp: date.getTime(),
        })
        .then(() => undefined),
    getLegacyExpoIds: async () => {
      try {
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        return scheduled
          .map((item) => item.identifier)
          .filter((id) => id.startsWith('upcoming:'));
      } catch {
        return [];
      }
    },
    cancelLegacyExpo: (identifier) => Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined),
    isEnabled: () => useNotificationStore.getState().newReleaseReminders,
  };
}

let lastUpcomingRefreshAt = 0;
const UPCOMING_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Rebuilds release-day alerts from interest marks and current dates.
 * Foreground-safe (cooldown-guarded): granted-permission only — it never
 * prompts. Same ids replace stale schedules; passed dates cancel. Also
 * sweeps legacy expo `upcoming:*` schedules once (they belong to the
 * pre-Notifee display path). Never throws.
 */
export async function refreshUpcomingReminders(deps: UpcomingRefreshDeps = defaultRefreshDeps(), now: number = Date.now()): Promise<number> {
  if (now - lastUpcomingRefreshAt < UPCOMING_REFRESH_COOLDOWN_MS) return 0;
  try {
    if (deps.isEnabled && !deps.isEnabled()) return 0;
    const permission = await deps.getPermission();
    if (permission.status !== 'granted') return 0;
    // Only successful runs consume the cooldown: denied devices re-check
    // every foreground instead of sleeping through a permission grant.
    lastUpcomingRefreshAt = now;
    const items = await deps.getInterested().catch(() => [] as CatalogMedia[]);
    await deps.ensureChannel().catch(() => undefined);
    if (deps.getLegacyExpoIds && deps.cancelLegacyExpo) {
      const legacy = await deps.getLegacyExpoIds().catch(() => [] as string[]);
      for (const id of legacy) {
        try {
          await deps.cancelLegacyExpo(id);
        } catch {
          // One stale schedule never blocks the rest.
        }
      }
    }
    if (!items.length) return 0;
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

export interface MoveToAsapDeps {
  saveToWatchlist: (media: CatalogMedia, priority: 'asap') => Promise<void>;
  fetchMediaById?: (mediaId: string) => Promise<CatalogMedia | null>;
  cancelNotification?: (notificationId: string) => Promise<void>;
}

function defaultMoveToAsapDeps(): MoveToAsapDeps {
  return {
    saveToWatchlist: (media, priority) => watchStateRepository.saveToWatchlist(media, priority),
    fetchMediaById: async (mediaId) => {
      try {
        const identity = parseMediaRouteId(mediaId);
        if (!identity) return null;
        // Lazy to keep notification startup light.
        const { catalogRepository } = await import('@/data/remote/catalog/RemoteCatalogRepository');
        return await catalogRepository.getMedia(identity);
      } catch {
        return null;
      }
    },
    cancelNotification: (notificationId) => notifee.cancelNotification(notificationId).catch(() => undefined),
  };
}

function mediaFromData(data: ReleaseDayData | null | undefined): CatalogMedia | undefined {
  if (!data?.mediaJson) return undefined;
  try {
    const parsed = JSON.parse(data.mediaJson) as Partial<CatalogMedia>;
    if (parsed && typeof parsed.id === 'string' && parsed.id && typeof parsed.title === 'string') {
      return parsed as CatalogMedia;
    }
  } catch {
    // Fall through to the fetch path below.
  }
  return undefined;
}

/**
 * Handles the "Move to ASAP" action without opening the app: saves the title
 * to the Watchlist with ASAP priority, then dismisses the notification.
 * Works from foreground events, background events (headless), and tests via
 * deps. Never throws.
 */
export async function handleMoveToAsap(
  input: { data: ReleaseDayData | null | undefined; notificationId?: string },
  deps: MoveToAsapDeps = defaultMoveToAsapDeps(),
): Promise<'moved' | 'ignored'> {
  try {
    let media = mediaFromData(input.data);
    const mediaId = input.data?.mediaId;
    if (!media && mediaId && deps.fetchMediaById) {
      media = (await deps.fetchMediaById(mediaId).catch(() => null)) ?? undefined;
    }
    if (!media) return 'ignored';
    await deps.saveToWatchlist(media, 'asap');
    if (input.notificationId && deps.cancelNotification) {
      await deps.cancelNotification(input.notificationId).catch(() => undefined);
    }
    return 'moved';
  } catch (error) {
    logger.error('Move to ASAP failed', error);
    return 'ignored';
  }
}

export type ReleaseDayEventOutcome =
  | { kind: 'open'; mediaId: string }
  | { kind: 'move'; data: ReleaseDayData; notificationId: string }
  | { kind: 'ignored' };

/**
 * Interprets one Notifee event for release-day notifications. Pure (no I/O):
 * callers navigate on `open`, run handleMoveToAsap on `move`. Non-release-day
 * notifications always yield `ignored`.
 */
export function interpretReleaseDayEvent(event: {
  type: EventType;
  detail: { notification?: { id?: string; data?: unknown }; pressAction?: { id?: string } };
}): ReleaseDayEventOutcome {
  const data = event.detail.notification?.data ?? null;
  if (!isReleaseDayData(data)) return { kind: 'ignored' };
  const notificationId = event.detail.notification?.id ?? upcomingReminderId({ provider: 'tmdb', mediaType: 'movie', providerId: data.mediaId });
  if (event.type === EventType.ACTION_PRESS && event.detail.pressAction?.id === MOVE_TO_ASAP_ACTION_ID) {
    return { kind: 'move', data, notificationId };
  }
  if (event.type === EventType.PRESS) {
    return { kind: 'open', mediaId: data.mediaId };
  }
  return { kind: 'ignored' };
}

/**
 * Fires a real release-day alert ~10s out so the title/body/icons/sound/action
 * can be verified on device without waiting for a real premiere. User-gesture
 * only. Uses the exact production payload with a 10-second trigger.
 */
export async function sendReleaseDayTestNotification(media: CatalogMedia): Promise<'scheduled' | 'denied' | 'unavailable'> {
  try {
    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return 'denied';
    if (Platform.OS === 'android') {
      await ensureReleasesChannel();
    }
    const payload = buildReleaseDayNotification(media);
    await notifee.createTriggerNotification(payload, {
      type: TriggerType.TIMESTAMP,
      timestamp: Date.now() + 10_000,
    });
    return 'scheduled';
  } catch (error) {
    logger.error('Release-day test notification failed', error);
    return 'unavailable';
  }
}
