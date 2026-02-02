/**
 * Structured logging with pino.
 * Provides consistent, leveled logging across all modules.
 * @module lib/logger
 */

import pino from 'pino';

/** Log levels available */
export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Logger options */
export interface LoggerOptions {
  /** Module name for context */
  name: string;
  /** Minimum log level (default: 'info', or 'debug' if DEBUG env is set) */
  level?: LogLevel;
}

// Determine log level from environment
const getLogLevel = (): LogLevel => {
  if (process.env.LOG_LEVEL) {
    return process.env.LOG_LEVEL as LogLevel;
  }
  if (process.env.DEBUG) {
    return 'debug';
  }
  return 'info';
};

// Base pino instance with pretty printing for development
const baseLogger = pino({
  level: getLogLevel(),
  transport: process.env.NODE_ENV === 'production' 
    ? undefined  // JSON output in production
    : {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'HH:MM:ss',
          ignore: 'pid,hostname',
        },
      },
});

/**
 * Create a child logger for a specific module.
 * 
 * @param name - Module name for context (e.g., 'fee-claiming', 'autonomy-loop')
 * @param options - Additional logger options
 * @returns Configured pino logger instance
 * 
 * @example
 * const log = createLogger('fee-claiming');
 * log.info({ token: '0x...' }, 'Checking fees');
 * log.error({ error: err.message }, 'Failed to claim');
 */
export function createLogger(name: string, options: Partial<LoggerOptions> = {}): pino.Logger {
  return baseLogger.child({ 
    module: name,
    ...options,
  });
}

/**
 * Default logger for quick logging without creating a child.
 * Prefer createLogger() for module-specific logging.
 */
export const logger = baseLogger;

/**
 * Log an operation with timing.
 * 
 * @param log - Logger instance
 * @param operation - Operation name
 * @param fn - Async function to execute
 * @returns Result of the function
 * 
 * @example
 * const result = await logTimed(log, 'fetchPrice', async () => {
 *   return await getEthPriceUsd();
 * });
 */
export async function logTimed<T>(
  log: pino.Logger,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  const start = Date.now();
  log.debug({ operation }, 'Starting operation');
  
  try {
    const result = await fn();
    const duration = Date.now() - start;
    log.info({ operation, durationMs: duration }, 'Operation completed');
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    log.error({ 
      operation, 
      durationMs: duration, 
      error: error instanceof Error ? error.message : String(error) 
    }, 'Operation failed');
    throw error;
  }
}

// Re-export pino types for convenience
export type { Logger } from 'pino';
