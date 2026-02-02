/**
 * Input validation utilities.
 * Validates addresses, amounts, and other inputs before use.
 */

import { isAddress, type Address } from 'viem';

/**
 * Validate an Ethereum address.
 * @throws Error if address is invalid
 */
export function validateAddress(input: string | undefined, name: string): Address {
  if (!input) {
    throw new Error(`${name} is required`);
  }
  
  if (!isAddress(input)) {
    throw new Error(`Invalid ${name}: "${input}". Must be a valid Ethereum address (0x + 40 hex chars).`);
  }
  
  return input as Address;
}

/**
 * Validate a required environment variable.
 * @throws Error if not set
 */
export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/**
 * Validate a positive number amount.
 * @throws Error if amount is invalid or non-positive
 */
export function validateAmount(input: string | number | undefined, name: string): number {
  if (input === undefined || input === '') {
    throw new Error(`${name} is required`);
  }
  
  const amount = typeof input === 'string' ? parseFloat(input) : input;
  
  if (isNaN(amount)) {
    throw new Error(`Invalid ${name}: "${input}". Must be a valid number.`);
  }
  
  if (amount <= 0) {
    throw new Error(`${name} must be positive, got: ${amount}`);
  }
  
  return amount;
}

/**
 * Validate a bigint amount.
 * @throws Error if amount is non-positive
 */
export function validateBigIntAmount(amount: bigint, name: string): bigint {
  if (amount <= 0n) {
    throw new Error(`${name} must be positive, got: ${amount}`);
  }
  return amount;
}

/**
 * Parse and validate a date string.
 * @throws Error if date is invalid
 */
export function validateDate(input: string, name: string): Date {
  const date = new Date(input);
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid ${name} date format: "${input}"`);
  }
  return date;
}

/**
 * Validate that a value is one of the allowed options.
 */
export function validateOption<T>(
  input: T,
  options: readonly T[],
  name: string
): T {
  if (!options.includes(input)) {
    throw new Error(`Invalid ${name}: "${input}". Must be one of: ${options.join(', ')}`);
  }
  return input;
}
