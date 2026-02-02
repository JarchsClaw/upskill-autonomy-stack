/**
 * Tests for Zod validation schemas.
 * @module lib/schemas.test
 */

import { describe, it, expect } from 'vitest';
import {
  AddressSchema,
  Bytes32Schema,
  AmountStringSchema,
  TokenSymbolSchema,
  TradeParamsSchema,
  TransferParamsSchema,
  BalanceParamsSchema,
  validateTaskParams,
  safeValidateTaskParams,
} from './schemas.js';

describe('AddressSchema', () => {
  it('should accept valid lowercase address', () => {
    const result = AddressSchema.parse('0x1234567890123456789012345678901234567890');
    expect(result).toBe('0x1234567890123456789012345678901234567890');
  });

  it('should accept valid checksummed address', () => {
    const result = AddressSchema.parse('0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B');
    expect(result).toBe('0xAb5801a7D398351b8bE11C439e05C5B3259aeC9B');
  });

  it('should reject short address', () => {
    expect(() => AddressSchema.parse('0x1234')).toThrow();
  });

  it('should reject missing 0x prefix', () => {
    expect(() => AddressSchema.parse('1234567890123456789012345678901234567890')).toThrow();
  });

  it('should reject invalid hex characters', () => {
    expect(() => AddressSchema.parse('0xGGGG567890123456789012345678901234567890')).toThrow();
  });
});

describe('Bytes32Schema', () => {
  it('should accept valid bytes32', () => {
    const validBytes32 = '0x' + 'a'.repeat(64);
    expect(Bytes32Schema.parse(validBytes32)).toBe(validBytes32);
  });

  it('should reject short bytes32', () => {
    expect(() => Bytes32Schema.parse('0x' + 'a'.repeat(32))).toThrow();
  });

  it('should reject without 0x prefix', () => {
    expect(() => Bytes32Schema.parse('a'.repeat(64))).toThrow();
  });
});

describe('AmountStringSchema', () => {
  it('should accept integer string', () => {
    expect(AmountStringSchema.parse('100')).toBe('100');
  });

  it('should accept decimal string', () => {
    expect(AmountStringSchema.parse('0.5')).toBe('0.5');
  });

  it('should accept large decimal', () => {
    expect(AmountStringSchema.parse('1234.567890')).toBe('1234.567890');
  });

  it('should reject zero', () => {
    expect(() => AmountStringSchema.parse('0')).toThrow();
  });

  it('should reject negative', () => {
    expect(() => AmountStringSchema.parse('-5')).toThrow();
  });

  it('should reject non-numeric', () => {
    expect(() => AmountStringSchema.parse('abc')).toThrow();
  });

  it('should reject empty string', () => {
    expect(() => AmountStringSchema.parse('')).toThrow();
  });
});

describe('TokenSymbolSchema', () => {
  it('should accept valid uppercase symbol', () => {
    expect(TokenSymbolSchema.parse('ETH')).toBe('ETH');
  });

  it('should accept symbol with numbers', () => {
    expect(TokenSymbolSchema.parse('USDC')).toBe('USDC');
  });

  it('should reject lowercase', () => {
    expect(() => TokenSymbolSchema.parse('eth')).toThrow();
  });

  it('should reject too long symbol', () => {
    expect(() => TokenSymbolSchema.parse('VERYLONGSYMBOL')).toThrow();
  });

  it('should reject empty string', () => {
    expect(() => TokenSymbolSchema.parse('')).toThrow();
  });
});

describe('TradeParamsSchema', () => {
  it('should accept valid trade params', () => {
    const result = TradeParamsSchema.parse({
      action: 'swap',
      token: 'ETH',
      amount: '0.5',
    });
    expect(result.action).toBe('swap');
    expect(result.token).toBe('ETH');
  });

  it('should accept with optional slippage', () => {
    const result = TradeParamsSchema.parse({
      action: 'buy',
      token: 'USDC',
      amount: '100',
      slippage: '0.5',
    });
    expect(result.slippage).toBe('0.5');
  });

  it('should reject invalid action', () => {
    expect(() => TradeParamsSchema.parse({
      action: 'invalid',
      token: 'ETH',
      amount: '1',
    })).toThrow();
  });

  it('should reject extra properties (strict)', () => {
    expect(() => TradeParamsSchema.parse({
      action: 'swap',
      token: 'ETH',
      amount: '1',
      malicious: 'payload',
    })).toThrow();
  });
});

