type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const enabled = typeof __DEV__ !== 'undefined' && __DEV__;

function write(level: LogLevel, message: string, context?: unknown) {
  if (!enabled && level !== 'error') return;
  const output = `[Watch Later] ${message}`;
  if (level === 'error') console.error(output, context ?? '');
  else if (level === 'warn') console.warn(output, context ?? '');
  else if (level === 'info') console.info(output, context ?? '');
  else console.debug(output, context ?? '');
}

export const logger = {
  debug: (message: string, context?: unknown) => write('debug', message, context),
  info: (message: string, context?: unknown) => write('info', message, context),
  warn: (message: string, context?: unknown) => write('warn', message, context),
  error: (message: string, context?: unknown) => write('error', message, context),
};
