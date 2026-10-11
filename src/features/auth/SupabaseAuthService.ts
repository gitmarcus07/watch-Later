import { AppError } from '@/domain/errors/AppError';
import type { SessionState } from '@/domain/models/session';
import { supabase } from '@/data/remote/supabase/client';
import { SqliteGuestMigrationService } from '@/data/local/repositories/SqliteGuestMigrationService';
import type { GuestMigrationService } from '@/data/local/repositories/GuestMigrationService';
import type { AuthService } from './sessionService';

interface AuthUser { id: string; email?: string }
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
    signInWithOAuth?(input: { provider: string; options?: { redirectTo?: string; skipBrowserRedirect?: boolean } }): Promise<{ data: { url: string | null }; error: AuthFailure | null }>;
    exchangeCodeForSession?(code: string): Promise<{ error: AuthFailure | null }>;
    setSession?(input: { access_token: string; refresh_token: string }): Promise<{ error: AuthFailure | null }>;
    getUser?(): Promise<{ data: { user: AuthUser | null }; error: AuthFailure | null }>;
    signOut(): Promise<{ error: AuthFailure | null }>;
  };
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

export class SupabaseAuthService implements AuthService {
  constructor(
    private readonly authClient: AuthClient | null = supabase,
    private readonly migration: GuestMigrationService = guestMigrationService,
    private readonly oauth: OAuthDeps | null = null,
  ) {}

  private requireClient(): AuthClient {
    if (!this.authClient) throw new AppError('configuration', 'Configure Supabase to use account features.');
    return this.authClient;
  }

  private async connectAccount(accountId: string): Promise<void> {
    try { await this.migration.migrateToAccount(accountId); }
    catch (error) { await this.requireClient().auth.signOut(); throw error; }
  }

  async continueAsGuest(): Promise<SessionState> {
    return { mode: 'guest', userId: `guest-${Date.now()}-${Math.random().toString(36).slice(2, 10)}` };
  }

  async signIn(email: string, password: string): Promise<SessionState> {
    const { data, error } = await this.requireClient().auth.signInWithPassword({ email, password });
    if (error || !data.user || !data.session) throw friendlyAuthError(error, 'sign-in');
    await this.connectAccount(data.user.id);
    return { mode: 'authenticated', userId: data.user.id, email: data.user.email ?? email };
  }

  async createAccount(email: string, password: string): Promise<SessionState> {
    const { data, error } = await this.requireClient().auth.signUp({ email, password });
    if (error || !data.user) throw friendlyAuthError(error, 'sign-up');
    if (!data.session) throw new AppError('authentication', 'Check your email to confirm your account, then sign in. Your local library is unchanged.');
    await this.connectAccount(data.user.id);
    return { mode: 'authenticated', userId: data.user.id, email: data.user.email ?? email };
  }

  /**
   * Google sign-in via the system browser (PKCE code exchange). Works in
   * Expo Go, dev builds, and standalone apps — the browser redirect is
   * intercepted, so no `auth/callback` route is needed. Requires the Google
   * provider + redirect URLs configured in the Supabase dashboard.
   */
  async signInWithGoogle(): Promise<SessionState> {
    const client = this.requireClient();
    const deps = this.oauth ?? loadOAuthDeps();
    if (!client.auth.signInWithOAuth) throw new AppError('configuration', 'Google sign-in is unavailable in this build.');
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: deps.redirectUri, skipBrowserRedirect: true },
    });
    if (error || !data?.url) throw friendlyAuthError(error, 'sign-in');
    const result = await deps.browser.openAuthSessionAsync(data.url, deps.redirectUri).catch(() => ({ type: 'dismiss' }) as OAuthRedirectResult);
    if (result.type === 'cancel' || result.type === 'dismiss') throw new AppError('authentication', 'Google sign-in was cancelled.');
    if (result.type !== 'success' || !result.url) throw new AppError('authentication', 'Google sign-in did not complete. Please try again.');
    const params = parseOAuthRedirect(result.url);
    if (params.error) throw new AppError('authentication', params.errorDescription ?? 'Google sign-in was declined. Please try again.');
    if (params.code && client.auth.exchangeCodeForSession) {
      const { error: exchangeError } = await client.auth.exchangeCodeForSession(params.code);
      if (exchangeError) throw friendlyAuthError(exchangeError, 'sign-in');
    } else if (params.accessToken && params.refreshToken && client.auth.setSession) {
      const { error: sessionError } = await client.auth.setSession({ access_token: params.accessToken, refresh_token: params.refreshToken });
      if (sessionError) throw friendlyAuthError(sessionError, 'sign-in');
    } else {
      throw new AppError('authentication', 'Google sign-in did not return a session. Please try again.');
    }
    const userResult = await client.auth.getUser?.();
    const user = userResult?.data.user;
    if (!user) throw new AppError('authentication', 'Google sign-in did not return an account. Please try again.');
    await this.connectAccount(user.id);
    return { mode: 'authenticated', userId: user.id, email: user.email ?? '' };
  }

  async signOut(): Promise<void> {
    const client = this.requireClient();
    const { error } = await client.auth.signOut();
    if (error) throw new AppError('authentication', 'Unable to log out.', { cause: error });
  }
}
