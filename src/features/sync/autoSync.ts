import NetInfo from '@react-native-community/netinfo';
import { useSessionStore } from '@/store/app/sessionStore';
import { showFriendlyError } from '@/lib/friendlyError';
import { isLocalLibraryPrepFailure, LOCAL_LIBRARY_PREP_NOTICE, LOCAL_LIBRARY_PREP_TITLE } from '@/lib/localLibraryNotice';
import { syncService } from './SyncService';

export type AutoSyncReason = 'mutation' | 'auth' | 'startup' | 'foreground' | 'connectivity';

/** Short debounce so rapid taps accumulate into one background sync. Local SQLite/UI are never delayed. */
export const AUTO_SYNC_DEBOUNCE_MS = 1000;
/** Cooldown so rapid foreground events do not cause excessive requests. */
export const AUTO_SYNC_FOREGROUND_COOLDOWN_MS = 15000;
/** Backoff base/cap for consecutive sync failures. Local work is never blocked. */
export const AUTO_SYNC_BACKOFF_BASE_MS = 5000;
export const AUTO_SYNC_BACKOFF_MAX_MS = 900000;

export function backoffDelayMs(consecutiveFailures: number): number {
  if (consecutiveFailures <= 0) return AUTO_SYNC_DEBOUNCE_MS;
  return Math.min(AUTO_SYNC_BACKOFF_BASE_MS * 2 ** (consecutiveFailures - 1), AUTO_SYNC_BACKOFF_MAX_MS);
}

interface AutoSyncDeps {
  getSession: () => { mode: string; userId?: string };
  sync: (userId: string) => Promise<unknown>;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clearTimer?: (timer: ReturnType<typeof setTimeout>) => void;
}

function defaultDeps(): AutoSyncDeps {
  return {
    getSession: () => useSessionStore.getState().session as { mode: string; userId?: string },
    sync: (userId: string) => syncService.sync(userId),
  };
}

/**
 * Debounced, auth-gated trigger that reuses SyncService.
 * SyncService itself guarantees a single active sync per device and
 * coalesces overlapping calls, so this layer only debounces/cooldowns.
 */
export class AutoSyncScheduler {
  private timer?: ReturnType<typeof setTimeout>;
  private lastForegroundAt = 0;
  private lastConnected: boolean | undefined;
  private consecutiveFailures = 0;

  constructor(private readonly deps: AutoSyncDeps) {}

  schedule(_reason: AutoSyncReason = 'mutation'): void {
    const setTimer = this.deps.setTimer ?? setTimeout;
    const clearTimer = this.deps.clearTimer ?? clearTimeout;
    if (this.timer) clearTimer(this.timer);
    const delay = backoffDelayMs(this.consecutiveFailures);
    this.timer = setTimer(() => {
      this.timer = undefined;
      void this.runOnce();
    }, delay);
  }

  handleForeground(): void {
    const now = (this.deps.now ?? Date.now)();
    if (now - this.lastForegroundAt < AUTO_SYNC_FOREGROUND_COOLDOWN_MS) return;
    this.lastForegroundAt = now;
    this.schedule('foreground');
  }

  handleConnectivity(isConnected: boolean): void {
    const wasConnected = this.lastConnected;
    this.lastConnected = isConnected;
    // Only trigger on offline -> online transitions (or first observed online).
    if (!isConnected) return;
    if (wasConnected === true) return;
    this.schedule('connectivity');
  }

  cancel(): void {
    if (this.timer) {
      (this.deps.clearTimer ?? clearTimeout)(this.timer);
      this.timer = undefined;
    }
  }

  /** Test-only reset for cooldown/connection/timer state. */
  resetForTests(): void {
    this.cancel();
    this.lastForegroundAt = 0;
    this.lastConnected = undefined;
    this.consecutiveFailures = 0;
  }

  private async runOnce(): Promise<void> {
    try {
      const session = this.deps.getSession();
      if (session.mode !== 'authenticated' || !session.userId) return;
      await this.deps.sync(session.userId);
      this.consecutiveFailures = 0;
    } catch (cause) {
      this.consecutiveFailures += 1;
      // Automatic sync must never break the app; SyncService already records
      // retryable status and the durable queue remains intact for later triggers.
      //
      // One exception: "Couldn't prepare this account's local library." is a
      // prompt-worthy failure — the background trigger is the only surface it
      // can reach (the sync status line alone reads as a transient hiccup).
      if (isLocalLibraryPrepFailure(cause)) {
        // Same title + copy as the auth screen's notice dialog, so
        // showFriendlyError collapses any overlap into ONE prompt.
        void showFriendlyError(cause, LOCAL_LIBRARY_PREP_TITLE, { message: LOCAL_LIBRARY_PREP_NOTICE });
      }
    }
  }
}

let singleton: AutoSyncScheduler | undefined;
let connectivityUnsubscribe: (() => void) | undefined;

export function getAutoSyncScheduler(): AutoSyncScheduler {
  if (!singleton) singleton = new AutoSyncScheduler(defaultDeps());
  return singleton;
}

/** Fire-and-forget debounced sync for authenticated users. Safe to call from any trigger. */
export function scheduleAutoSync(reason: AutoSyncReason = 'mutation'): void {
  getAutoSyncScheduler().schedule(reason);
}

/** Foreground trigger with cooldown. Safe to call on every AppState active event. */
export function handleAutoSyncForeground(): void {
  getAutoSyncScheduler().handleForeground();
}

/** Connectivity trigger; only offline -> online schedules a sync. */
export function handleAutoSyncConnectivity(isConnected: boolean): void {
  getAutoSyncScheduler().handleConnectivity(isConnected);
}

/**
 * Subscribes to connectivity changes. Call once at app startup; returns an
 * unsubscribe function. Auth/foreground triggers stay in app/_layout.tsx and
 * route through the same scheduler.
 */
export function startAutoSync(): () => void {
  if (connectivityUnsubscribe) return stopAutoSync;
  connectivityUnsubscribe = NetInfo.addEventListener((state) => {
    handleAutoSyncConnectivity(state.isConnected ?? false);
  });
  return stopAutoSync;
}

export function stopAutoSync(): void {
  connectivityUnsubscribe?.();
  connectivityUnsubscribe = undefined;
}

/** Test-only: reset singleton scheduler state. */
export function __resetAutoSyncForTests(): void {
  singleton?.resetForTests();
  singleton = undefined;
  connectivityUnsubscribe = undefined;
}
