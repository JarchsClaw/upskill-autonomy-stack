/**
 * Zod schemas for input validation.
 * Provides runtime type safety for external inputs (API requests, user params).
 * @module lib/schemas
 */

import { z } from 'zod';

/**
 * Ethereum address schema.
 * Validates 0x-prefixed 40-character hex string.
 */
export const AddressSchema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/, 'Invalid Ethereum address format')
  .transform((val) => val as `0x${string}`);

/**
 * Hex bytes schema (32 bytes).
 */
export const Bytes32Schema = z
  .string()
  .regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid bytes32 format');

/**
 * Positive number string (for amounts).
 */
export const AmountStringSchema = z
  .string()
  .regex(/^\d+\.?\d*$/, 'Amount must be a positive decimal number')
  .refine((val) => parseFloat(val) > 0, 'Amount must be greater than 0');

/**
 * Token symbol schema (1-10 uppercase letters).
 */
export const TokenSymbolSchema = z
  .string()
  .min(1)
  .max(10)
  .regex(/^[A-Z0-9]+$/, 'Token symbol must be uppercase alphanumeric');

/**
 * Task priority levels.
 */
export const PrioritySchema = z.enum(['low', 'normal', 'high']).default('normal');

/**
 * Trade action schema for gateway requests.
 */
export const TradeParamsSchema = z.object({
  action: z.enum(['quote', 'swap', 'buy', 'sell']),
  token: TokenSymbolSchema,
  amount: AmountStringSchema,
  slippage: z.string().regex(/^\d+\.?\d*$/).optional(),
}).strict();

/**
 * Transfer action schema.
 */
export const TransferParamsSchema = z.object({
  action: z.literal('transfer'),
  token: TokenSymbolSchema,
  amount: AmountStringSchema,
  to: AddressSchema,
}).strict();

/**
 * Balance check schema.
 */
export const BalanceParamsSchema = z.object({
  action: z.literal('balance'),
  token: TokenSymbolSchema.optional(),
  wallet: AddressSchema.optional(),
}).strict();

/**
 * Generic task params - union of all supported schemas.
 */
export const TaskParamsSchema = z.union([
  TradeParamsSchema,
  TransferParamsSchema,
  BalanceParamsSchema,
]);

/**
 * Complete task request schema.
 */
export const TaskRequestSchema = z.object({
  skill: z.string().min(1).max(100),
  params: z.record(z.string(), z.unknown()), // Validated separately per skill
  agentWallet: AddressSchema,
  priority: PrioritySchema,
});

/** Generic object schema for unknown skills */
const GenericObjectSchema = z.record(z.string(), z.unknown());

/**
 * Validate task params based on skill type.
 * Returns validated params or throws ZodError.
 */
export function validateTaskParams(
  skill: string,
  params: unknown
): z.infer<typeof TaskParamsSchema> | Record<string, unknown> {
  // Route to appropriate schema based on skill
  switch (skill) {
    case 'trade':
    case 'swap':
      return TradeParamsSchema.parse(params);
    case 'transfer':
      return TransferParamsSchema.parse(params);
    case 'balance':
      return BalanceParamsSchema.parse(params);
    default:
      // For unknown skills, just validate it's an object
      if (typeof params !== 'object' || params === null) {
        throw new Error('Params must be an object');
      }
      return params as Record<string, unknown>;
  }
}

/**
 * Safe parse that returns result object instead of throwing.
 */
export function safeValidateTaskParams(skill: string, params: unknown) {
  try {
    const validated = validateTaskParams(skill, params);
    return { success: true as const, data: validated };
  } catch (error) {
    // Handle Zod v4 errors (uses issues instead of errors)
    if (error && typeof error === 'object' && 'issues' in error) {
      const zodError = error as { issues: Array<{ path: (string | number)[]; message: string }> };
      const errorMsg = zodError.issues
        .map(e => `${e.path.join('.')}: ${e.message}`)
        .join(', ');
      return { success: false as const, error: errorMsg };
    }
    // Handle regular errors
    if (error instanceof Error) {
      return { success: false as const, error: error.message };
    }
    return { success: false as const, error: 'Unknown validation error' };
  }
}

// Type exports
export type TaskParams = z.infer<typeof TaskParamsSchema>;
export type TaskRequest = z.infer<typeof TaskRequestSchema>;
export type TradeParams = z.infer<typeof TradeParamsSchema>;
export type TransferParams = z.infer<typeof TransferParamsSchema>;
export type BalanceParams = z.infer<typeof BalanceParamsSchema>;
