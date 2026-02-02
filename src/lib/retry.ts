/**
 * Retry logic for network operations.
 * Handles transient failures with exponential backoff.
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  retries?: number;
  /** Initial delay in milliseconds (default: 1000) */
  delayMs?: number;
  /** Backoff multiplier (default: 2) */
  backoff?: number;
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelayMs?: number;
  /** Optional callback on each retry */
  onRetry?: (error: Error, attempt: number) => void;
}

/**
 * Execute a function with retry logic.
 * Uses exponential backoff for transient failures.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    retries = 3,
    delayMs = 1000,
    backoff = 2,
    maxDelayMs = 30000,
    onRetry,
  } = options;

  let lastError: Error = new Error('No attempts made');

  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt > retries) {
        break;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(delayMs * Math.pow(backoff, attempt - 1), maxDelayMs);

      if (onRetry) {
        onRetry(lastError, attempt);
      }

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Execute a fetch request with retry logic.
 * Automatically retries on 5xx errors and network failures.
 */
export async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  retryOptions: RetryOptions = {}
): Promise<T> {
  return withRetry(async () => {
    const response = await fetch(url, options);

    if (!response.ok) {
      const text = await response.text();
      
      // Only retry on server errors (5xx)
      if (response.status >= 500) {
        throw new Error(`Server error ${response.status}: ${text}`);
      }
      
      // Don't retry client errors (4xx)
      throw new Error(`HTTP ${response.status}: ${text}`);
    }

    return response.json() as Promise<T>;
  }, {
    ...retryOptions,
    onRetry: (error, attempt) => {
      console.log(`Retry ${attempt}: ${error.message}`);
      retryOptions.onRetry?.(error, attempt);
    },
  });
}

/**
 * Recoverable error class for errors that should be caught and logged,
 * but not crash the application.
 */
export class RecoverableError extends Error {
  constructor(message: string, public readonly cause?: Error) {
    super(message);
    this.name = 'RecoverableError';
  }
}

/**
 * Check if an error is recoverable (should continue operation).
 */
export function isRecoverable(error: unknown): error is RecoverableError {
  return error instanceof RecoverableError;
}
