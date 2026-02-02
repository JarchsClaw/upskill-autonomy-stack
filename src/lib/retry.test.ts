/**
 * Tests for retry utilities.
 * @module lib/retry.test
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { withRetry, fetchWithRetry, RecoverableError, isRecoverable, NonRetryableError, isNonRetryable } from './retry.js';

describe('withRetry', () => {
  it('should return result on immediate success', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and eventually succeed', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    // Use short delays for test speed
    const result = await withRetry(fn, { retries: 3, delayMs: 5 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max retries exceeded', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(withRetry(fn, { retries: 2, delayMs: 5 }))
      .rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3); // Initial + 2 retries
  });

  it('should apply exponential backoff', async () => {
    const delays: number[] = [];
    const startTime = Date.now();
    
    const fn = vi.fn()
      .mockImplementation(() => {
        delays.push(Date.now() - startTime);
        if (delays.length < 3) {
          return Promise.reject(new Error('fail'));
        }
        return Promise.resolve('ok');
      });

    const result = await withRetry(fn, { 
      retries: 3, 
      delayMs: 10, 
      backoff: 2 
    });
    
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
    // Verify delays are increasing (backoff)
    expect(delays[1]).toBeGreaterThan(delays[0]);
    expect(delays[2]).toBeGreaterThan(delays[1]);
  });

  it('should call onRetry callback', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('first fail'))
      .mockRejectedValueOnce(new Error('second fail'))
      .mockResolvedValue('ok');

    await withRetry(fn, { 
      retries: 3, 
      delayMs: 5,
      onRetry 
    });

    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenNthCalledWith(1, expect.objectContaining({ message: 'first fail' }), 1);
    expect(onRetry).toHaveBeenNthCalledWith(2, expect.objectContaining({ message: 'second fail' }), 2);
  });

  it('should convert non-Error throws to Error', async () => {
    const fn = vi.fn().mockRejectedValue('string error');
    await expect(withRetry(fn, { retries: 0 })).rejects.toThrow('string error');
  });
});

describe('fetchWithRetry', () => {
  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should return JSON on successful response', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ data: 'test' }),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    const result = await fetchWithRetry<{ data: string }>('https://api.example.com/data');
    
    expect(result).toEqual({ data: 'test' });
    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/data', {});
  });

  it('should retry on 5xx errors', async () => {
    const mockFailResponse = {
      ok: false,
      status: 503,
      text: vi.fn().mockResolvedValue('Service Unavailable'),
    };
    const mockSuccessResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true }),
    };

    (global.fetch as any)
      .mockResolvedValueOnce(mockFailResponse)
      .mockResolvedValueOnce(mockSuccessResponse);

    // Use very short delay for test speed
    const result = await fetchWithRetry('https://api.example.com/data', {}, { retries: 2, delayMs: 10 });
    
    expect(result).toEqual({ success: true });
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('should NOT retry on 4xx errors', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      text: vi.fn().mockResolvedValue('Bad Request'),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await expect(fetchWithRetry('https://api.example.com/data', {}, { retries: 3 }))
      .rejects.toThrow('HTTP 400: Bad Request');
    
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should NOT retry on 401 Unauthorized', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      text: vi.fn().mockResolvedValue('Unauthorized'),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await expect(fetchWithRetry('https://api.example.com/data'))
      .rejects.toThrow('HTTP 401: Unauthorized');
    
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('should pass request options to fetch', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({}),
    };
    (global.fetch as any).mockResolvedValue(mockResponse);

    await fetchWithRetry('https://api.example.com/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });

    expect(global.fetch).toHaveBeenCalledWith('https://api.example.com/data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test: true }),
    });
  });
});

describe('RecoverableError', () => {
  it('should have correct name', () => {
    const error = new RecoverableError('test error');
    expect(error.name).toBe('RecoverableError');
  });

  it('should have correct message', () => {
    const error = new RecoverableError('test message');
    expect(error.message).toBe('test message');
  });

  it('should store cause', () => {
    const cause = new Error('original error');
    const error = new RecoverableError('wrapped', cause);
    expect(error.cause).toBe(cause);
  });

  it('should be instance of Error', () => {
    const error = new RecoverableError('test');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('isRecoverable', () => {
  it('should return true for RecoverableError', () => {
    const error = new RecoverableError('test');
    expect(isRecoverable(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('test');
    expect(isRecoverable(error)).toBe(false);
  });

  it('should return false for string', () => {
    expect(isRecoverable('error string')).toBe(false);
  });

  it('should return false for null', () => {
    expect(isRecoverable(null)).toBe(false);
  });

  it('should return false for undefined', () => {
    expect(isRecoverable(undefined)).toBe(false);
  });
});

describe('NonRetryableError', () => {
  it('should have correct name', () => {
    const error = new NonRetryableError('test');
    expect(error.name).toBe('NonRetryableError');
  });

  it('should have correct message', () => {
    const error = new NonRetryableError('client error');
    expect(error.message).toBe('client error');
  });

  it('should be instance of Error', () => {
    const error = new NonRetryableError('test');
    expect(error).toBeInstanceOf(Error);
  });
});

describe('isNonRetryable', () => {
  it('should return true for NonRetryableError', () => {
    const error = new NonRetryableError('test');
    expect(isNonRetryable(error)).toBe(true);
  });

  it('should return false for regular Error', () => {
    const error = new Error('test');
    expect(isNonRetryable(error)).toBe(false);
  });

  it('should return false for RecoverableError', () => {
    const error = new RecoverableError('test');
    expect(isNonRetryable(error)).toBe(false);
  });
});

describe('withRetry NonRetryable', () => {
  it('should NOT retry NonRetryableError', async () => {
    const fn = vi.fn().mockRejectedValue(new NonRetryableError('client error'));

    await expect(withRetry(fn, { retries: 3, delayMs: 100 }))
      .rejects.toThrow('client error');
    
    // Should only be called once - no retries
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