describe('TransferParamsSchema', () => {
  it('should accept valid transfer params', () => {
    const result = TransferParamsSchema.parse({
      action: 'transfer',
      token: 'ETH',
      amount: '1.5',
      to: '0x1234567890123456789012345678901234567890',
    });
    expect(result.action).toBe('transfer');
    expect(result.to).toBe('0x1234567890123456789012345678901234567890');
  });

  it('should reject wrong action', () => {
    expect(() => TransferParamsSchema.parse({
      action: 'swap',
      token: 'ETH',
      amount: '1',
      to: '0x1234567890123456789012345678901234567890',
    })).toThrow();
  });

  it('should reject invalid address', () => {
    expect(() => TransferParamsSchema.parse({
      action: 'transfer',
      token: 'ETH',
      amount: '1',
      to: 'invalid',
    })).toThrow();
  });
});

describe('BalanceParamsSchema', () => {
  it('should accept minimal balance params', () => {
    const result = BalanceParamsSchema.parse({
      action: 'balance',
    });
    expect(result.action).toBe('balance');
  });

  it('should accept with optional token', () => {
    const result = BalanceParamsSchema.parse({
      action: 'balance',
      token: 'ETH',
    });
    expect(result.token).toBe('ETH');
  });

  it('should accept with optional wallet', () => {
    const result = BalanceParamsSchema.parse({
      action: 'balance',
      wallet: '0x1234567890123456789012345678901234567890',
    });
    expect(result.wallet).toBe('0x1234567890123456789012345678901234567890');
  });
});

describe('validateTaskParams', () => {
  it('should validate trade skill params', () => {
    const result = validateTaskParams('trade', {
      action: 'quote',
      token: 'ETH',
      amount: '0.01',
    });
    expect(result.action).toBe('quote');
  });

  it('should validate transfer skill params', () => {
    const result = validateTaskParams('transfer', {
      action: 'transfer',
      token: 'USDC',
      amount: '100',
      to: '0x1234567890123456789012345678901234567890',
    });
    expect((result as { to: string }).to).toBeDefined();
  });

  it('should validate balance skill params', () => {
    const result = validateTaskParams('balance', {
      action: 'balance',
    });
    expect(result.action).toBe('balance');
  });

  it('should pass through unknown skill params as object', () => {
    const params = { anyKey: 'anyValue' };
    const result = validateTaskParams('unknown', params);
    expect(result).toEqual(params);
  });

  it('should throw for non-object params on unknown skill', () => {
    expect(() => validateTaskParams('unknown', 'string')).toThrow('Params must be an object');
    expect(() => validateTaskParams('unknown', null)).toThrow('Params must be an object');
  });

  it('should throw on invalid params', () => {
    expect(() => validateTaskParams('trade', {
      action: 'invalid',
    })).toThrow();
  });
});

describe('safeValidateTaskParams', () => {
  it('should return success for valid params', () => {
    const result = safeValidateTaskParams('trade', {
      action: 'swap',
      token: 'ETH',
      amount: '1',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.action).toBe('swap');
    }
  });

  it('should return error for invalid params', () => {
    const result = safeValidateTaskParams('trade', {
      action: 'invalid',
      token: 'ETH',
      amount: '1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      // Zod v4 provides error message about invalid enum value
      expect(result.error.length).toBeGreaterThan(0);
    }
  });

  it('should return error for missing required fields', () => {
    const result = safeValidateTaskParams('trade', {
      action: 'swap',
      // missing token and amount
    });
    expect(result.success).toBe(false);
  });

  it('should not throw on any input', () => {
    // These should all return error results, not throw
    const r1 = safeValidateTaskParams('trade', null);
    expect(r1.success).toBe(false);
    
    const r2 = safeValidateTaskParams('trade', undefined);
    expect(r2.success).toBe(false);
    
    const r3 = safeValidateTaskParams('trade', 'string');
    expect(r3.success).toBe(false);
    
    const r4 = safeValidateTaskParams('trade', 123);
    expect(r4.success).toBe(false);
  });
});
