import { Platform } from 'react-native';
import type * as ExpoNotificationTypes from 'expo-notifications';
import { Notifications } from '@/lib/notifications';
import type { OttReleaseRecord } from '@/domain/models/ottRelease';
import { sqliteOttReleaseRepository } from '@/data/local/repositories/SqliteOttReleaseRepository';
import { logger } from '@/lib/logger';

export type OttReminderResult =
  | { status: 'scheduled' }
  | { status: 'saved' }
  | { status: 'off' }
  | { status: 'denied' }
  | { status: 'unavailable' };

/**
 * 9am local on the exact premiere day. Month/year windows and unknown
 * dates never produce a schedule — no fabricated alert days.
 */
export function ottReminderDate(ottDate: string | undefined, precision: OttReleaseRecord['datePrecision'], now: Date = new Date()): Date | undefined {
  if (!ottDate || precision !== 'exact') return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(ottDate);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 9, 0, 0, 0);
  if (Number.isNaN(date.getTime()) || date.getTime() <= now.getTime()) return undefined;
  return date;
}

export function ottReminderId(recordId: string): string {
  return `ott:${recordId}`;
}

export const OTT_PREMIERES_CHANNEL_ID = 'watch-later-premieres';
export const OTT_NOTIFICATION_COLOR = '#A855F7';
export const OTT_NOTIFICATION_SOUND = 'notification_sound.wav';

export interface OttNotificationRequest {
  identifier: string;
  content: { title: string; body: string; data: { route: string; ottRecordId?: string }; color: string; sound: string };
  trigger: { type: ExpoNotificationTypes.SchedulableTriggerInputTypes.DATE; date: Date; channelId: string };
}

/** Pure builder: the exact branded alert a record produces. Fully testable. */
export function ottNotificationRequest(record: Pick<OttReleaseRecord, 'id' | 'movieTitle' | 'platform'>, date: Date): OttNotificationRequest {
  return {
    identifier: ottReminderId(record.id),
    content: {
      ...ottPreviewContent(record),
      data: { route: '/media/[id]', ottRecordId: record.id },
      color: OTT_NOTIFICATION_COLOR,
      sound: OTT_NOTIFICATION_SOUND,
    },
    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: OTT_PREMIERES_CHANNEL_ID },
  };
}

/** Dedicated high-importance channel so premiere alerts pop + play the brand chime. */
export async function ensurePremieresChannel(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(OTT_PREMIERES_CHANNEL_ID, {
      name: 'OTT premieres',
      importance: Notifications.AndroidImportance.HIGH,
      sound: OTT_NOTIFICATION_SOUND,
    }).catch(() => undefined);
  }
}

/**
 * Persists the notify-me preference and keeps exactly one local
 * notification per record. Re-scheduling with the same identifier replaces
 * the previous one, so postponed dates self-correct on the next view.
 * Never throws — failures resolve to a status the UI can explain.
 */
export async function setOttReminder(record: OttReleaseRecord, enabled: boolean): Promise<OttReminderResult> {
  await sqliteOttReleaseRepository.setNotifyPref(record.id, enabled);
  const identifier = ottReminderId(record.id);
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
    const date = ottReminderDate(record.ottReleaseDate, record.datePrecision);
    if (!date) return { status: 'saved' };
    if (Platform.OS === 'android') {
      await ensurePremieresChannel();
    }
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined);
    const request = ottNotificationRequest(record, date);
    await Notifications.scheduleNotificationAsync({
      identifier: request.identifier,
      content: request.content,
      trigger: request.trigger,
    });
    return { status: 'scheduled' };
  } catch (error) {
    logger.error('OTT reminder update failed', error);
    return { status: 'unavailable' };
  }
}

export async function getOttNotifyPref(recordId: string): Promise<boolean> {
  return sqliteOttReleaseRepository.getNotifyPref(recordId);
}

export interface OttRefreshDeps {
  getNotifiedIds: () => Promise<string[]>;
  getCachedRecords: () => Promise<OttReleaseRecord[]>;
  getPermission: () => Promise<{ status: string }>;
  ensureChannel: () => Promise<void>;
  cancel: (identifier: string) => Promise<void>;
  schedule: (record: OttReleaseRecord, date: Date) => Promise<void>;
  now?: () => Date;
}

