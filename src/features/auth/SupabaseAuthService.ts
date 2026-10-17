import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppError } from '@/domain/errors/AppError';
import type { SessionState } from '@/domain/models/session';
import { supabase } from '@/data/remote/supabase/client';
import { clearDeviceLibrary } from '@/data/local/database/database';
import { queryClient } from '@/lib/query/queryClient';
import { watchStateSyncRepository } from '@/data/local/repositories/SqliteWatchStateRepository';
import { clearLastDeletedAccount, getLastDeletedAccount } from './deleteAccount';
import { LOCAL_LIBRARY_PREP_NOTICE } from '@/lib/localLibraryNotice';
import { SqliteGuestMigrationService } from '@/data/local/repositories/SqliteGuestMigrationService';
import type { GuestMigrationService } from '@/data/local/repositories/GuestMigrationService';
import type { AuthService } from './sessionService';

interface AuthUser { id: string; email?: string; created_at?: string; identities?: unknown[] }
interface AuthSession { user: AuthUser }
interface AuthFailure { code?: string; message?: string }
interface OAuthRedirectResult { type: string; url?: string }
interface OAuthBrowser {
  openAuthSessionAsync(url: string, redirectUri: string): Promise<OAuthRedirectResult>;
}
export interface OAuthDeps {
  redirectUri: string;
  browser: OAuthBrowser;
}
interface AuthClient {
  auth: {
    signInWithPassword(input: { email: string; password: string }): Promise<{ data: { user: AuthUser | null; session: AuthSession | null }; error: AuthFailure | null }>;
    signUp(input: { email: string; password: string }): Promise<{ data: { user: AuthUser | null; session: AuthSession | null }; error: AuthFailure | null }>;
    signInWithOAuth?(input: { provider: string; options?: { redirectTo?: string; skipBrowserRedirect?: boolean; queryParams?: Record<string, string> } }): Promise<{ data: { url: string | null }; error: AuthFailure | null }>;
    exchangeCodeForSession?(code: string): Promise<{ error: AuthFailure | null }>;
    setSession?(input: { access_token: string; refresh_token: string }): Promise<{ error: AuthFailure | null }>;
    getSession?(): Promise<{ data: { session: AuthSession | null } }>;
    getUser?(): Promise<{ data: { user: AuthUser | null }; error: AuthFailure | null }>;
    signOut(options?: { scope?: 'global' | 'local' | 'others' }): Promise<{ error: AuthFailure | null }>;
  };
  functions?: {
    invoke(functionName: string, options?: unknown): Promise<{ data: unknown; error: unknown }>;
  };
}

/** Thrown when the device library is still bound to a different account. */
export const DEVICE_LINKED_MESSAGE =
  'This device library is linked to another account. Sign back into that account before syncing.';

/**
 * A device-binding refusal that keeps its Supabase session alive so the UI
 * can clear the stale library and finish binding the SAME account without
 * sending the user through the browser a second time.
 */
export class DeviceLinkedError extends AppError {
  constructor(
    readonly accountId: string,
    readonly accountEmail?: string,
  ) {
    super('authentication', DEVICE_LINKED_MESSAGE);
    this.name = 'DeviceLinkedError';
  }
}

export function isDeviceLinkedError(error: unknown): boolean {
  if (error instanceof DeviceLinkedError) return true;
  return error instanceof AppError
    ? error.message === DEVICE_LINKED_MESSAGE
    : error instanceof Error && error.message.includes('linked to another account');
}

/**
 * Intent of a Google OAuth flow. Sign-in must never auto-create an account:
 * Supabase creates a fresh auth user on first OAuth, so a sign-in that mints
 * a brand-new user means "no account found" and the husk is rolled back.
 * Sign-up allows (or reuses) the account.
 */
export type GoogleAuthMode = 'sign-in' | 'sign-up';

export const NO_GOOGLE_ACCOUNT_MESSAGE =
  'We couldn’t find an account for that Google email. Create a new account first, then sign in.';

/** Shown when "create account" resolves to an email that already has an account. */
export const EXISTING_ACCOUNT_NOTICE =
  'This email is already registered, so we signed you in instead of creating a new account. Your library is exactly as you left it.';

/** Title for the "no account found" prompt on the auth screens. */
export const NO_GOOGLE_ACCOUNT_TITLE = 'No account found';

/**
 * Surfaced (as a dialog) when the account signed in fine but this device's
 * local library could not be prepared, even after a repair retry. The session
 * stays alive — the user is never signed out over a local-database hiccup.
 * (Defined in a dependency-free module so sync code can share it without an
 * import cycle; re-exported here for the auth screens.)
 */
export { LOCAL_LIBRARY_PREP_NOTICE } from '@/lib/localLibraryNotice';

/** A user created within this window is treated as minted by the current OAuth flow. */
export const NEW_OAUTH_USER_WINDOW_MS = 120_000;

const PENDING_GOOGLE_MODE_KEY = 'watch-later.google-auth-mode.v1';

/**
 * How long a stored Google intent stays trustworthy. The router callback
 * normally lands within seconds of the browser session settling; anything
 * older is a leftover from a previous flow and must not decide sign-in vs
 * sign-up for a new one.
 */
