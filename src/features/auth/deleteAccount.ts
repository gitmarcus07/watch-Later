import { AppError } from '@/domain/errors/AppError';
import { supabase } from '@/data/remote/supabase/client';
import { getDatabase, resetLocalDatabase } from '@/data/local/database/database';
import { Notifications } from '@/lib/notifications';
import { queryClient } from '@/lib/query/queryClient';
import { logger } from '@/lib/logger';

/**
 * Delete-account (GitHub-style): the user types their account email to
 * confirm, then every row they own is removed from Supabase, the local
 * database is wiped, scheduled reminders are cancelled, and they are signed
 * out. Remote wipe runs first — if it fails, nothing local is touched and
 * the account stays signed in.
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
 * Requires the `delete-account` edge function (service-role) to be
 * deployed. Returns false when it isn't — the data wipe above is what
 * guarantees the user's data is gone either way, but the caller must tell
 * the user the sign-in itself survived so they aren't surprised later.
 */
async function deleteAuthUser(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) throw error;
    return true;
  } catch (cause) {
    logger.error('Auth user deletion failed (edge function unavailable?)', cause);
    return false;
  }
}

function defaultDeps(): DeleteAccountDeps {
  return {
    deleteRemoteUserData,
    deleteAuthUser,
    resetLocalData: async () => {
      await resetLocalDatabase();
      // Recreate the empty schema immediately so the app never runs
      // against a missing file.
      await getDatabase();
    },
    cancelLocalNotifications: () => Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined).then(() => undefined),
    clearCaches: () => {
      queryClient.clear();
      return Promise.resolve();
    },
    signOut: async () => {
      if (!supabase) return;
      const { error } = await supabase.auth.signOut();
      if (error) throw new AppError('authentication', 'Couldn’t sign out after deletion.', { cause: error });
    },
  };
}

export interface DeleteAccountResult {
  /** False when the server-side sign-in removal didn't run (edge function not deployed). Data is still wiped and the user is still signed out. */
  authDeleted: boolean;
}

export async function deleteAccount(userId: string, deps: DeleteAccountDeps = defaultDeps()): Promise<DeleteAccountResult> {
  await deps.deleteRemoteUserData(userId);
  const authDeleted = await deps.deleteAuthUser();
  await deps.resetLocalData();
  await deps.cancelLocalNotifications().catch(() => undefined);
  await deps.clearCaches().catch(() => undefined);
  await deps.signOut();
  return { authDeleted };
}
