import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppError } from '@/domain/errors/AppError';
import { getClerkToken, supabase, supabaseAuthStoragePrefix } from '@/data/remote/supabase/client';
import { clearDeviceLibrary, getDatabase } from '@/data/local/database/database';
import { Notifications } from '@/lib/notifications';
import { queryClient } from '@/lib/query/queryClient';
import { logger } from '@/lib/logger';
import { isNetworkAuthError } from '@/lib/netError';

/**
 * Delete-account (GitHub-style): the user types their account email to
 * confirm, then the account itself is removed from Supabase (which cascades
 * every row they own), the local database is wiped, scheduled reminders are
 * cancelled, and they are signed out. The account removal runs first — if it
 * fails, nothing is touched anywhere and the error is surfaced, so data and
 * sign-in are always deleted together or not at all.
 */

const USER_TABLES = [
  'episode_watches',
  'movie_watches',
  'tracked_series',
  'watchlist_entries',
  'favorite_entries',
  'user_ratings',
  'interested_marks',
  'library_media',
  'profiles',
] as const;

/** GitHub-style confirmation: the typed phrase must equal the account email. */
export function isDeleteConfirmed(input: string, email: string): boolean {
  return input.trim().toLowerCase() === email.trim().toLowerCase() && email.trim().length > 0;
}

/**
 * Id of the last account deleted on this device. Set whenever the server-side
 * deletion succeeds (even if the local wipe that follows hiccups), cleared on
 * the next successful authentication. Lets the next sign-up recognise a stale
 * device binding as leftovers of the deleted account and repair it silently
 * instead of trapping the user behind "linked to another account".
 */
const LAST_DELETED_ACCOUNT_KEY = 'watch-later.last-deleted-account.v1';

export async function markAccountDeleted(userId: string): Promise<void> {
  try { await AsyncStorage.setItem(LAST_DELETED_ACCOUNT_KEY, userId); } catch { /* best effort */ }
}

export async function getLastDeletedAccount(): Promise<string | null> {
  try { return await AsyncStorage.getItem(LAST_DELETED_ACCOUNT_KEY); } catch { return null; }
}

export async function clearLastDeletedAccount(): Promise<void> {
  try { await AsyncStorage.removeItem(LAST_DELETED_ACCOUNT_KEY); } catch { /* best effort */ }
}

export interface DeleteAccountDeps {
  deleteRemoteUserData(userId: string): Promise<void>;
  deleteAuthUser(): Promise<boolean>;
  resetLocalData(): Promise<void>;
  cancelLocalNotifications(): Promise<void>;
  clearCaches(): Promise<void>;
  signOut(): Promise<void>;
}

async function deleteRemoteUserData(userId: string): Promise<void> {
  if (!supabase) throw new AppError('configuration', 'Account deletion needs a Supabase connection.');
  // The generated Database type narrows `.from()` per table; the wipe is
  // intentionally table-driven, so it goes through a minimal untyped facade.
  const client = supabase as unknown as {
    from(table: string): { delete(): { eq(column: string, value: string): Promise<{ error: { message?: string } | null }> } };
  };
  for (const table of USER_TABLES) {
    const key = table === 'profiles' ? 'id' : 'user_id';
    const { error } = await client.from(table).delete().eq(key, userId);
    if (error) throw new AppError('network', `Couldn’t delete your data (${table}). Please try again.`, { cause: error });
  }
}

/**
 * Removes the auth user itself so the email can't sign back into a husk.
 * Requires the `delete-account` edge function (service-role) to be deployed.
 * Returns false when it cannot run — no session to authenticate with, the
 * function errors, or the user still exists afterwards — and the caller aborts
 * the whole deletion instead of wiping data while the sign-in survives.
 */
async function deleteAuthUser(): Promise<boolean> {
  if (!supabase) return false;
  try {
    // `functions.invoke` only attaches an Authorization header when
    // `getSession()` yields a token; with none the edge function rejects the
    // call with 401 and the sign-in silently survives. Resolve the token
    // ourselves and force a refresh when the stored session has expired.
    let token = (await supabase.auth.getSession()).data.session?.access_token ?? null;
    if (!token) token = (await supabase.auth.refreshSession()).data.session?.access_token ?? null;
    // Clerk sessions have no Supabase session: the Clerk JWT (third-party
    // auth) authenticates the edge function instead.
    if (!token) token = await getClerkToken();
    if (!token) {
      logger.error('Account deletion needs a valid Supabase session; none available.');
      return false;
    }
    const { error } = await supabase.functions.invoke('delete-account', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) throw error;
    // A 2xx from the function is not enough: a mis-deployed or partially
    // deployed version can report success without removing the user, and the
    // account then signs straight back in on the next Google flow. Confirm
    // the auth user is actually gone before destroying anything locally.
    return await verifyAuthUserDeleted(supabase);
  } catch (cause) {
    logger.error('Auth user deletion failed', cause);
    return false;
  }
}

