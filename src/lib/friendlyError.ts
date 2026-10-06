import { AppError } from '@/domain/errors/AppError';
import { CatalogError } from '@/domain/errors/CatalogError';

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
  if (error instanceof Error && /network|timeout|fetch|offline|econn|socket/i.test(error.message)) {
    return 'You appear to be offline. Your local changes are safe and will sync when you are back online.';
  }
  return 'Something went wrong. Your local data is safe — please try again.';
}