export const PENDING_GOOGLE_MODE_TTL_MS = 15 * 60_000;

/**
 * Single slot remembering the auth user THIS device just created.
 *
 * `isNewOAuthUser` (120s) is the only husk signal, so a fast re-sign-in
 * within that window — sign out right after signup, or a restart — would
 * roll back a perfectly legitimate brand-new account. Matching the stored id
 * keeps the husk rollback for accounts minted elsewhere while exempting the
 * one this device verifiably created.
 */
const RECENTLY_CREATED_ACCOUNT_KEY = 'watch-later.recently-created-account.v1';

/** How long a device-created-account mark is honoured (matches the intent TTL). */
export const RECENTLY_CREATED_ACCOUNT_TTL_MS = 15 * 60_000;

/** Remembers a freshly created account on this device (single slot, best effort). */
export async function markAccountCreatedOnDevice(userId: string): Promise<void> {
  try { await AsyncStorage.setItem(RECENTLY_CREATED_ACCOUNT_KEY, JSON.stringify({ userId, at: Date.now() })); } catch { /* best effort */ }
}

/**
 * True when this device created the given account most recently. The mark is
 * time-bounded: a stale slot left behind by an unrelated signup months ago
 * must never exempt a brand-new OAuth husk from rollback.
 */
export async function wasAccountCreatedOnDevice(userId: string): Promise<boolean> {
  try {
    const raw = await AsyncStorage.getItem(RECENTLY_CREATED_ACCOUNT_KEY);
    if (!raw) return false;
    if (raw === userId) return true; // legacy plain-id values from older builds
    const parsed = JSON.parse(raw) as { userId?: unknown; at?: unknown };
    if (parsed?.userId !== userId) return false;
    if (typeof parsed.at !== 'number') return true;
    return Date.now() - parsed.at <= RECENTLY_CREATED_ACCOUNT_TTL_MS;
  } catch { return false; }
}

/**
 * True when the auth user was created within NEW_OAUTH_USER_WINDOW_MS of
 * now — i.e. this OAuth exchange just minted it. Missing/invalid timestamps
 * return false so older mocked clients keep their permissive behaviour.
 */
export function isNewOAuthUser(
  user: { created_at?: string } | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const createdAt = user?.created_at;
  if (!createdAt) return false;
  const createdMs = Date.parse(createdAt);
  if (Number.isNaN(createdMs)) return false;
  return nowMs - createdMs >= 0 && nowMs - createdMs <= NEW_OAUTH_USER_WINDOW_MS;
}

/**
 * True when Supabase handed back an account that already existed: the auth
 * user was minted long before this flow, or the email resolved to an
 * identity that already had a user attached. A genuinely fresh signup
 * (missing timestamps, e.g. older mocked clients) falls through as false.
 */
export function isExistingAccountUser(user: { created_at?: string; identities?: unknown[] } | null | undefined): boolean {
  if (!user) return false;
  if (Array.isArray(user.identities) && user.identities.length === 0) return true;
  const createdAt = user.created_at ? Date.parse(user.created_at) : Number.NaN;
  if (Number.isNaN(createdAt)) return false;
  return Date.now() - createdAt > NEW_OAUTH_USER_WINDOW_MS;
}

interface StoredGoogleMode { mode: GoogleAuthMode; at: number }

async function setPendingGoogleMode(mode: GoogleAuthMode): Promise<void> {
  try { await AsyncStorage.setItem(PENDING_GOOGLE_MODE_KEY, JSON.stringify({ mode, at: Date.now() } satisfies StoredGoogleMode)); } catch { /* best effort */ }
}

async function clearPendingGoogleMode(): Promise<void> {
  try { await AsyncStorage.removeItem(PENDING_GOOGLE_MODE_KEY); } catch { /* best effort */ }
}

/**
 * Reads the intent written by `setPendingGoogleMode`, ignoring stale or
 * malformed values. Legacy plain-string values (no timestamp) are accepted.
 */
async function readFreshPendingGoogleMode(): Promise<GoogleAuthMode | null> {
  let raw: string | null = null;
  try { raw = await AsyncStorage.getItem(PENDING_GOOGLE_MODE_KEY); } catch { return null; }
  if (!raw) return null;
  if (raw === 'sign-in' || raw === 'sign-up') return raw;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredGoogleMode>;
    if (parsed?.mode !== 'sign-in' && parsed?.mode !== 'sign-up') return null;
    if (typeof parsed.at !== 'number') return parsed.mode;
    return Math.abs(Date.now() - parsed.at) <= PENDING_GOOGLE_MODE_TTL_MS ? parsed.mode : null;
  } catch { return null; }
}

/**
 * Fallback when no trustworthy intent survived: if this device deleted an
 * account and never recorded a successful sign-in since, the only safe guess
 * is sign-in — an OAuth flow that mints a brand-new user is then rolled back
 * with "No account found" instead of being silently adopted as an empty
 * account. Without a deletion record the permissive default stays sign-up so
 * a lost intent can never delete a legitimate new account.
 */