function defaultRefreshDeps(): OttRefreshDeps {
  return {
    getNotifiedIds: () => sqliteOttReleaseRepository.getNotifiedRecords(),
    getCachedRecords: () => sqliteOttReleaseRepository.list({ country: 'IN', limit: 500 }),
    getPermission: async () => {
      const result = await Notifications.getPermissionsAsync();
      return { status: result.status };
    },
    ensureChannel: () => ensurePremieresChannel(),
    cancel: (identifier) => Notifications.cancelScheduledNotificationAsync(identifier).catch(() => undefined),
    schedule: (record, date) => {
      const request = ottNotificationRequest(record, date);
      return Notifications.scheduleNotificationAsync({
        identifier: request.identifier,
        content: request.content,
        trigger: request.trigger,
      }).then(() => undefined);
    },
  };
}

let lastOttRefreshAt = 0;
const OTT_REFRESH_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * Rebuilds OTT premiere alerts from notify-me prefs and last-verified data.
 * Runs on foreground (cooldown-guarded): granted-permission only — it never
 * prompts — so postponed dates self-correct without opening each title.
 * Same identifiers replace stale schedules; passed/unknown dates cancel.
 * Never throws.
 */
export async function refreshOttReminders(deps: OttRefreshDeps = defaultRefreshDeps(), now: number = Date.now()): Promise<number> {
  if (now - lastOttRefreshAt < OTT_REFRESH_COOLDOWN_MS) return 0;
  lastOttRefreshAt = now;
  try {
    const permission = await deps.getPermission();
    if (permission.status !== 'granted') return 0;
    const [ids, cached] = await Promise.all([
      deps.getNotifiedIds().catch(() => [] as string[]),
      deps.getCachedRecords().catch(() => [] as OttReleaseRecord[]),
    ]);
    if (!ids.length) return 0;
    const byId = new Map(cached.map((record) => [record.id, record]));
    await deps.ensureChannel().catch(() => undefined);
    let scheduled = 0;
    const moment = deps.now?.() ?? new Date(now);
    for (const id of ids) {
      const record = byId.get(id);
      const date = record ? ottReminderDate(record.ottReleaseDate, record.datePrecision, moment) : undefined;
      try {
        if (date && record) {
          await deps.schedule(record, date);
          scheduled += 1;
        } else {
          await deps.cancel(ottReminderId(id));
        }
      } catch {
        // One record's failure never blocks the rest.
      }
    }
    return scheduled;
  } catch (error) {
    logger.error('OTT reminder refresh failed', error);
    return 0;
  }
}

/** Test-only reset for the foreground cooldown. */
export function __resetOttRefreshForTests(): void {
  lastOttRefreshAt = 0;
}

/**
 * Fires a real local notification ~10s out so the permission → schedule →
 * display pipeline can be verified on device. User-gesture only. Pass the
 * record's own title/body to preview exactly what its premiere alert shows.
 */
export async function sendTestNotification(custom?: { title: string; body: string }): Promise<'scheduled' | 'denied' | 'unavailable'> {
  try {
    let status = (await Notifications.getPermissionsAsync()).status;
    if (status !== 'granted') {
      status = (await Notifications.requestPermissionsAsync()).status;
    }
    if (status !== 'granted') return 'denied';
    if (Platform.OS === 'android') {
      await ensurePremieresChannel();
    }
    await Notifications.scheduleNotificationAsync({
      content: {
        title: custom?.title ?? 'Test notification',
        body: custom?.body ?? 'Notifications are working — premiere alerts will look like this.',
        data: { route: '/(tabs)/more' },
        color: OTT_NOTIFICATION_COLOR,
        sound: OTT_NOTIFICATION_SOUND,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: new Date(Date.now() + 10_000), channelId: OTT_PREMIERES_CHANNEL_ID },
    });
    return 'scheduled';
  } catch (error) {
    logger.error('Test notification failed', error);
    return 'unavailable';
  }
}

/** Record-accurate preview: this exact title/body is what premiere day shows. */
export function ottPreviewContent(record: Pick<OttReleaseRecord, 'movieTitle' | 'platform'>): { title: string; body: string } {
  return {
    title: `${record.movieTitle} on ${record.platform}`,
    body: `Streaming in India today — ${record.movieTitle} premieres on ${record.platform}.`,
  };
}
