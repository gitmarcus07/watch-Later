import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppError } from '@/domain/errors/AppError';
import type { SessionState } from '@/domain/models/session';
import { supabase } from '@/data/remote/supabase/client';
import { clearDeviceLibrary } from '@/data/local/database/database';
import { clearLastDeletedAccount, getLastDeletedAccount } from './deleteAccount';
import { SqliteGuestMigrationService } from '@/data/local/repositories/SqliteGuestMigrationService';
import type { GuestMigrationService } from '@/data/local/repositories/GuestMigrationService';
import type { AuthService } from './sessionService';

interface AuthUser { id: string; email?: string; created_at?: string }
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
  'No account found with this Google email. Create a new account first, then sign in.';

/** A user created within this window is treated as minted by the current OAuth flow. */
export const NEW_OAUTH_USER_WINDOW_MS = 120_000;

const PENDING_GOOGLE_MODE_KEY = 'watch-later.google-auth-mode.v1';

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

async function setPendingGoogleMode(mode: GoogleAuthMode): Promise<void> {
  try { await AsyncStorage.setItem(PENDING_GOOGLE_MODE_KEY, mode); } catch { /* best effort */ }
}

async function clearPendingGoogleMode(): Promise<void> {
  try { await AsyncStorage.removeItem(PENDING_GOOGLE_MODE_KEY); } catch { /* best effort */ }
}

/**
 * Intent stored by signInWithGoogle for the router-delivered callback
 * (Android). Defaults to sign-up (permissive) so a lost intent can never
 * delete a legitimate new account.
 */
export async function consumePendingGoogleMode(): Promise<GoogleAuthMode> {
  try {
    const stored = await AsyncStorage.getItem(PENDING_GOOGLE_MODE_KEY);
    await AsyncStorage.removeItem(PENDING_GOOGLE_MODE_KEY).catch(() => undefined);
    return stored === 'sign-in' ? 'sign-in' : 'sign-up';
  } catch {
    return 'sign-up';
  }
}

function friendlyAuthError(error: AuthFailure | null, mode: 'sign-in' | 'sign-up'): AppError {
  const code = error?.code ?? '';
  if (code.includes('invalid_credentials') || error?.message?.toLowerCase().includes('invalid login')) return new AppError('authentication', 'Email or password is incorrect.');
  if (code.includes('already_registered') || error?.message?.toLowerCase().includes('already registered')) return new AppError('authentication', 'An account with this email already exists. Try signing in.');
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

export class SupabaseAuthService implements AuthService {
  constructor(
    private readonly authClient: AuthClient | null = supabase,
    private readonly migration: GuestMigrationService = guestMigrationService,
    private readonly oauth: OAuthDeps | null = null,
    private readonly repairLocalLibrary: () => Promise<void> = () => clearDeviceLibrary(),
  ) {}

  private requireClient(): AuthClient {
    if (!this.authClient) throw new AppError('configuration', 'Configure Supabase to use account features.');
    return this.authClient;
  }

  /**
   * Binds the device library to the account. A stale binding is repaired
   * silently (no dialog) when it can only be deletion leftovers: the account
   * was just created, or a previous account deletion on this device hasn't
   * been followed by a successful sign-in yet. Anything else rethrows as a
   * DeviceLinkedError WITHOUT signing out, so the UI can clear-and-continue
   * the same session instead of sending the user through OAuth again.
   */
  private async connectAccountAllowingFreshRebind(accountId: string, isFresh: boolean, accountEmail?: string): Promise<void> {
    try {
      await this.migration.migrateToAccount(accountId);
      return;
    } catch (error) {
      if (!isDeviceLinkedError(error)) {
        await this.requireClient().auth.signOut().catch(() => undefined);
        throw error;
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
          return;
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
    const { data, error } = await this.requireClient().auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) throw friendlyAuthError(error, 'sign-in');
    await this.connectAccountAllowingFreshRebind(data.user.id, false, data.user.email ?? email);
    await this.markAuthSuccess();
    return { mode: 'authenticated', userId: data.user.id, email: data.user.email ?? email };
  }

  async createAccount(email: string, password: string): Promise<SessionState> {
    const { data, error } = await this.requireClient().auth.signUp({ email, password });
    if (error || !data.user) throw friendlyAuthError(error, 'sign-up');
    if (!data.session) throw new AppError('authentication', 'Check your email to confirm your account, then sign in. Your local library is unchanged.');
    // Email sign-up only reaches here for a brand-new user.
    await this.connectAccountAllowingFreshRebind(data.user.id, true, data.user.email ?? email);
    await this.markAuthSuccess();
    return { mode: 'authenticated', userId: data.user.id, email: data.user.email ?? email };
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
        if (params.error) throw new AppError('authentication', params.errorDescription ?? 'Google sign-in was declined. Please try again.');
        if (params.code) return this.exchangeGoogleCode(params.code, mode);
        if (params.accessToken && params.refreshToken) return this.setGoogleSession(params.accessToken, params.refreshToken, mode);
        throw new AppError('authentication', 'Google sign-in did not return a session. Please try again.');
      }
      // The browser session came back empty-handed but the flow may still have
      // completed elsewhere (or produced a brand-new session). Reporting that as
      // a failure is what put "couldn't sign in" on top of a working sign-in.
      const sessionAfter = await this.storedUserId();
      if ((finishedByRouter || sessionAfter !== sessionBefore) && (await this.isLiveSession())) return this.authenticatedSession(mode);
      if (oauthNoAccountFailure) throw oauthNoAccountFailure;
      if (oauthDeviceLinkFailure) throw oauthDeviceLinkFailure;
      if (result.type === 'cancel' || result.type === 'dismiss') throw new AppError('authentication', 'Google sign-in was cancelled.');
      throw new AppError('authentication', 'Google sign-in did not complete. Please try again.');
    } finally {
      await clearPendingGoogleMode();
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
    if (!user) throw new AppError('authentication', 'Google sign-in did not return an account. Please try again.');
    // Sign-in must never adopt an account this flow just created (e.g. the
    // same Google email right after account deletion). Check before the local
    // library is bound so nothing is migrated onto the husk.
    if (mode === 'sign-in' && isNewOAuthUser(user)) {
      await this.rollbackAutoCreatedUser();
      throw new AppError('authentication', NO_GOOGLE_ACCOUNT_MESSAGE);
    }
    await this.connectAccountAllowingFreshRebind(user.id, mode === 'sign-up' && isNewOAuthUser(user), user.email);
    await this.markAuthSuccess();
    return { mode: 'authenticated', userId: user.id, email: user.email ?? '' };
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
    const { error } = await client.auth.signOut();
    if (error) throw new AppError('authentication', 'Unable to log out.', { cause: error });
  }
}