async function resolveUnknownGoogleMode(): Promise<GoogleAuthMode> {
  try { return (await getLastDeletedAccount()) ? 'sign-in' : 'sign-up'; } catch { return 'sign-up'; }
}

/**
 * Intent stored by signInWithGoogle for the router-delivered callback
 * (Android). The stored value is consumed exactly once; when it is missing,
 * stale, or unreadable, the mode is resolved from the device's
 * last-deleted-account record instead of blindly defaulting to sign-up.
 */
export async function consumePendingGoogleMode(): Promise<GoogleAuthMode> {
  try {
    const stored = await readFreshPendingGoogleMode();
    await AsyncStorage.removeItem(PENDING_GOOGLE_MODE_KEY).catch(() => undefined);
    return stored ?? await resolveUnknownGoogleMode();
  } catch {
    return 'sign-up';
  }
}

function friendlyAuthError(error: AuthFailure | null, mode: 'sign-in' | 'sign-up'): AppError {
  const code = error?.code ?? '';
  if (code.includes('invalid_credentials') || error?.message?.toLowerCase().includes('invalid login')) return new AppError('authentication', 'Email or password is incorrect.');
  if (code.includes('already_registered') || code.includes('user_already_exists') || error?.message?.toLowerCase().includes('already registered')) return new AppError('authentication', 'This email already has an account. Sign in instead of creating one.');
  if (code.includes('email_not_confirmed') || error?.message?.toLowerCase().includes('email not confirmed') || error?.message?.toLowerCase().includes('confirm your email')) return new AppError('authentication', 'Confirm your email address first — open the link we sent you, then sign in.');
  if (code.includes('weak_password') || error?.message?.toLowerCase().includes('password')) return new AppError('authentication', 'Choose a stronger password and try again.');
  if (error?.message?.toLowerCase().includes('network')) return new AppError('network', 'Could not reach the account service. Check your connection.');
  return new AppError('authentication', mode === 'sign-in' ? 'Unable to sign in. Please try again.' : 'Unable to create your account. Please try again.');
}

const guestMigrationService = new SqliteGuestMigrationService();

function loadOAuthDeps(): OAuthDeps {
  try {
    // Lazy requires keep Jest / bare environments working: importing these
    // modules is side-effect free, but resolving them may fail off-device.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const WebBrowser = require('expo-web-browser') as {
      maybeCompleteAuthSession(): void;
      openAuthSessionAsync(url: string, redirectUri: string): Promise<OAuthRedirectResult>;
    };
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ConstantsModule = require('expo-constants') as {
      default?: { expoConfig?: { hostUri?: string }; executionEnvironment?: string };
      ExecutionEnvironment?: { StoreClient?: string };
    };
    WebBrowser.maybeCompleteAuthSession();
    const constants = ConstantsModule.default ?? {};
    const storeClient = ConstantsModule.ExecutionEnvironment?.StoreClient ?? 'StoreClient';
    const redirectUri = resolveOAuthRedirectUri({
      isExpoGo: constants.executionEnvironment === storeClient,
      hostUri: constants.expoConfig?.hostUri,
    });
    return { redirectUri, browser: WebBrowser };
  } catch {
    throw new AppError('configuration', 'Google sign-in is unavailable in this build.');
  }
}

export interface OAuthRedirectParams {
  code?: string;
  accessToken?: string;
  refreshToken?: string;
  error?: string;
  errorDescription?: string;
}

export interface RedirectUriInput {
  /** True only inside Expo Go, which cannot receive custom-scheme links. */
  isExpoGo: boolean;
  /** Dev-server address (Expo Go only), e.g. `192.168.1.5:8081`. */
  hostUri?: string;
}

const APP_SCHEME = 'watchlater';
const AUTH_CALLBACK_PATH = 'auth/callback';

/**
 * Picks the OAuth redirect target for the current runtime.
 *
 * Dev clients and production builds share one stable URL,
 * `watchlater://auth/callback`: it carries no host or port, so it can never
 * drift out of the Supabase allowlist, it resolves to the app through the
 * manifest scheme filter, and the router matches it exactly (no unmatched
 * flash). Only Expo Go needs the live dev-server session URL, since the Go
 * client cannot receive custom-scheme links.
 */
export function resolveOAuthRedirectUri(input: RedirectUriInput): string {
  if (input.isExpoGo && input.hostUri) {
    const host = input.hostUri.split('?')[0];
    if (host) return `exp://${host}/--/${AUTH_CALLBACK_PATH}`;
  }
  return `${APP_SCHEME}://${AUTH_CALLBACK_PATH}`;
}

/**
 * Reads the OAuth result out of the browser redirect URL. Supabase PKCE
 * returns `?code=…`; the implicit fallback carries tokens in `#…`. Pure and
 * fully testable — no native modules involved.
 */