/**
 * Asks the auth server whether the user still exists. Uses the stored access
 * token directly: after the auth user is deleted, `getUser()` returns an
 * error (the subject no longer resolves), which counts as deleted. Only an
 * explicit surviving user — or a request that could not be verified at all
 * (offline) — blocks the deletion, so the caller aborts safely: a retried
 * deletion is cheap; wiping local data over an unconfirmed deletion is not.
 * A deletion that really succeeded but failed verification self-heals on the
 * next launch, when hydrateSession sweeps the dead session.
 */
export async function verifyAuthUserDeleted(client: typeof supabase): Promise<boolean> {
  if (!client?.auth?.getUser) return true; // no way to ask; trust the function's success
  try {
    const { data, error } = await client.auth.getUser();
    if (data.user) return false; // still there — abort
    if (error && isNetworkAuthError(error)) return false; // could not verify
    return true; // user no longer resolvable server-side
  } catch {
    return false; // could not verify — abort and let the user retry
  }
}

/**
 * Signs out after the auth user has been deleted server-side. Because the
 * refresh token is already dead, both `signOut()` calls can fail on the
 * refresh error *before* removing the stored session — which is exactly what
 * left a deleted account's session behind to sign the user back in on next
 * launch. So, after the best-effort SDK sign-outs, every auth key under the
 * Supabase storage prefix (session, user, PKCE verifiers) is swept directly to
 * guarantee nothing survives.
 */
export async function signOutAfterAccountDeletion(
  client: typeof supabase,
  storagePrefix: string | null = supabaseAuthStoragePrefix(),
): Promise<void> {
  if (!client) return;
  // Revoke the refresh token server-side first, best effort: once the auth
  // user is gone this call reports an error, and that error must not skip the
  // local wipe below.
  await client.auth.signOut().catch(() => undefined);
  // Always drop the stored session as a separate step. `signOut()` bails out
  // before touching storage on some session errors.
  await client.auth.signOut({ scope: 'local' }).catch(() => undefined);
  // Belt and braces: sweep every auth key by prefix so a deleted account's
  // session can never linger and sign the user straight back in.
  if (storagePrefix) {
    const keys = (await AsyncStorage.getAllKeys().catch(() => [] as string[])).filter((key) => key.startsWith(storagePrefix));
    if (keys.length) await AsyncStorage.multiRemove([...keys]).catch(() => undefined);
  }
}

function defaultDeps(): DeleteAccountDeps {
  return {
    deleteRemoteUserData,
    deleteAuthUser,
    resetLocalData: async () => {
      // clearDeviceLibrary prefers a full file reset but falls back to a SQL
      // sweep, so a stale account_binding can never survive to block the next
      // account created on this device ("linked to another account").
      await clearDeviceLibrary();
      // Recreate the empty schema immediately so the app never runs
      // against a missing file.
      await getDatabase().catch(() => undefined);
    },
    cancelLocalNotifications: () => Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined).then(() => undefined),
    clearCaches: () => {
      queryClient.clear();
      return Promise.resolve();
    },
    signOut: () => signOutAfterAccountDeletion(supabase),
  };
}

export interface DeleteAccountResult {
  /** Always true: `deleteAccount` throws instead of returning when the server-side sign-in removal could not run. */
  authDeleted: boolean;
}

export async function deleteAccount(userId: string, deps: DeleteAccountDeps = defaultDeps()): Promise<DeleteAccountResult> {
  // Deleting the auth user is the authoritative step — every server row
  // cascades from auth.users. If it cannot run, abort before destroying
  // anything so the user never ends up with their data wiped while the
  // sign-in itself survives (the old "Data deleted, sign-in remains" state).
  const authDeleted = await deps.deleteAuthUser();
  if (!authDeleted) {
    throw new AppError(
      'network',
      'Couldn’t delete your account on the server. Nothing was changed — please check your connection and try again.'
    );
  }
  // The cascade already removed the server rows; this only sweeps anything
  // without a foreign key. Everything below is best-effort: the account is
  // gone, so a hiccup here must not be reported as a failed deletion.
  //
  // Remember the deletion FIRST, before any best-effort local step: even if
  // the app is killed mid-wipe, the flag lets the next sign-up recognise a
  // stale device binding as deletion leftovers and repair it silently, and it
  // lets a lost Google intent resolve as sign-in instead of auto-creating a
  // fresh husk for the deleted email.
  await markAccountDeleted(userId);
  await deps.deleteRemoteUserData(userId).catch((cause) => logger.warn('Post-deletion row sweep failed', cause));
  // Drop cached queries first so nothing reopens the database mid-reset.
  await deps.clearCaches().catch((cause) => logger.warn('Cache clear failed', cause));
  await deps.resetLocalData().catch((cause) => logger.warn('Local database reset failed', cause));
  await deps.cancelLocalNotifications().catch(() => undefined);
  await deps.signOut().catch((cause) => logger.warn('Sign-out after deletion failed', cause));
  return { authDeleted };
}
