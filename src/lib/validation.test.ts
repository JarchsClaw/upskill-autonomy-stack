/**
 * Tests for validation utilities.
 * @module lib/validation.test
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  validateAddress,
  requireEnv,
  validateAmount,
  validateBigIntAmount,
  validateDate,
  validateOption,
} from './validation.js';

describe('validateAddress', () => {
  const validAddress = '0x1234567890123456789012345678901234567890';
  const checksumAddress = '0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B';

  it('should accept valid lowercase address', () => {
    expect(validateAddress(validAddress, 'test')).toBe(validAddress);
  });

  it('should accept valid checksummed address', () => {
    expect(validateAddress(checksumAddress, 'test')).toBe(checksumAddress);
  });

  it('should throw on undefined input', () => {
    expect(() => validateAddress(undefined, 'wallet')).toThrow('wallet is required');
  });

  it('should throw on empty string', () => {
    expect(() => validateAddress('', 'wallet')).toThrow('wallet is required');
  });

  it('should throw on short address', () => {
    expect(() => validateAddress('0x1234', 'token')).toThrow('Invalid token');
  });

  it('should throw on non-hex characters', () => {
    expect(() => validateAddress('0xGGGG567890123456789012345678901234567890', 'contract'))
      .toThrow('Invalid contract');
  });

  it('should throw on missing 0x prefix', () => {
    expect(() => validateAddress('1234567890123456789012345678901234567890', 'address'))
      .toThrow('Invalid address');
  });
});

describe('requireEnv', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should return value when env var exists', () => {
    process.env.TEST_VAR = 'test_value';
    expect(requireEnv('TEST_VAR')).toBe('test_value');
  });

  it('should throw when env var is missing', () => {
    delete process.env.MISSING_VAR;
    expect(() => requireEnv('MISSING_VAR')).toThrow('Missing required environment variable: MISSING_VAR');
  });

  it('should throw when env var is empty string', () => {
    process.env.EMPTY_VAR = '';
    expect(() => requireEnv('EMPTY_VAR')).toThrow('Missing required environment variable: EMPTY_VAR');
  });
});

describe('validateAmount', () => {
  it('should accept valid number', () => {
    expect(validateAmount(100, 'amount')).toBe(100);
  });

  it('should accept valid string number', () => {
    expect(validateAmount('50.5', 'amount')).toBe(50.5);
  });

  it('should accept valid decimal', () => {
    expect(validateAmount(0.001, 'amount')).toBe(0.001);
  });

  it('should throw on undefined', () => {
    expect(() => validateAmount(undefined, 'credits')).toThrow('credits is required');
  });

  it('should throw on empty string', () => {
    expect(() => validateAmount('', 'credits')).toThrow('credits is required');
  });

  it('should throw on non-numeric string', () => {
    expect(() => validateAmount('abc', 'amount')).toThrow('Invalid amount');
  });

  it('should throw on zero', () => {
    expect(() => validateAmount(0, 'amount')).toThrow('must be positive');
  });

  it('should throw on negative', () => {
    expect(() => validateAmount(-5, 'amount')).toThrow('must be positive');
  });

  it('should throw on NaN', () => {
    expect(() => validateAmount(NaN, 'amount')).toThrow('Invalid amount');
  });
});

describe('validateBigIntAmount', () => {
  it('should accept valid positive bigint', () => {
    expect(validateBigIntAmount(100n, 'amount')).toBe(100n);
  });

  it('should accept large bigint', () => {
    const large = 1000000000000000000n; // 1 ETH in wei
    expect(validateBigIntAmount(large, 'amount')).toBe(large);
  });

  it('should throw on zero', () => {
    expect(() => validateBigIntAmount(0n, 'balance')).toThrow('must be positive');
  });

  it('should throw on negative', () => {
    expect(() => validateBigIntAmount(-1n, 'balance')).toThrow('must be positive');
  });
});

describe('validateDate', () => {
  it('should accept valid ISO date string', () => {
    const date = validateDate('2024-01-15', 'startDate');
    expect(date).toBeInstanceOf(Date);
    expect(date.getFullYear()).toBe(2024);
  });

  it('should accept valid datetime string', () => {
    const date = validateDate('2024-01-15T10:30:00Z', 'timestamp');
    expect(date).toBeInstanceOf(Date);
  });

  it('should accept valid date object string', () => {
    const now = new Date().toISOString();
    const date = validateDate(now, 'now');
    expect(date).toBeInstanceOf(Date);
  });

  it('should throw on invalid date', () => {
    expect(() => validateDate('not-a-date', 'date')).toThrow('Invalid date date format');
  });

  it('should throw on empty string', () => {
    expect(() => validateDate('', 'date')).toThrow('Invalid date date format');
  });
});

describe('validateOption', () => {
  const validOptions = ['a', 'b', 'c'] as const;

  it('should accept valid option', () => {
    expect(validateOption('a', validOptions, 'choice')).toBe('a');
  });

  it('should accept any valid option', () => {
    expect(validateOption('b', validOptions, 'choice')).toBe('b');
    expect(validateOption('c', validOptions, 'choice')).toBe('c');
  });

  it('should throw on invalid option', () => {
    expect(() => validateOption('d' as any, validOptions, 'choice'))
      .toThrow('Invalid choice: "d". Must be one of: a, b, c');
  });

  it('should work with number options', () => {
    const numOptions = [1, 2, 3] as const;
    expect(validateOption(2, numOptions, 'level')).toBe(2);
    expect(() => validateOption(4 as any, numOptions, 'level'))
      .toThrow('Invalid level: "4". Must be one of: 1, 2, 3');
  });
});