export function parseOAuthRedirect(url: string): OAuthRedirectParams {
  const params: OAuthRedirectParams = {};
  try {
    const queryIndex = url.indexOf('?');
    const hashIndex = url.indexOf('#');
    const read = (part: string, target: OAuthRedirectParams) => {
      for (const pair of part.split('&')) {
        const [rawKey, rawValue = ''] = pair.split('=');
        // Query + fragment parts are form-encoded: `+` means space.
        const key = decodeURIComponent(rawKey.replace(/\+/g, ' '));
        const value = decodeURIComponent(rawValue.replace(/\+/g, ' '));
        if (key === 'code' && !target.code) target.code = value;
        else if (key === 'access_token' && !target.accessToken) target.accessToken = value;
        else if (key === 'refresh_token' && !target.refreshToken) target.refreshToken = value;
        else if (key === 'error' && !target.error) target.error = value;
        else if (key === 'error_description' && !target.errorDescription) target.errorDescription = value;
      }
    };
    if (queryIndex >= 0) read(url.slice(queryIndex + 1, hashIndex >= 0 ? hashIndex : undefined), params);
    if (hashIndex >= 0) read(url.slice(hashIndex + 1), params);
  } catch {
    // A malformed URL simply yields no params; the caller reports failure.
  }
  return params;
}

/**
 * Set by `completeGoogleCallback` when the deep-link path finished an OAuth
 * flow. On Android `watchlater://auth/callback` is consumed by the router
 * before the pending browser session sees it, so `openAuthSessionAsync` comes
 * back with a cancel while the sign-in actually succeeded — without this flag
 * the user is shown "couldn't sign in" on top of a working session.
 */
let oauthFinishedByRouter = false;
/**
 * Carries a "no account found" rejection from the router callback to the
 * pending `signInWithGoogle` browser session, so the sign-in screen reports
 * the real reason instead of "was cancelled".
 */
let oauthNoAccountFailure: AppError | null = null;
/**
 * Same handoff for a device-binding refusal: the callback screen goes back
 * silently and the pending sign-in screen owns the single "Clear & continue"
 * dialog, finishing the SAME session without a second browser roundtrip.
 */
let oauthDeviceLinkFailure: DeviceLinkedError | null = null;

/**
 * Number of interactive auth flows currently running (sign in, create account,
 * Google browser flow, router callback). The `_layout` auth listener also
 * binds the local library on SIGNED_IN and can fail with the SAME
 * "Couldn't prepare this account's local library." error — while a flow is in
 * flight the flow's own screen owns the single prompt, so the listener stays
 * quiet instead of stacking a second dialog.
 */
let authFlowsInFlight = 0;

/** True while an interactive auth flow is running on some screen. */
export function isAuthFlowInFlight(): boolean {
  return authFlowsInFlight > 0;
}

export class SupabaseAuthService implements AuthService {
  constructor(
    private readonly authClient: AuthClient | null = supabase,
    private readonly migration: GuestMigrationService = guestMigrationService,
    private readonly oauth: OAuthDeps | null = null,
    private readonly repairLocalLibrary: () => Promise<void> = async () => {
      await clearDeviceLibrary();
      // The wipe leaves an EMPTY local library for the new account. React
      // Query's cached ['watch'] lists would otherwise keep showing the
      // previous account's titles until some unrelated invalidation — a
      // cross-account leak that sync never fixes when the new account's cloud
      // is also empty (nothing to apply, nothing to invalidate).
      queryClient.clear();
    },
    private readonly hasPendingLocalChanges: () => Promise<boolean> = async () => {
      try { return (await watchStateSyncRepository.getPendingChanges()).length > 0; } catch { return true; }
    },
  ) {}

  private requireClient(): AuthClient {
    if (!this.authClient) throw new AppError('configuration', 'Configure Supabase to use account features.');
    return this.authClient;
  }

  /**
   * Binds the device library to the account. A stale binding is repaired
   * silently (no dialog) when it is safe to do so: the account was just
   * created, a previous account deletion on this device is still outstanding,
   * or the account that owned this device has no unsynced changes left (so
   * clearing the local mirror loses nothing). Only when unsynced local data
   * would be destroyed does it rethrow as a DeviceLinkedError WITHOUT signing
   * out, so the UI can warn and clear-and-continue the same session.
   *
   * A bind that fails for any OTHER reason (lock contention, a half-written
   * schema, a slow first open) is retried once with a repaired local library
   * and then downgraded to a notice: the Supabase session is valid, so the
   * user stays signed in and can retry sync, instead of being signed out
   * behind a raw "Couldn't prepare this account's local library." dead end.
   */
  private async connectAccountAllowingFreshRebind(accountId: string, isFresh: boolean, accountEmail?: string): Promise<{ notice?: string }> {
    try {
      await this.migration.migrateToAccount(accountId);
      return {};
    } catch (error) {
      if (!isDeviceLinkedError(error)) {
        // First retry without touching the library: a transient failure (e.g.
        // SQLite lock contention right after launch) clears on its own.
        try {
          await this.migration.migrateToAccount(accountId);
          return {};
        } catch { /* still failing — try a repaired local library below */ }
        try {
          await this.repairLocalLibrary();
          await this.migration.migrateToAccount(accountId);
          return {};
        } catch {
          // The session stays signed in; the UI surfaces this notice as a
          // dialog so the user knows exactly what happened and that their
          // cloud library is safe.
          return { notice: LOCAL_LIBRARY_PREP_NOTICE };
        }
      }
      const linked = error instanceof DeviceLinkedError
        ? error
        : new DeviceLinkedError(accountId, accountEmail);
      // Deletion leftovers repair themselves: no dialog, no second browser
      // trip. Fresh accounts qualify on their own; any account qualifies
      // while a deletion flag from this device is still outstanding.
      const deletedFlag = await getLastDeletedAccount().catch(() => null);
      if (isFresh || deletedFlag) {
        try {
          await this.repairLocalLibrary();
          await this.migration.migrateToAccount(accountId);
          return {};
        } catch {
          // Fall through to the dialog path with the session still alive.
        }
      }
      // Switching to a different account. If the account that previously owned
      // this device has nothing unsynced (its data already lives in its own
      // cloud), clearing the local mirror loses nothing — so rebind silently
      // instead of blocking sign-in behind a scary dialog. Only warn when there
      // are genuinely unsynced local changes that clearing would destroy.
      let hasPending = true;
      try { hasPending = await this.hasPendingLocalChanges(); } catch { hasPending = true; }
      if (!hasPending) {
        try {
          await this.repairLocalLibrary();
          await this.migration.migrateToAccount(accountId);
          return {};
        } catch {
          // Fall through to the dialog path with the session still alive.
        }
      }
      throw linked;
    }
  }

