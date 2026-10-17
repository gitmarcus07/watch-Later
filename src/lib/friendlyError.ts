import { AppError } from '@/domain/errors/AppError';
import { CatalogError } from '@/domain/errors/CatalogError';
import { isNetworkAuthError } from '@/lib/netError';
import { showDialogUnlessQueued } from '@/components/feedback/AppDialog';

/**
 * Converts any thrown value into a safe, user-facing message.
 * Never leaks raw technical details (HTTP bodies, SQL, stack text).
 */
export function friendlyErrorMessage(error: unknown): string {
  if (error instanceof CatalogError) return error.userMessage;
  if (error instanceof AppError) {
    switch (error.kind) {
      case 'network':
        return 'You appear to be offline. Your local changes are safe and will sync when you are back online.';
      case 'authentication':
        return 'Your account session needs attention. Sign in again to keep syncing.';
      case 'database':
        return 'Your local library could not be updated. Your data is safe — please try again.';
      case 'configuration':
        return 'This feature is not configured on this device yet.';
      case 'validation':
      case 'catalog':
        return error.message;
      case 'unknown':
      default:
        return 'Something went wrong. Your local data is safe — please try again.';
    }
  }
  if (error instanceof Error && isNetworkAuthError(error)) {
    return 'You appear to be offline. Your local changes are safe and will sync when you are back online.';
  }
  return 'Something went wrong. Your local data is safe — please try again.';
}

/**
 * Surfaces any failure as a modal prompt. Every auth, sync, and account
 * error must reach the user through this helper (or an equivalent dialog) —
 * a silent catch or a line of red text is a bug. Cancels are silent by
 * convention: callers check for them before calling.
 *
 * AppError/CatalogError messages are authored as user-safe copy, so they are
 * shown verbatim (that is the specific text the user needs to act on);
 * anything else goes through `friendlyErrorMessage` so raw internals never
 * reach the screen.
 */
export function showFriendlyError(error: unknown, title: string, options?: { message?: string; actionLabel?: string }): Promise<boolean> {
  const message = options?.message
    ?? (error instanceof CatalogError ? error.userMessage
      : error instanceof AppError && error.message.trim() ? error.message
        : friendlyErrorMessage(error));
  // Two triggers (manual sync + auto-sync, auth screen + auth listener) can
  // fail with the same error in the same tick — never stack identical prompts.
  return showDialogUnlessQueued({
    type: 'error',
    title,
    message,
    ...(options?.actionLabel ? { primaryAction: { label: options.actionLabel } } : {}),
  });
}
