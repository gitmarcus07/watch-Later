import AsyncStorage from '@react-native-async-storage/async-storage';
import { Notifications } from '@/lib/notifications';
import { refreshReminders } from '@/features/notifications/scheduler';
import { showDialog, showToast } from '@/components/feedback/AppDialog';
import { logger } from '@/lib/logger';

/**
 * One-time notification permission prompt shown on the home screen.
 *
 * Runs once per install, only while the OS permission is still
 * `undetermined` (never asked before). Already-granted/denied devices are
 * left alone, and clients without the native module (Expo Go) resolve
 * silently. Never throws — home must never block on this.
 */
const PROMPT_KEY = 'watch-later.notification-prompt.v1';

export async function maybePromptNotificationPermission(): Promise<void> {
  try {
    if (await AsyncStorage.getItem(PROMPT_KEY)) return;
    let status: string;
    try {
      status = (await Notifications.getPermissionsAsync()).status;
    } catch {
      // No native module (Expo Go): nothing to ask for.
      await AsyncStorage.setItem(PROMPT_KEY, 'unavailable').catch(() => undefined);
      return;
    }
    if (status !== 'undetermined') {
      await AsyncStorage.setItem(PROMPT_KEY, status).catch(() => undefined);
      return;
    }
    const confirmed = await showDialog({
      type: 'info',
      title: 'Never miss a premiere?',
      message: 'Allow notifications and we’ll nudge you about new releases and episodes from your list. You can change this anytime in Settings.',
      primaryAction: { label: 'Allow' },
      secondaryAction: { label: 'Not now' },
    });
    await AsyncStorage.setItem(PROMPT_KEY, 'prompted').catch(() => undefined);
    if (!confirmed) return;
    try {
      const next = (await Notifications.requestPermissionsAsync()).status;
      if (next === 'granted') {
        await refreshReminders().catch(() => undefined);
        showToast('Notifications on — you’ll hear about new releases', 'success');
      } else {
        showToast('Notifications stay off — enable them anytime in Settings', 'info');
      }
    } catch (error) {
      logger.error('Notification permission request failed', error);
    }
  } catch (error) {
    logger.error('Notification permission prompt failed', error);
  }
}

/** Test-only reset for the one-time prompt flag. */
export async function __resetNotificationPromptForTests(): Promise<void> {
  await AsyncStorage.removeItem(PROMPT_KEY).catch(() => undefined);
}

export { PROMPT_KEY };