  /**
   * Completes a DeviceLinkedError after the user confirmed "Clear &
   * continue": wipes the stale device library and binds the already-signed-in
   * account. No browser roundtrip — the Supabase session was kept alive.
   */
  async resolveDeviceLinkAndBind(pending: DeviceLinkedError): Promise<SessionState> {
    await this.repairLocalLibrary();
    await this.migration.migrateToAccount(pending.accountId);
    const email = pending.accountEmail
      ?? (await this.requireClient().auth.getUser?.().catch(() => null))?.data.user?.email
      ?? '';
    await clearLastDeletedAccount();
    return { mode: 'authenticated', userId: pending.accountId, email };
  }

  /** Signs out a session kept alive for a device-link dialog the user declined. */
  async dismissDeviceLinkRepair(): Promise<void> {
    await this.requireClient().auth.signOut().catch(() => undefined);
  }

  private async markAuthSuccess(): Promise<void> {
    await clearLastDeletedAccount();
  }

  async continueAsGuest(): Promise<SessionState> {
    return { mode: 'guest', userId: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
  }

  async signIn(email: string, password: string): Promise<SessionState> {
    authFlowsInFlight += 1;
    try {
      const { data, error } = await this.requireClient().auth.signInWithPassword({ email, password });
      if (error || !data.user || !data.session) throw friendlyAuthError(error, 'sign-in');
      const { notice } = await this.connectAccountAllowingFreshRebind(data.user.id, false, data.user.email ?? email);
      await this.markAuthSuccess();
      return { mode: 'authenticated', userId: data.user.id, email: data.user.email ?? email, ...(notice ? { notice } : {}) };
    } finally { authFlowsInFlight -= 1; }
  }

  async createAccount(email: string, password: string): Promise<SessionState> {
    authFlowsInFlight += 1;
    try {
      return await this.createAccountInner(email, password);
    } finally { authFlowsInFlight -= 1; }
  }

  private async createAccountInner(email: string, password: string): Promise<SessionState> {
    const client = this.requireClient();
    // If these exact credentials already sign in, the account exists — this is
    // a sign-in, not a signup. Probe first so an existing email is never dressed
    // up as "creating an account"; the UI then reports it as a sign-in.
    const probe = await client.auth.signInWithPassword({ email, password });
    if (!probe.error && probe.data?.user && probe.data?.session) {
      const { notice } = await this.connectAccountAllowingFreshRebind(probe.data.user.id, false, probe.data.user.email ?? email);
      await this.markAuthSuccess();
      return {
        mode: 'authenticated',
        userId: probe.data.user.id,
        email: probe.data.user.email ?? email,
        notice: [EXISTING_ACCOUNT_NOTICE, notice].filter(Boolean).join(' '),
      };
    }

    const { data, error } = await client.auth.signUp({ email, password });
    if (error || !data.user) throw friendlyAuthError(error, 'sign-up');
    const existing = isExistingAccountUser(data.user);
    // A genuinely new account is remembered on this device so a fast Google
    // re-sign-in inside the husk window never rolls it back as an orphan.
    if (!existing) await markAccountCreatedOnDevice(data.user.id);
    if (!data.session) throw new AppError('authentication', 'Check your email to confirm your account, then sign in. Your local library is unchanged.');
    // Some GoTrue configs still hand back a live session for an email that
    // ALREADY has an account (different password, auto sign-in). Treat that as
    // a sign-in too — never as a fresh signup — and don't re-migrate the local
    // library onto it as if it were brand new.
    const { notice } = await this.connectAccountAllowingFreshRebind(data.user.id, !existing, data.user.email ?? email);
    await this.markAuthSuccess();
    const combined = [existing ? EXISTING_ACCOUNT_NOTICE : '', notice].filter(Boolean).join(' ');
    return {
      mode: 'authenticated',
      userId: data.user.id,
      email: data.user.email ?? email,
      ...(combined ? { notice: combined } : {}),
    };
  }

  /**
   * Id of the session currently stored on this device, or null when signed
   * out. Used to tell a pre-existing session apart from the one an OAuth flow
   * just produced.
   */
  private async storedUserId(): Promise<string | null> {
    const session = (await this.requireClient().auth.getSession?.())?.data.session ?? null;
    return session?.user.id ?? null;
  }

  /**
   * True when the stored session still belongs to a live account. A session
   * left behind by a deleted account is perfectly valid locally but must never
   * be adopted as the result of a sign-in.
   */
  private async isLiveSession(): Promise<boolean> {
    const client = this.requireClient();
    if (!client.auth.getUser) return true;
    try {
      const { data, error } = await client.auth.getUser();
      if (error || !data.user) return false;
      return true;
    } catch {
      // Offline: the session cannot be disproven, so it stays usable.
      return true;
    }
  }

  /**
   * Google sign-in via the system browser (PKCE code exchange). Works in
   * Expo Go, dev builds, and standalone apps — the browser redirect is
   * intercepted, so no `auth/callback` route is needed. Requires the Google
   * provider + redirect URLs configured in the Supabase dashboard.
   *
   * `mode` separates sign-in from sign-up: Supabase mints a fresh auth user
   * on first OAuth, so a sign-in that mints one means no account exists — the
   * husk is rolled back and "No account found" is thrown instead of silently
   * signing into an empty account (e.g. right after account deletion).
   */
  async signInWithGoogle(mode: GoogleAuthMode = 'sign-in'): Promise<SessionState> {
    authFlowsInFlight += 1;
    try {
      return await this.signInWithGoogleInner(mode);
    } finally { authFlowsInFlight -= 1; }
  }

  private async signInWithGoogleInner(mode: GoogleAuthMode): Promise<SessionState> {
    const client = this.requireClient();
    const deps = this.oauth ?? loadOAuthDeps();
    if (!client.auth.signInWithOAuth) throw new AppError('configuration', 'Google sign-in is unavailable in this build.');
    oauthFinishedByRouter = false;
    oauthNoAccountFailure = null;
    oauthDeviceLinkFailure = null;
    await setPendingGoogleMode(mode);
    try {
      const sessionBefore = await this.storedUserId();
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        // `prompt: select_account` forces the Google chooser every time.
        // Without it the system browser reuses its Google cookies and silently
        // signs in with the last-used Google profile.
        options: { redirectTo: deps.redirectUri, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
      });
      if (error || !data?.url) throw friendlyAuthError(error, mode);
      const result = await deps.browser.openAuthSessionAsync(data.url, deps.redirectUri).catch(() => ({ type: 'dismiss' }) as OAuthRedirectResult);
      // The router callback may have rejected a sign-in that minted a new
      // account, or hit a stale device binding. Surface that reason instead
      // of "was cancelled".
      if (oauthNoAccountFailure) throw oauthNoAccountFailure;
      if (oauthDeviceLinkFailure) throw oauthDeviceLinkFailure;
      // On Android the router wins the redirect, so `auth/callback` may already
      // have exchanged this code. Trusting it here avoids exchanging it twice.
      const finishedByRouter = oauthFinishedByRouter;
      oauthFinishedByRouter = false;
      if (result.type === 'success' && result.url && !finishedByRouter) {
        const params = parseOAuthRedirect(result.url);
        // This call consumed the redirect itself, so the stored intent is no
        // longer needed. (It is deliberately NOT cleared in a `finally`: on
        // Android the browser session settles as "dismiss" while the router
        // callback is still pending, and clearing here is exactly what lost
        // the sign-in intent — see consumePendingGoogleMode.)
        if (params.error) {
          await clearPendingGoogleMode();
          throw new AppError('authentication', params.errorDescription ?? 'Google sign-in was declined. Please try again.');
        }
        if (params.code) return this.exchangeGoogleCode(params.code, mode).finally(clearPendingGoogleMode);
        if (params.accessToken && params.refreshToken) return this.setGoogleSession(params.accessToken, params.refreshToken, mode).finally(clearPendingGoogleMode);
        await clearPendingGoogleMode();
        throw new AppError('authentication', 'Google sign-in did not return a session. Please try again.');
      }
      // The browser session came back empty-handed but the flow may still have
      // completed elsewhere (or produced a brand-new session). Reporting that as
      // a failure is what put "couldn't sign in" on top of a working sign-in.
      const sessionAfter = await this.storedUserId();
      if ((finishedByRouter || sessionAfter !== sessionBefore) && (await this.isLiveSession())) return this.authenticatedSession(mode);
      if (oauthNoAccountFailure) throw oauthNoAccountFailure;
      if (oauthDeviceLinkFailure) throw oauthDeviceLinkFailure;
      // "cancel"/"dismiss" here may still be the Android race: the redirect
      // went to the router, whose callback is pending and will consume the
      // stored intent — so it must survive this throw.
      if (result.type === 'cancel' || result.type === 'dismiss') throw new AppError('authentication', 'Google sign-in was cancelled.');
      throw new AppError('authentication', 'Google sign-in did not complete. Please try again.');
    } catch (cause) {
      // Deliberately NOT a `finally`: on Android the browser session settles
      // as "dismiss" while the router callback is still pending, and clearing
      // the stored intent there is exactly what lost sign-in vs sign-up for
      // that callback (see consumePendingGoogleMode). A failure raised before
      // or without a delivered redirect means no callback is coming, so the
      // intent is dropped; the cancel/dismiss rejection keeps it.
      const cancelled = cause instanceof AppError && cause.message === 'Google sign-in was cancelled.';
      if (!cancelled) await clearPendingGoogleMode();
      throw cause;
    }
  }

