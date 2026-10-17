/**
 * Copy shown when an account signed in fine but this device's local library
 * could not be prepared. Lives in its own module (no auth, sync, or UI
 * imports) so every surface that can raise the failure — the auth screens, the
 * auth listener, manual sync, auto-sync — can share the exact same title and
 * text without creating an import cycle through SupabaseAuthService.
 */
export const LOCAL_LIBRARY_PREP_NOTICE =
  "Couldn't prepare this account's local library. You're still signed in and your library is safe in your account — tap Sync now to try again.";

/** Title used for every prompt about that failure (dedupe needs an exact pair). */
export const LOCAL_LIBRARY_PREP_TITLE = 'Your library is still safe';

/**
 * True for the raw `SqliteWatchStateRepository` error that backs the notice —
 * the repository throws the short form, the prompt shows the full copy.
 */
export function isLocalLibraryPrepFailure(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String((cause as { message?: string } | null)?.message ?? '');
  return message.includes("Couldn't prepare this account's local library.");
}
