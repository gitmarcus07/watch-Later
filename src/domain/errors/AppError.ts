export type AppErrorKind = 'network' | 'database' | 'authentication' | 'validation' | 'configuration' | 'catalog' | 'unknown';

export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'AppError';
  }
}

export function toAppError(error: unknown): AppError {
  return error instanceof AppError
    ? error
    : new AppError('unknown', 'Something went wrong. Please try again.', { cause: error });
}