  /**
   * Finishes a Google sign-in whose redirect was delivered to Expo Router
   * rather than to `openAuthSessionAsync`.
   *
   * On Android the `watchlater://auth/callback` intent resolves to the
   * `auth/callback` route before the pending browser session ever sees it, so
   * that screen calls this with the params from the landing URL. When the
   * caller omits `mode`, the intent stored by `signInWithGoogle` is used.
   */
  async completeGoogleCallback(
    params: { code?: string; accessToken?: string; refreshToken?: string; error?: string; errorDescription?: string },
    mode?: GoogleAuthMode,
  ): Promise<SessionState> {
    authFlowsInFlight += 1;
    try {
      const resolvedMode = mode ?? await consumePendingGoogleMode();
      try {
        const session = await this.resolveGoogleCallback(params, resolvedMode);
        // Only a completed flow unblocks the pending browser session.
        oauthFinishedByRouter = true;
        return session;
      } catch (cause) {
        if (cause instanceof AppError && cause.message === NO_GOOGLE_ACCOUNT_MESSAGE) {
          // Unblock the pending browser session and hand it the real reason.
          oauthFinishedByRouter = true;
          oauthNoAccountFailure = cause;
        } else if (cause instanceof DeviceLinkedError) {
          // The sign-in screen owns the single "Clear & continue" dialog and
          // finishes the same session — no toast, no second browser trip.
          oauthFinishedByRouter = true;
          oauthDeviceLinkFailure = cause;
        }
        throw cause;
      }
    } finally { authFlowsInFlight -= 1; }
  }

