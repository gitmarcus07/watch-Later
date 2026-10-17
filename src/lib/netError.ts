/**
 * True when a transport failure (offline, timeout, reset socket) caused the
 * error rather than the server answering. Connectivity problems must never be
 * read as an auth verdict ("your account is gone") or a data verdict — a dead
 * network cannot disprove a session.
 *
 * Lives in its own module (no UI imports) so auth, storage, and sync code can
 * share it without pulling React Native components into their dependency
 * graph. (AuthRetryableFetchError messages read "Failed to fetch".)
 */
export function isNetworkAuthError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as { message?: string } | null)?.message ?? '');
  return /network|timeout|fetch|offline|econn|socket/i.test(message);
}
