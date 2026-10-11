/**
 * Safe haptic helpers. Never throws and never blocks: expo-haptics is loaded
 * lazily so Jest / web / bare environments without the native module stay
 * silent instead of crashing. Every UI tap that mutates the library should
 * trigger one of these for tactile polish.
 */

type HapticsModule = any;

function loadHaptics(): HapticsModule | undefined {
  try {
    // Lazy require keeps the test renderer (no native modules) working.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-haptics') as HapticsModule;
  } catch {
    return undefined;
  }
}

export function triggerLightHaptic(): void {
  try {
    const haptics = loadHaptics();
    const promise = haptics?.impactAsync?.(haptics?.ImpactFeedbackStyle?.Light);
    promise?.catch?.(() => undefined);
  } catch {
    // Haptics are decorative; silence is always acceptable.
  }
}

export function triggerMediumHaptic(): void {
  try {
    const haptics = loadHaptics();
    const promise = haptics?.impactAsync?.(haptics?.ImpactFeedbackStyle?.Medium);
    promise?.catch?.(() => undefined);
  } catch {
    // No-op.
  }
}

export function triggerSuccessHaptic(): void {
  try {
    const haptics = loadHaptics();
    const promise = haptics?.notificationAsync?.(haptics?.NotificationFeedbackType?.Success);
    promise?.catch?.(() => undefined);
  } catch {
    // No-op.
  }
}