  private async resolveGoogleCallback(
    params: { code?: string; accessToken?: string; refreshToken?: string; error?: string; errorDescription?: string },
    mode: GoogleAuthMode,
  ): Promise<SessionState> {
    if (params.error) throw new AppError('authentication', params.errorDescription ?? 'Google sign-in was declined. Please try again.');
    if (params.code) {
      // Always exchange the delivered code. Short-circuiting to whatever
      // session is already stored is what signed users back in with the
      // account they had just deleted. The stored session is only a fallback
      // for the Expo Go case, where the browser session consumed the code
      // first and a second exchange would fail on an already-used code.
      try {
        return await this.exchangeGoogleCode(params.code, mode);
      } catch (cause) {
        if (cause instanceof AppError && cause.message === NO_GOOGLE_ACCOUNT_MESSAGE) throw cause;
        if (cause instanceof DeviceLinkedError) throw cause;
        if (await this.isLiveSession()) return this.authenticatedSession(mode);
        throw cause;
      }
    }
    if (params.accessToken && params.refreshToken) return this.setGoogleSession(params.accessToken, params.refreshToken, mode);
    if (await this.isLiveSession()) return this.authenticatedSession(mode);
    throw new AppError('authentication', 'Google sign-in did not return a session. Please try again.');
  }

  private async exchangeGoogleCode(code: string, mode: GoogleAuthMode = 'sign-up'): Promise<SessionState> {
    const client = this.requireClient();
    if (!client.auth.exchangeCodeForSession) throw new AppError('authentication', 'Google sign-in did not return a session. Please try again.');
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw friendlyAuthError(error, mode);
    return this.authenticatedSession(mode);
  }

  private async setGoogleSession(accessToken: string, refreshToken: string, mode: GoogleAuthMode = 'sign-up'): Promise<SessionState> {
    const client = this.requireClient();
    if (!client.auth.setSession) throw new AppError('authentication', 'Google sign-in did not return a session. Please try again.');
    const { error } = await client.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw friendlyAuthError(error, mode);
    return this.authenticatedSession(mode);
  }

  private async authenticatedSession(mode: GoogleAuthMode = 'sign-up'): Promise<SessionState> {
    const client = this.requireClient();
    const user = (await client.auth.getUser?.())?.data.user;
    if (!user) {
      // No live account on this device. For a sign-in that is exactly the
      // "no account found" case (e.g. right after the account was deleted):
      // clear any leftover session and report it as such instead of a generic
      // "did not return an account, try again" dead end.
      if (mode === 'sign-in') {
        await this.rollbackAutoCreatedUser();
        throw new AppError('authentication', NO_GOOGLE_ACCOUNT_MESSAGE);
      }
      throw new AppError('authentication', 'Google sign-in did not return an account. Please try again.');
    }
    // Sign-in must never adopt an account this flow just created (e.g. the
    // same Google email right after account deletion). Check before the local
    // library is bound so nothing is migrated onto the husk — unless this
    // device created it moments ago, where a fast re-sign-in (sign-out right
    // after signup, restart) would otherwise delete the real new account.
    if (mode === 'sign-in' && isNewOAuthUser(user) && !(await wasAccountCreatedOnDevice(user.id))) {
      await this.rollbackAutoCreatedUser();
      throw new AppError('authentication', NO_GOOGLE_ACCOUNT_MESSAGE);
    }
    const freshSignup = mode === 'sign-up' && isNewOAuthUser(user);
    if (freshSignup) await markAccountCreatedOnDevice(user.id);
    const { notice } = await this.connectAccountAllowingFreshRebind(user.id, freshSignup, user.email);
    await this.markAuthSuccess();
    const combined = [
      // "Create account" that resolved to an account which already existed
      // says so out loud — same contract as the email signup path, so a
      // Google signup never silently reads as a brand-new account.
      mode === 'sign-up' && isExistingAccountUser(user) ? EXISTING_ACCOUNT_NOTICE : '',
      notice,
    ].filter(Boolean).join(' ');
    return {
      mode: 'authenticated',
      userId: user.id,
      email: user.email ?? '',
      ...(combined ? { notice: combined } : {}),
    };
  }

  /**
   * Completes a Clerk Google SSO sign-in: binds the device library to the
   * Clerk identity and returns the app session. Supabase data access for this
   * identity flows through third-party auth (see `ClerkSupabaseBridge`), so
   * no Supabase Auth session is created here.
   *
   * Sign-in keeps the no-husk contract: a brand-new Clerk user while a
   * deletion is outstanding on this device is signed straight back out and
   * reported as "no account found" instead of adopted as an empty account.
   * The caller owns the Clerk session lifecycle (`clerkSignOut`); this method
   * never touches Clerk directly, which keeps it unit-testable.
   */
  async signInWithClerk(input: {
    userId: string;
    email: string;
    /** Epoch ms of the Clerk user's creation, or null when unknown. */
    createdAtMs: number | null;
    googleMode: GoogleAuthMode;
    clerkSignOut: () => Promise<void>;
  }): Promise<SessionState> {
    authFlowsInFlight += 1;
    try {
      const { userId, email, createdAtMs, googleMode, clerkSignOut } = input;
      const fresh = createdAtMs !== null && Date.now() - createdAtMs >= 0 && Date.now() - createdAtMs <= NEW_OAUTH_USER_WINDOW_MS;
      if (googleMode === 'sign-in' && fresh && !(await wasAccountCreatedOnDevice(userId))) {
        await clerkSignOut().catch(() => undefined);
        throw new AppError('authentication', NO_GOOGLE_ACCOUNT_MESSAGE);
      }
      const freshSignup = googleMode === 'sign-up' && fresh;
      if (freshSignup) await markAccountCreatedOnDevice(userId);
      const { notice } = await this.connectAccountAllowingFreshRebind(userId, freshSignup, email);
      await this.markAuthSuccess();
      const existingAccount = googleMode === 'sign-up' && createdAtMs !== null && !fresh;
      const combined = [existingAccount ? EXISTING_ACCOUNT_NOTICE : '', notice].filter(Boolean).join(' ');
      return {
        mode: 'authenticated',
        userId,
        email,
        provider: 'clerk',
        ...(combined ? { notice: combined } : {}),
      };
    } finally { authFlowsInFlight -= 1; }
  }

  /**
   * Best-effort rollback of an auto-created OAuth husk: deletes the fresh
   * auth user via the `delete-account` edge function (which cascades its
   * empty rows), then clears the local session so nothing lingers. Never
   * throws — the caller always reports "No account found".
   */
  private async rollbackAutoCreatedUser(): Promise<void> {
    const client = this.requireClient();
    try { await client.functions?.invoke('delete-account', {}); } catch { /* husk may linger; sign-out still clears the device */ }
    try { await client.auth.signOut(); } catch { /* ignored */ }
    try { await client.auth.signOut({ scope: 'local' }); } catch { /* ignored */ }
  }

  async signOut(): Promise<void> {
    const client = this.requireClient();
    let failure: unknown = null;
    try {
      const { error } = await client.auth.signOut();
      failure = error;
    } catch (cause) {
      failure = cause;
    }
    if (!failure) return;
    // supabase-js drops the LOCAL session even when the server-side revoke
    // fails (offline, expired JWT): `removeCurrentSession()` runs first and
    // only then is the error returned. If no session survives on the device
    // the user really is signed out — throwing "Unable to log out." over a
    // completed sign-out shows a failure dialog for something that worked.
    if (client.auth.getSession) {
      try {
        const { data } = await client.auth.getSession();
        if (!data.session) return;
      } catch {
        // Session state unreadable — report the original failure below.
      }
    }
    throw new AppError('authentication', 'Unable to log out.', { cause: failure instanceof Error ? failure : undefined });
  }
}
